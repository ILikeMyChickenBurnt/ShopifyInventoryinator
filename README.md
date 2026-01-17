# Shopify Inventoryinator

A local desktop application for tracking Shopify order fulfillment using Electron, Vue.js 3, and SQLite.

## Features

- Fetches unfulfilled orders from Shopify Admin GraphQL API
- Aggregates quantities needed by product variant
- Track production progress locally (no Shopify updates)
- Mark partial or full quantities as "made"
- Persistent local storage with SQLite
- Secure OAuth 2.0 authentication

## Setup

### Prerequisites

- Node.js 20+ and npm
- Shopify store with the app installed (install link provided by developer)
- Client ID and Client Secret (provided by developer)
- Windows: Visual Studio Build Tools with C++ workload (for native module compilation)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Rebuild native modules for Electron:
   ```bash
   npm run rebuild
   ```

4. Run the app:
   ```bash
   npm start
   ```

5. Enter the Client ID and Client Secret provided to you
6. Enter your store URL and authorize the app

### Development Mode

For development, you can skip the setup wizard by creating a `.env` file:

```env
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
SHOPIFY_STORE_URL=your-store.myshopify.com
```

## Developer Setup

If you're the developer distributing this app, see [docs/DEVELOPER_SETUP.md](docs/DEVELOPER_SETUP.md) for:
- Creating the app in Shopify Partner Dashboard
- Configuring OAuth and API scopes
- Requesting protected customer data access
- Generating install links for merchants

## Important Notes

- This app uses **OAuth 2.0** authentication (not legacy API keys)
- Legacy "custom apps" created via Shopify Admin were deprecated January 2025
- See [CLAUDE.md](CLAUDE.md) for AI assistant context and technical decisions

## Testing

Run the test suite:
```bash
npm test
```

Tests use sql.js (pure JavaScript SQLite) to avoid native module issues in Jest.

## Building

Build executables for distribution:

```bash
# Windows
npm run build:win

# Linux
npm run build:linux
```

Releases are automatically built and published via GitHub Actions when you push a version tag:
```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

Proprietary - See [LICENSE](LICENSE) for details.

Copyright (c) 2026 ILikeMyChickenBurnt. All rights reserved.
