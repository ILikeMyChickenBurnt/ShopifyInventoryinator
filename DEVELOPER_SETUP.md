# Developer Setup

This document describes the current development workflow after the main process was migrated to TypeScript with a proper compilation step.

## Recommended Development Workflow

The compiled output in `dist/main/` is now the default and recommended way to run the app during development.

### Option 1: One-command development (recommended)

```bash
npm run dev
```

This command:
- Starts the TypeScript compiler in watch mode for the main process
- Waits for the compiled output to appear
- Launches Electron using the compiled code

### Option 2: Two-terminal workflow (best for active main process development)

Terminal 1 (watcher):
```bash
npm run dev:watch
```

Terminal 2 (app):
```bash
npm run dev
# or
npm start
```

The smart bootstraps will automatically use the compiled files from `dist/main/` when they exist.

## Building the Main Process

```bash
# One-time build
npm run build:main

# Watch mode (recommended during development)
npm run watch:main

# Clean compiled output
npm run clean:main
```

## Production Builds

Production builds (via `electron-builder`) use the compiled output from `dist/main/`. Always run `npm run build:main` before creating distributables if you have made changes to the main process.

## Notes

- The files `src/main/main.js` and `src/main/preload.js` are now **thin loaders only**. They do nothing except load the compiled output from `dist/main/`.
- The real source code lives exclusively in the `.ts` files (`src/main/main.ts`, `src/main/preload.ts`, etc.).
- `ts-node` has been fully removed from the development workflow and is no longer a dependency.
- There is no longer any fallback to on-the-fly TypeScript execution. You must run the compiler (`npm run build:main` or `npm run watch:main`) to run the app.
