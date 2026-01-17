# Claude.md - AI Assistant Context

This document provides critical context for AI assistants (Claude, GPT, etc.) working on this codebase. **Read this before making any changes to authentication or Shopify integration.**

## ⚠️ CRITICAL: Authentication Method

### DO NOT USE: Legacy API Keys (Admin API access tokens)
- Shopify deprecated legacy "custom apps" created via Settings → Apps → Develop apps as of **January 2025**
- You **cannot** create new apps using the old Admin API access token method
- If you see suggestions to use `X-Shopify-Access-Token` with a static token from the Shopify admin, this is the **deprecated method**

### CORRECT: OAuth 2.0 Authorization Code Grant
This app uses OAuth 2.0 with:
- **Client ID** and **Client Secret** from the Dev Dashboard
- **Authorization Code flow** (NOT implicit, NOT PKCE)
- Scopes: `read_orders`, `read_products`
- Redirect URI: `http://localhost:3456/callback`

### Why NOT PKCE?
We investigated PKCE (Proof Key for Code Exchange) to avoid distributing client secrets, but:
- **Shopify's Admin API does NOT support PKCE** for custom/distributed apps
- PKCE is only available for embedded apps using Shopify's App Bridge
- The token exchange endpoint **requires** `client_secret` in the request body
- We confirmed this by testing and reading Shopify's documentation

## App Distribution Model

This app uses **Custom Distribution**:
- Created in the Shopify Dev Dashboard (dev.shopify.com)
- Distributed to specific merchants via install links
- **NOT** listed on the Shopify App Store
- Each merchant must have the app installed on their store AND have the Client ID/Secret

### Flow:
1. Developer creates app in Partner Dashboard
2. Developer configures scopes and requests protected customer data access
3. Developer generates install link for each merchant
4. Merchant clicks install link → app is installed on their store
5. Merchant runs desktop app → enters Client ID and Client Secret (provided by developer)
6. Merchant enters store URL → OAuth flow starts
7. Desktop app opens browser → merchant authorizes → callback with code
8. Desktop app exchanges code for access token (using client_secret)
9. Access token stored locally for future API calls

## Key Files

| File | Purpose |
|------|---------|
| `src/main/oauth.js` | OAuth 2.0 flow - authorization URL generation and token exchange |
| `src/main/config.js` | Credential storage - reads from config.json OR .env |
| `src/main/ipc-handlers.js` | IPC communication between main and renderer |
| `src/main/shopify-api.js` | GraphQL API client for orders/products |
| `src/renderer/index.html` | Vue.js UI with setup wizard |

## Environment Variables (Development Only)

For development/debugging, create `.env` file to skip setup wizard:
```env
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
SHOPIFY_STORE_URL=your-store.myshopify.com
```

The app checks both `config.json` (saved via UI) and `.env` (for development).

## Protected Customer Data

To access order data, the app requires **Protected Customer Data Access**:
- Configured in Partners Dashboard → App Distribution → [app] → API access requests
- Select "Store management" scope
- Must answer data protection questionnaire
- Approval is usually instant for custom distribution apps

## Common Mistakes to Avoid

1. **Don't suggest using Admin API access tokens from Shopify admin** - This is the deprecated method

2. **Don't suggest PKCE** - Shopify Admin API doesn't support it for custom apps

3. **Don't suggest creating apps via Settings → Apps → Develop apps** - This creates legacy apps that can no longer be made

4. **Don't forget `client_secret` in token exchange** - The OAuth token endpoint requires it

5. **Don't use the Storefront API** - We need Admin API for order data

6. **Don't skip protected customer data access** - Orders won't be accessible without it

## Tech Stack

- **Electron 40.x** - Desktop app framework
- **Vue.js 3.4.x** - UI framework (global build, not SFC)
- **better-sqlite3 12.x** - Local SQLite database
- **Node.js fetch** - HTTP client for Shopify API
- **GraphQL** - Shopify Admin API query language
- **Jest 30.x** - Testing framework (uses sql.js for in-memory SQLite)
- **electron-updater** - Auto-update support via GitHub Releases

## Shopify API Version

Using Admin API version `2024-01`. Update in `src/main/shopify-api.js` if needed.

## Security Considerations

- Context isolation enabled (`contextIsolation: true`)
- Node integration disabled in renderer (`nodeIntegration: false`)
- Sandbox enabled (`sandbox: true`)
- Preload script exposes limited API via `contextBridge`
- CSP includes `unsafe-eval` (required for Vue runtime compiler)
- Credentials stored locally only (never transmitted except to Shopify)
