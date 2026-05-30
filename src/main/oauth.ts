import * as http from 'http';
import * as crypto from 'crypto';
import { URL, URLSearchParams } from 'url';
import fetch from 'node-fetch';
import { shell } from 'electron';

const OAUTH_CALLBACK_PORT = 3456;
const REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/callback`;

// =============================================================================
// Types
// =============================================================================

interface OAuthOptions {
  storeUrl: string;
  clientId: string;
  clientSecret: string;
}

type Server = http.Server;

// =============================================================================
// ShopifyOAuth Class
// =============================================================================

export class ShopifyOAuth {
  private readonly storeUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private server: Server | null = null;
  private state: string | null = null;

  constructor({ storeUrl, clientId, clientSecret }: OAuthOptions) {
    this.storeUrl = storeUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Generate a random state for CSRF protection
   */
  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Build the OAuth authorization URL
   */
  getAuthorizationUrl(): string {
    this.state = this.generateState();

    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'read_orders,read_products',
      redirect_uri: REDIRECT_URI,
      state: this.state,
    });

    return `https://${this.storeUrl}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    const url = `https://${this.storeUrl}/admin/oauth/access_token`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
      }).toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new Error('Token exchange response did not contain access_token');
    }

    return data.access_token;
  }

  /**
   * Start OAuth flow - opens browser and waits for callback
   */
  startOAuthFlow(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      this.server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_CALLBACK_PORT}`);
          
          if (url.pathname === '/callback') {
            // Parse query parameters
            interface CallbackQuery {
              error?: string;
              error_description?: string;
              state?: string;
              code?: string;
            }

            const query: CallbackQuery = {};
            url.searchParams.forEach((value, key) => {
              query[key as keyof CallbackQuery] = value;
            });

            // Check for error response
            if (query.error) {
              throw new Error(`OAuth error: ${query.error} - ${query.error_description || ''}`);
            }

            // Verify the state (CSRF protection)
            if (query.state !== this.state) {
              throw new Error('Invalid state parameter - possible CSRF attack');
            }

            // Get authorization code
            const code = query.code;
            if (!code) {
              throw new Error('No authorization code received');
            }

            // Exchange code for token
            console.log('Exchanging authorization code for access token...'); // code and secret never logged
            const accessToken = await this.exchangeCodeForToken(code);

            // Send success response to browser
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <title>Authorization Successful</title>
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                  }
                  .container {
                    text-align: center;
                    padding: 2rem;
                    background: rgba(255,255,255,0.1);
                    border-radius: 12px;
                  }
                  h1 { font-size: 2rem; margin-bottom: 1rem; }
                  p { font-size: 1.1rem; opacity: 0.9; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>✓ Authorization Successful!</h1>
                  <p>You can close this window and return to the app.</p>
                </div>
              </body>
              </html>
            `);

            // Close server and resolve
            this.stopServer();
            resolve(accessToken);
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (error: unknown) {
          console.error('OAuth callback error:', error);
          const message = error instanceof Error ? error.message : 'Unknown error';

          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>Authorization Failed</title>
              <style>
                body { 
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  margin: 0;
                  background: #ef4444;
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                  background: rgba(0,0,0,0.1);
                  border-radius: 12px;
                  max-width: 500px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>✗ Authorization Failed</h1>
                <p>${message}</p>
                <p>Please close this window and try again.</p>
              </div>
            </body>
            </html>
          `);

          this.stopServer();
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(error);
        }
      });

      // Start listening
      this.server.listen(OAUTH_CALLBACK_PORT, () => {
        console.log(`OAuth callback server listening on port ${OAUTH_CALLBACK_PORT}`);

        const authUrl = this.getAuthorizationUrl();
        console.log('Opening browser for authorization:', authUrl);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        shell.openExternal(authUrl);
      });

      this.server.on('error', (error: Error) => {
        console.error('OAuth server error:', error);
        reject(error);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.server) {
          this.stopServer();
          reject(new Error('OAuth flow timed out. Please try again.'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Stop the callback server
   */
  private stopServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// REDIRECT_URI is already declared at the top of the file.
