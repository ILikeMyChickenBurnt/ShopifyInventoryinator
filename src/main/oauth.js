const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const fetch = require('node-fetch');
const { shell } = require('electron');

const OAUTH_CALLBACK_PORT = 3456;
const REDIRECT_URI = `http://localhost:${OAUTH_CALLBACK_PORT}/callback`;

/**
 * OAuth flow for Shopify Admin API
 * Requires client ID and client secret
 */
class ShopifyOAuth {
  constructor(storeUrl, clientId, clientSecret) {
    this.storeUrl = storeUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.server = null;
    this.state = null;
  }

  /**
   * Generate a random state for CSRF protection
   */
  generateState() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Build the OAuth authorization URL
   */
  getAuthorizationUrl() {
    this.state = this.generateState();
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'read_orders,read_products',
      redirect_uri: REDIRECT_URI,
      state: this.state
    });

    return `https://${this.storeUrl}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    const url = `https://${this.storeUrl}/admin/oauth/access_token`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code
      }).toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Start OAuth flow - opens browser and waits for callback
   */
  startOAuthFlow() {
    return new Promise((resolve, reject) => {
      // Create callback server
      this.server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url, `http://localhost:${OAUTH_CALLBACK_PORT}`);
          
          if (url.pathname === '/callback') {
            // Parse query parameters
            const query = {};
            url.searchParams.forEach((value, key) => {
              query[key] = value;
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
            console.log('Exchanging authorization code for access token...');
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
        } catch (error) {
          console.error('OAuth callback error:', error);
          
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
                <p>${error.message}</p>
                <p>Please close this window and try again.</p>
              </div>
            </body>
            </html>
          `);

          this.stopServer();
          reject(error);
        }
      });

      // Start listening
      this.server.listen(OAUTH_CALLBACK_PORT, () => {
        console.log(`OAuth callback server listening on port ${OAUTH_CALLBACK_PORT}`);
        
        // Open browser to authorization URL
        const authUrl = this.getAuthorizationUrl();
        console.log('Opening browser for authorization:', authUrl);
        shell.openExternal(authUrl);
      });

      // Handle server errors
      this.server.on('error', (error) => {
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
  stopServer() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = { ShopifyOAuth, REDIRECT_URI };
