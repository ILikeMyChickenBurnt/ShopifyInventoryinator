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
