jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn()
}));

jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn()
  }
}));

jest.mock('http', () => ({
  createServer: jest.fn()
}));

const http = require('http') as { createServer: jest.Mock };
const fetch = require('node-fetch').default as jest.Mock;
const { shell } = require('electron') as { shell: { openExternal: jest.Mock } };

const { ShopifyOAuth } = require('../../src/main/oauth') as {
  ShopifyOAuth: new (options: {
    storeUrl: string;
    clientId: string;
    clientSecret: string;
  }) => {
    getAuthorizationUrl(): string;
    exchangeCodeForToken(code: string): Promise<string>;
    startOAuthFlow(): Promise<string>;
  };
};

type RequestHandler = (req: { url?: string }, res: MockResponse) => Promise<void>;

interface MockServer {
  listen: jest.Mock;
  on: jest.Mock;
  close: jest.Mock;
}

interface MockResponse {
  writeHead: jest.Mock;
  end: jest.Mock;
}

describe('ShopifyOAuth', () => {
  let requestHandler: RequestHandler;
  let errorHandler: ((error: Error) => void) | undefined;
  let mockServer: MockServer;

  function createOAuth() {
    return new ShopifyOAuth({
      storeUrl: 'test-shop.myshopify.com',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    });
  }

  function createResponse(): MockResponse {
    return {
      writeHead: jest.fn(),
      end: jest.fn()
    };
  }

  function getOpenedState(): string | null {
    const openedUrl = shell.openExternal.mock.calls.at(-1)?.[0];
    if (!openedUrl) {
      return null;
    }

    return new URL(openedUrl).searchParams.get('state');
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    errorHandler = undefined;

    mockServer = {
      listen: jest.fn((_port: number, callback?: () => void) => {
        callback?.();
        return mockServer;
      }),
      on: jest.fn((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          errorHandler = callback;
        }

        return mockServer;
      }),
      close: jest.fn()
    };

    http.createServer.mockImplementation((handler: RequestHandler) => {
      requestHandler = handler;
      return mockServer;
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('builds an authorization URL with Shopify OAuth parameters', () => {
    const oauth = createOAuth();

    const url = new URL(oauth.getAuthorizationUrl());

    expect(url.origin).toBe('https://test-shop.myshopify.com');
    expect(url.pathname).toBe('/admin/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope')).toBe('read_orders,read_products');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3456/callback');
    expect(url.searchParams.get('state')).toMatch(/^[a-f0-9]{32}$/);
  });

  test('exchanges an authorization code for an access token', async () => {
    const oauth = createOAuth();

    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-123' })
    });

    await expect(oauth.exchangeCodeForToken('auth-code')).resolves.toBe('token-123');

    expect(fetch).toHaveBeenCalledWith(
      'https://test-shop.myshopify.com/admin/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        })
      })
    );
  });

  test('throws when token exchange returns a non-ok response', async () => {
    const oauth = createOAuth();

    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    });

    await expect(oauth.exchangeCodeForToken('bad-code')).rejects.toThrow(
      'Token exchange failed: 401 - Unauthorized'
    );
  });

  test('throws when token exchange response is missing access_token', async () => {
    const oauth = createOAuth();

    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({})
    });

    await expect(oauth.exchangeCodeForToken('bad-code')).rejects.toThrow(
      'Token exchange response did not contain access_token'
    );
  });

  test('resolves after a successful OAuth callback', async () => {
    const oauth = createOAuth();
    const exchangeSpy = jest
      .spyOn(oauth, 'exchangeCodeForToken')
      .mockResolvedValue('access-token');

    const flowPromise = oauth.startOAuthFlow();
    const authUrl = new URL(shell.openExternal.mock.calls[0][0]);
    const state = authUrl.searchParams.get('state');
    const response = createResponse();

    await requestHandler(
      { url: `/callback?state=${state}&code=test-auth-code` },
      response
    );

    await expect(flowPromise).resolves.toBe('access-token');
    expect(exchangeSpy).toHaveBeenCalledWith('test-auth-code');
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'text/html; charset=utf-8' })
    );
    expect(mockServer.close).toHaveBeenCalled();
  });

  test('rejects OAuth callback when the state parameter is invalid', async () => {
    const oauth = createOAuth();

    const flowPromise = oauth.startOAuthFlow();
    const response = createResponse();

    await requestHandler(
      { url: '/callback?state=wrong-state&code=test-auth-code' },
      response
    );

    await expect(flowPromise).rejects.toThrow('Invalid state parameter - possible CSRF attack');
    expect(response.writeHead).toHaveBeenCalledWith(
      500,
      expect.objectContaining({ 'Content-Type': 'text/html; charset=utf-8' })
    );
    expect(mockServer.close).toHaveBeenCalled();
  });

  test('rejects OAuth callback when the authorization code is missing', async () => {
    const oauth = createOAuth();
    const response = createResponse();

    const flowPromise = oauth.startOAuthFlow();
    const state = getOpenedState();
    await requestHandler({ url: `/callback?state=${state}` }, response);

    await expect(flowPromise).rejects.toThrow('No authorization code received');
    expect(mockServer.close).toHaveBeenCalled();
  });

  test('rejects when Shopify returns an OAuth error in the callback', async () => {
    const oauth = createOAuth();
    const response = createResponse();

    const flowPromise = oauth.startOAuthFlow();
    const state = getOpenedState();
    await requestHandler(
      { url: `/callback?state=${state}&error=access_denied&error_description=user_cancelled` },
      response
    );

    await expect(flowPromise).rejects.toThrow('OAuth error: access_denied - user_cancelled');
    expect(mockServer.close).toHaveBeenCalled();
  });

  test('rejects when the callback server emits an error', async () => {
    const oauth = createOAuth();
    const flowPromise = oauth.startOAuthFlow();

    errorHandler?.(new Error('port already in use'));

    await expect(flowPromise).rejects.toThrow('port already in use');
  });

  test('times out if no OAuth callback arrives', async () => {
    const oauth = createOAuth();

    const flowPromise = oauth.startOAuthFlow();
    jest.advanceTimersByTime(5 * 60 * 1000);

    await expect(flowPromise).rejects.toThrow('OAuth flow timed out. Please try again.');
    expect(mockServer.close).toHaveBeenCalled();
  });
});