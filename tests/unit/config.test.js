/**
 * Unit Tests: Config Module
 *
 * These tests cover the configuration helpers in src/main/config.js.
 * They mock both the filesystem and Electron's app module.
 */

const fs = require('fs');
const path = require('path');

// We will mock fs and electron before requiring the module under test
jest.mock('fs');
jest.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name) => {
      if (name === 'userData') return '/tmp/test-user-data';
      return '/tmp';
    }
  }
}));

// Require after mocks
const config = require('../../src/main/config');

describe('Config Module', () => {
  const mockConfigPath = path.join('/tmp/test-user-data', 'config.json');

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no config file exists
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fs.writeFileSync.mockImplementation(() => {});
    fs.mkdirSync.mockImplementation(() => {});
  });

  test('getAccessToken returns null when no config exists', () => {
    expect(config.getAccessToken()).toBeNull();
  });

  test('saveAccessToken and getAccessToken round-trip', () => {
    config.saveAccessToken('test-token-123');
    // Simulate the file now existing with the saved data
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ accessToken: 'test-token-123' }));

    expect(config.getAccessToken()).toBe('test-token-123');
  });

  test('getStoreUrl falls back to environment variable', () => {
    process.env.SHOPIFY_STORE_URL = 'test-store.myshopify.com';
    expect(config.getStoreUrl()).toBe('test-store.myshopify.com');
    delete process.env.SHOPIFY_STORE_URL;
  });

  test('saveOAuthCredentials stores clientId and clientSecret', () => {
    config.saveOAuthCredentials('client-abc', 'secret-xyz');

    expect(fs.writeFileSync).toHaveBeenCalled();
    const writtenData = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(writtenData.clientId).toBe('client-abc');
    expect(writtenData.clientSecret).toBe('secret-xyz');
  });

  test('isConfigured returns true only when all required fields are present', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      storeUrl: 'test.myshopify.com',
      accessToken: 'token',
      clientId: 'id',
      clientSecret: 'secret'
    }));

    expect(config.isConfigured()).toBe(true);
  });

  test('isConfigured returns false when fields are missing', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      storeUrl: 'test.myshopify.com',
      accessToken: 'token'
      // missing clientId / clientSecret
    }));

    expect(config.isConfigured()).toBe(false);
  });

  test('hasOAuthCredentials works correctly', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      clientId: 'id-123',
      clientSecret: 'secret-456'
    }));

    expect(config.hasOAuthCredentials()).toBe(true);
  });

  test('saveAutoSyncSettings validates interval and saves correctly', () => {
    expect(() => {
      config.saveAutoSyncSettings(true, 10);
    }).not.toThrow();

    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.autoSyncEnabled).toBe(true);
    expect(written.autoSyncIntervalMinutes).toBe(10);
  });

  test('saveAutoSyncSettings throws on invalid interval', () => {
    expect(() => {
      config.saveAutoSyncSettings(true, 0);
    }).toThrow(/positive integer/);

    expect(() => {
      config.saveAutoSyncSettings(true, 'not-a-number');
    }).toThrow(/positive integer/);
  });

  test('clearCredentials removes access token', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      accessToken: 'to-be-deleted',
      storeUrl: 'test.myshopify.com'
    }));

    config.clearCredentials();

    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.accessToken).toBeUndefined();
    expect(written.storeUrl).toBe('test.myshopify.com');
  });
});