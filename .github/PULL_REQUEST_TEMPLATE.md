## Description

<!-- Describe the changes in this PR. Link to any related issues. -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactoring / code quality
- [ ] Documentation
- [ ] Dependency update
- [ ] Other (please describe)

## Testing

- [ ] Added or updated unit tests
- [ ] Added or updated feature / integration tests (especially for sync, allocation, database, or OAuth flows)
- [ ] All tests pass locally (`npm test`)
- [ ] If touching `database.js` or native modules: verified via `REAL_DB_COVERAGE=1` Docker run when possible
- [ ] Manual testing performed for affected flows (describe below if relevant)

## Security Considerations

This app handles merchant OAuth tokens, Client Secrets, and order data with protected customer information.

**Required for any PR that touches the following areas** (mark N/A if not applicable):

- [ ] No secrets, access tokens, or Client Secrets are logged, persisted outside the local store, or sent to the renderer process.
- [ ] Changes to OAuth flow (`oauth.js`), credential storage (`config.js`), or token exchange reviewed against rules in [CLAUDE.md](CLAUDE.md) (top sections) and [SECURITY.md](SECURITY.md).
- [ ] No new external dependencies added without running `npm audit` and considering supply-chain risk.
- [ ] Changes to local data handling (SQLite, config.json, inventory/orders) reviewed for data exposure risks.
- [ ] Auto-updater or release-related changes reviewed for integrity / signing implications.
- [ ] Any new Shopify GraphQL queries or data handling reviewed for scope minimization and PII handling.

**Security checklist completed?** (or N/A)

## Checklist

- [ ] Code follows the pure function extraction pattern (`*Impl` functions) where feasible for testability (see CLAUDE.md)
- [ ] New complex logic has orchestrated tests using MockShopifyClient + injectable DB when appropriate
- [ ] Documentation updated (CLAUDE.md, README, SECURITY.md, or DEVELOPER_SETUP.md as relevant)
- [ ] No console.log of sensitive data (tokens, full customer info, client secrets)
- [ ] Self-review completed

## Screenshots / Testing Notes (if applicable)

<!-- Add any relevant screenshots, manual test steps, or edge cases called out. -->
