# TypeScript Migration Guide

This document tracks the ongoing conversion of the project from JavaScript to TypeScript with strict typing and linting standards.

## Current Status

**Phase:** 0 — Foundation & Tooling Setup

**Key Decisions Made:**
- Hard ban on `any` (`@typescript-eslint/no-explicit-any: "error"`) from the beginning.
- Renderer will be migrated to a proper **Vite + Vue + TypeScript** setup (Single File Components with `<script setup lang="ts">`).
- Main process will be converted first.
- Strict mode is the target (we are currently using a migration-friendly config).

## Tooling

- **TypeScript**: `tsconfig.json` (migration mode) + `tsconfig.strict.json` (future target)
- **ESLint + TypeScript ESLint**: Hard `no-explicit-any` rule + recommended strict rules
- **Jest**: Mixed `.js` + `.ts` test support is now part of the migration path so tests can be converted incrementally.
- Scripts:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run lint:fix`

## Migration Strategy

1. Convert files incrementally (`.js` → `.ts`).
2. Add explicit types as you convert (start with function signatures and public APIs).
3. Fix all `any` usages during conversion (no new `any` is allowed).
4. Main process first → Renderer second (after Vite setup).
5. Tests can be converted to TypeScript gradually; `.js` and `.ts` tests should coexist during the transition.

## Working with the Current Config

During migration we are using relaxed settings (`checkJs: false`) so the type checker doesn't overwhelm you with thousands of implicit `any` errors in untouched JavaScript files.

As files are converted to `.ts`, they become subject to the full strict rules.

When the bulk of the migration is complete, we will flip to the stricter settings defined in `tsconfig.strict.json`.

## Linting Rules (Non-Negotiable)

- `@typescript-eslint/no-explicit-any`: **error**
- Very limited use of `eslint-disable` comments is allowed, but they require a clear justification in the PR.

## Next Steps (Current Focus)

See the approved plan in the session file for the full phased breakdown.

Current focus: Finish Phase 0 tooling polish, then begin converting small main-process files.

## Questions or Issues?

Open an issue or discuss in the relevant PR. Do not introduce `any` to work around problems — ask for help refactoring instead.
