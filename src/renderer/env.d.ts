/// <reference types="vite/client" />

import type { AppApi } from './types';

/**
 * Typed contract for the preload-exposed API.
 * This gives full TypeScript support (including autocomplete and safety)
 * to all components in the new Vue 3 + Vite renderer.
 *
 * This is a copy of the shape exported from src/main/preload.ts (AppApi).
 * In a later phase we can move to a shared types location or use project references.
 */

declare global {
  interface Window {
    api: AppApi;
  }
}

export {};
