# Testing Patterns & Culture

This document codifies the testing standards and patterns established during the 2026 comprehensive testing initiative. These are now the expected way we build and maintain the application.

## Core Philosophy

We treat testability as a first-class design concern. Complex, hard-to-test areas (native database, network-bound sync orchestration, allocation logic) were made testable through deliberate extraction of pure functions and injectable dependencies.

## The *Impl Pattern (Pure Function Extraction)

**Rule of thumb**: When adding non-trivial business logic, extract a pure `functionNameImpl(...)` version first, then have the class/method delegate to it.

### Why
- Pure functions have no side effects, no `this`, no network, no database.
- They are trivial to unit test with plain Jest.
- They can be reused in test helpers and in production.

### Examples in the Codebase

**Shopify API transforms** (`src/main/shopify-api.js`):
- `aggregateByVariantFromFulfillmentOrdersImpl`
- `extractOrdersForStorageFromFulfillmentOrdersImpl`
- `extractFulfilledOrdersForStorageFromFulfillmentOrdersImpl`
- `extractInventoryForStorageImpl`

These handle the complex mapping from Shopify GraphQL responses to our internal shapes.

**Database helpers** (`src/main/database.js`):
- `calculateTaskStatusImpl`
- `calculateOrderStatusImpl`
- `computeAllocationStepImpl`

These contain the core decision logic for status and allocation.

**Renderer utilities** (`src/renderer/app.js`):
- `progressPercentage`
- `orderProgressPercentage`
- `formatStatus`
- `formatOrderDate`

### How to Apply the Pattern

1. Write the logic as a standalone exported function ending in `Impl`.
2. Write thorough unit tests for the `Impl` function (happy paths + edge cases + error paths).
3. Have the original method do minimal work: call the `Impl` and (if needed) delegate to the DB/network layer.
4. Export both the `Impl` and the wrapper (the wrapper is often useful for integration-style tests).

See `tests/unit/database-utils.test.js` and `tests/unit/shopify-api-transforms.test.js` for the expected test density.

## Testing Hard Modules (The "Un-testable" Parts)

### Database (`src/main/database.js`)

The native `better-sqlite3` module is the single largest historical coverage gap.

**Strategy**:
- Most tests continue to use the sql.js fallback (via `tests/helpers/test-database.js`).
- High-volume production path coverage comes from `tests/unit/database-production-basic.test.js` when `REAL_DB_COVERAGE=1`.
- The large `if (dbType === 'better-sqlite3')` block inside that file exercises dozens of real production code paths.

**How to run the real numbers locally**:
```bash
docker compose -f docker-compose.test.yml run --rm -e REAL_DB_COVERAGE=1 real-db-coverage
```

See `Dockerfile.test` for the critical detail: the from-source rebuild of `better-sqlite3` **must** happen *after* `COPY . .` so host Windows binaries don't overwrite the Linux binary.

### Sync Orchestration (`src/main/sync-orchestrator.js`)

`performSync(client, db?, configOverrides?)` accepts an optional injected database **and** config overrides. Small pure helpers like `extractOrderId` are also exported for direct testing.

This is the key enabler for realistic feature tests.

**Pattern**:
- Use `tests/__mocks__/shopify-api.js` → `MockShopifyClient` for controlled Shopify responses (including two-way fulfillment scenarios).
- Inject a real test DB instance (sql.js or the Docker real binary).
- Inject config functions when needed via the third parameter, e.g.:
  ```js
  await performSync(client, dbForSync, {
    getStoreUrl: () => 'test-store.myshopify.com'
  });
  ```
- Write end-to-end style tests in `tests/features/sync-flow.test.js` that exercise the full allocation + two-way reconciliation + logging behavior.

This approach gives high confidence without requiring a real Shopify store or network.

## Expectations for New Code

When contributing (human or AI-assisted):

- New business logic with branches or complex mapping **must** be extracted as `*Impl` functions with dedicated unit tests.
- New flows that cross DB + external data (especially anything involving orders, allocation, or sync) should have at least one orchestrated feature test using the Mock + injectable DB (and config) pattern.
- If you add or modify code that touches the native database layer, consider whether it needs additional cases inside the `REAL_DB_COVERAGE` block.
- PRs should not cause the `coverage-real-db` CI job to fail its thresholds.

## Coverage Goals & Thresholds

Thresholds live in `jest.config.js`. They are intentionally set at sustainable levels achieved through the real-DB Docker runs (~84.5% statements, ~71.7% branches globally as of late 2026).

A dedicated (lower but meaningful) bar exists for `database.js` because even with the Docker technique it remains the hardest file to cover completely.

Raising thresholds further is encouraged when new exercising tests are added.

## Running the Important Test Commands

| Goal | Command |
|------|---------|
| Normal development | `npm test` |
| Coverage (sql.js path) | `npm run test:coverage` |
| Real native DB coverage (recommended for database.js changes) | `docker compose -f docker-compose.test.yml run --rm -e REAL_DB_COVERAGE=1 real-db-coverage` |
| Full CI-like run | See `.github/workflows/ci.yml` |

## References

- `CLAUDE.md` → "Testing & Security Culture" section (high-level summary)
- `tests/features/sync-flow.test.js` → Best example of orchestrated testing
- `tests/unit/database-production-basic.test.js` → The real-DB exercising harness
- `src/main/sync-orchestrator.js` + its mock → Injectable dependency pattern

This document should be updated whenever we evolve our testing approach. The goal is that these patterns feel like "how we do things here" rather than a one-time heroic effort.