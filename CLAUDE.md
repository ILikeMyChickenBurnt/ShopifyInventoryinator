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

**Current:** Admin GraphQL API version `2025-04` (updated April 2026).

The upgrade from `2024-01` included a deliberate modernization of the data ingestion layer:
- Primary source of "actionable" quantities is now `FulfillmentOrder` + `FulfillmentOrderLineItem.remainingQuantity`.
- Legacy `orders` query + `fulfillableQuantity` path is retained for reference/fallback.
- Inventory still uses the simple `inventoryQuantity` scalar (with notes that `InventoryLevel.quantities` is the modern model).

See the detailed plan and rationale in the session plan file:
`sessions/.../019e667e-944e-7bd1-95cd-aba820e00943/plan.md`

Update the version constant and related queries in `src/main/shopify-api.js`.

## Security Considerations

- Context isolation enabled (`contextIsolation: true`)
- Node integration disabled in renderer (`nodeIntegration: false`)
- Sandbox enabled (`sandbox: true`)
- Preload script exposes limited API via `contextBridge`
- CSP includes `unsafe-eval` (required for Vue runtime compiler)
- Credentials stored locally only (never transmitted except to Shopify)

## Testing & Security Culture (Established Patterns)

This project went through a major modernization push in 2026 focused on two parallel cultural improvements:

### 1. Testing Culture & Patterns
We adopted a deliberate "pure function extraction" pattern to make previously untestable code (native DB, network-bound sync, complex allocation) highly testable:

- **Core Technique**: Heavy pure `*Impl` functions (no `this`, no network, no DB) + thin delegating class methods. See:
  - `src/main/shopify-api.js`: `aggregateByVariantFromFulfillmentOrdersImpl`, `extractOrdersForStorageFromFulfillmentOrdersImpl`, `extractFulfilledOrdersForStorageFromFulfillmentOrdersImpl`, `extractInventoryForStorageImpl`, etc.
  - `src/main/database.js`: `calculateTaskStatusImpl`, `calculateOrderStatusImpl`, `computeAllocationStepImpl`
  - `src/renderer/app.js`: formatting helpers (`progressPercentage`, `formatStatus`, etc.)

- **Orchestrator Testing**: `src/main/sync-orchestrator.js` (`performSync(client, db?)`) accepts injectable dependencies. Use `tests/__mocks__/shopify-api.js` (MockShopifyClient) + real test DB (sql.js or Docker real binary) for feature tests in `tests/features/sync-flow.test.js`.

- **Real Native DB Coverage**: `database.js` (the hardest file) cannot be meaningfully covered with the sql.js fallback. We use:
  - `REAL_DB_COVERAGE=1` env var
  - `Dockerfile.test` + `docker-compose.test.yml` with a clean `npm install better-sqlite3 --build-from-source` **after** `COPY . .`
  - `tests/unit/database-production-basic.test.js` has a large `if (dbType === 'better-sqlite3')` block that exercises dozens of production paths when the real binary loads.

- **Expectations for New Code**:
  - New business logic should be extracted as pure `*Impl` functions with dedicated unit tests.
  - Complex flows (sync, allocation, two-way reconciliation) get orchestrated feature tests using the Mock + injectable DB pattern.
  - When adding native-dependent code, plan for the Docker real-binary path or accept that coverage will be measured primarily via the `REAL_DB_COVERAGE` job.
  - PRs should not regress the real-DB coverage job.

Current baseline (measured via the real-DB Docker job): ~84.5% statements / ~71.7% branches globally.

**Important coverage note**: Coverage is collected in a single Docker-based job using a real compiled better-sqlite3 (`REAL_DB_COVERAGE=1`). The fast `test` job only runs non-coverage tests. This gives us one authoritative report with good numbers for database.js. See `docs/TESTING_PATTERNS.md`.

### 2. Security Culture & Standards
After the 2025–2026 npm supply-chain attacks, we treat dependency hygiene as ongoing work, not a one-time event:

- Separate `security-audit.yml` (weekly scheduled + on PRs/pushes, fails on high+, opens GitHub issues on schedule failures).
- Conservative Dependabot grouping + native module ignores.
- `SECURITY.md` documents reporting process and known limitations.
- No static Admin tokens; strict OAuth 2.0 with client_secret only in token exchange (never in renderer or logs).
- Local-only credential storage (config.json / better-sqlite3 DB). Tokens are never sent anywhere except directly to Shopify.

When working on auth, credentials, local storage, auto-update, or any data flowing from Shopify (especially orders with customer data), re-read the top of this file and the Security Considerations section.

## How to Run the Important CI Jobs Locally

- Normal tests + coverage: `npm run test:coverage`
- Real native DB coverage (the one that actually exercises production `database.js`): 
  `docker compose -f docker-compose.test.yml run --rm -e REAL_DB_COVERAGE=1 real-db-coverage`
  (Requires Docker Desktop; first build can take 10–20 minutes due to from-source native compilation.)

See also:
- `docs/DEVELOPER_SETUP.md` for distributor/merchant onboarding
- `docs/TESTING_PATTERNS.md` for the full testing culture, *Impl pattern, orchestrator testing strategy, and real-DB Docker technique.
- Node integration disabled in renderer (`nodeIntegration: false`)
- Sandbox enabled (`sandbox: true`)
- Preload script exposes limited API via `contextBridge`
- CSP includes `unsafe-eval` (required for Vue runtime compiler)
- Credentials stored locally only (never transmitted except to Shopify)
