# Security Policy

## Supported Versions

We currently support the latest minor/patch version of the application.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Instead, report it privately by emailing the maintainer or opening a private security advisory on GitHub (if available for this repository).

We will respond within a reasonable timeframe and work with you to understand and resolve the issue.

## Dependency Updates

This project takes supply chain security seriously, especially after the major npm ecosystem incidents in 2025–2026 (including the Qix maintainer compromise and the Shai-Hulud campaign).

- We run automated `npm audit` on every pull request and on a weekly schedule via GitHub Actions.
- We use Dependabot for automated dependency updates (with conservative grouping and ignores for native modules).
- High and critical severity issues are treated as priority.

When updating dependencies:
- Native modules (especially `better-sqlite3`) require a full rebuild using `npm run rebuild`.
- Major version jumps in Electron or related tooling are tested manually before release.
- We prefer to keep `node-fetch` on v2 for compatibility with the Electron main process.

If you find a dependency-related vulnerability that affects this project, please report it using the channel above.

## Known Limitations

- As an Electron desktop application, we bundle a large number of transitive dependencies.
- Some high-severity issues may originate from build tooling (`electron-builder`, etc.) that only affect the build environment, not end users.
- We do our best to keep the runtime attack surface as small as possible.

## Lightweight Threat Model

This is a summary of the main threats we consider for this desktop application. It is intentionally lightweight but should be revisited when making significant changes to auth, data storage, or distribution.

### Assets
- Merchant access tokens (long-lived Shopify Admin API tokens)
- Client ID + Client Secret (for the specific merchant's app installation)
- Local order/task/inventory data (including some customer information from orders)
- The merchant's "made" production progress (local source of truth)

### Key Threats & Mitigations

| Threat | Likelihood | Impact | Current Mitigations | Notes / Gaps |
|--------|------------|--------|---------------------|--------------|
| Local machine compromise (malware, stolen laptop) | Medium | High | Tokens and secrets stored only in user-writable local SQLite / config.json; no cloud sync | Full compromise of the machine gives attacker the tokens. We do not encrypt the DB at rest (tradeoff for simplicity / no extra native deps). Documented in "Local Data". |
| Token leakage via logs or renderer | Low | Very High | Strict rules against logging tokens/secrets; client secret never leaves main process; renderer has no direct access | Enforced via code review + PR checklist. |
| Supply chain attack (npm / dependency) | Medium | High | Dedicated weekly `security-audit.yml`, conservative Dependabot, manual review of major updates, native module rebuild discipline | Post-2025/2026 attack hygiene is now ongoing culture. |
| Malicious or compromised update artifact | Low | High | `electron-updater` with GitHub Releases + signing; auto-download disabled (user must approve) | See auto-updater.js. |
| Shopify API abuse / token replay | Low | Medium | Tokens are merchant-specific; app uses minimal scopes + protected data access only when required | Relies on Shopify's revocation and rate limiting. |
| Exposure of customer PII in local data | Medium | Medium | Data never leaves the merchant's machine; used only for fulfillment tracking | Merchants are responsible for their local machine security. |

### Out of Scope (for now)
- Physical attacks on the developer's Partner account
- Attacks against Shopify itself
- Side-channel attacks on the compiled binary

We accept that a fully compromised end-user machine is a high-impact event and mitigate primarily through transparency (users know exactly what data lives locally) and minimal data collection.

## Secure Development Practices (This App)

These rules are part of our security culture. They are enforced in PR reviews and AI-assisted work (see CLAUDE.md).

### Credential & Token Handling
- **Never** log, persist, or transmit Shopify access tokens or Client Secrets except to Shopify's token exchange endpoint.
- Tokens live only in the local SQLite DB (or config.json for dev). They are loaded into memory only for the duration of an API call.
- The OAuth callback (`src/main/oauth.js`) must exchange the code for a token server-side (main process) using the client secret. The renderer must never see the secret.
- On logout or store disconnect, tokens must be deleted from the local store.

### Local Data
- All merchant data (tasks, orders, inventory, sync history) stays on the user's machine.
- The app treats the local better-sqlite3 database as the source of truth for "made" progress. Shopify is the source of truth for fulfillment status (two-way reconciliation).
- Never write sensitive customer data to logs or crash reports.

### Shopify Data & API
- All data from Shopify (especially orders) is treated as potentially sensitive. We only request the minimum scopes (`read_orders`, `read_products`) + protected customer data access when required.
- Input from Shopify GraphQL responses must be treated as untrusted for rendering (even though we trust the channel, defense-in-depth).
- FulfillmentOrder + remainingQuantity is the preferred modern path (see CLAUDE.md for API version rules).

### Updates & Distribution
- We use `electron-updater` with GitHub Releases. Release artifacts are signed.
- Merchants receive the app + Client ID/Secret only through controlled channels (never public).
- Any change to auto-update, signing, or the update server flow requires security review.

### Dependencies & Supply Chain
- We maintain a standing `security-audit.yml` workflow (weekly + on every PR).
- High/critical findings block PRs. Native modules (`better-sqlite3`) have special handling (full rebuild required).
- When adding new dependencies, prefer well-maintained, small-surface packages. Run `npm audit` locally before proposing.

### Logging Rules
- **Never** log access tokens, refresh tokens, Client Secrets, or full raw responses that may contain customer PII.
- Prefer structured, minimal logging (e.g., `logSync({ status: 'error', ... })` without token data).
- In error handlers, log only the error type/message + a correlation ID when possible — never the full stack with secrets.
- `electron-log` (used by auto-updater) and `console.*` are both considered logs for review purposes.

### When Adding New Features
- Any code touching auth, credentials, local storage, network calls to Shopify, or order/customer data must be reviewed against the rules in the top half of CLAUDE.md and this file.
- New complex flows (especially anything that could leak tokens or mix local "made" state with Shopify fulfillment) should have both happy-path and error-path coverage in the orchestrated test style.
- Before merging, the PR author must complete the Security Considerations section of the pull request template.

If you are an AI assistant or human contributor and are unsure whether a change follows these practices, ask before implementing.
