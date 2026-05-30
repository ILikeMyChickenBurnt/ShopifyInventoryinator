import { contextBridge, ipcRenderer, shell } from 'electron';
import type { TaskRow, OrderRow } from './database';

// Local type for inventory items returned to the renderer (matches what getAllInventory returns)
type InventoryItem = {
  id: number;
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string;
  sku: string;
  image_url: string | null;
  inventory_quantity: number;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

// Generic result shape used by most action handlers
type OperationResult<T = unknown> = { success: boolean; data?: T; error?: string };

type AuthStatus = {
  isAuthenticated: boolean;
  hasOAuthCredentials: boolean;
  storeUrl: string | null;
  needsSetup: boolean;
  needsAuth: boolean;
};

type AutoSyncSettings = {
  enabled: boolean;
  intervalMinutes: number;
};

type InventoryPayload = {
  inventory: InventoryItem[];
  stats: unknown;
};

// =============================================================================
// Sync result types (extracted from sync-orchestrator + ipc-handlers)
// This replaces the previous `any` on syncFromShopify in AppApi.
// =============================================================================

export interface SyncSuccessData {
  ordersCount: number;
  variantsCount: number;
  inventoryCount: number;
  newlyFulfilledFromShopify: Array<{
    order_id: string;
    order_name: string;
    shopifyAdminUrl: string | null;
  }>;
  message: string;
}

export type SyncResult =
  | { success: true; data: SyncSuccessData }
  | { success: false; error: string };

// =============================================================================
// API Type Definition
// This interface is the contract between main and renderer.
// It will be used for type safety on the renderer side later.
// =============================================================================

export interface AppApi {
  // System
  openExternal: (url: string) => Promise<void>;

  // Authentication
  checkAuth: () => Promise<OperationResult<AuthStatus>>;
  startOAuth: (storeUrl: string) => Promise<OperationResult<{ message: string; storeUrl: string }>>;
  logout: () => Promise<OperationResult<{ message: string }>>;
  saveCredentials: (clientId: string, clientSecret: string) => Promise<OperationResult<{ message: string }>>;

  // Tasks
  getTasks: () => Promise<OperationResult<TaskRow[]>>;

  // Orders
  getOrders: () => Promise<OperationResult<OrderRow[]>>;

  // Sync
  syncFromShopify: () => Promise<SyncResult>;

  // Task actions
  markMade: (variantId: string, quantity: number) => Promise<OperationResult>;
  resetTask: (variantId: string) => Promise<OperationResult>;
  markComplete: (variantId: string) => Promise<OperationResult>;

  // Archiving
  archiveOrder: (orderId: string) => Promise<OperationResult>;
  archiveAllFulfilled: () => Promise<OperationResult<{ archivedCount: number }>>;
  getArchivedOrders: () => Promise<OperationResult<OrderRow[]>>;
  unarchiveOrder: (orderId: string) => Promise<OperationResult>;
  unarchiveAll: () => Promise<OperationResult<{ unarchivedCount: number }>>;

  // Auto-sync
  getAutoSyncSettings: () => Promise<OperationResult<AutoSyncSettings>>;
  saveAutoSyncSettings: (enabled: boolean, intervalMinutes: number) => Promise<OperationResult<AutoSyncSettings & { message: string }>>;

  // Inventory
  getInventory: (options?: { outOfStockOnly?: boolean; search?: string }) => Promise<OperationResult<InventoryPayload>>;
}

// =============================================================================
// Expose API via contextBridge (secure bridge to renderer)
// =============================================================================

contextBridge.exposeInMainWorld('api', {
  // System
  openExternal: (url: string) => shell.openExternal(url),

  // Authentication
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  startOAuth: (storeUrl: string) => ipcRenderer.invoke('start-oauth', storeUrl),
  logout: () => ipcRenderer.invoke('logout'),
  saveCredentials: (clientId: string, clientSecret: string) =>
    ipcRenderer.invoke('save-credentials', clientId, clientSecret),

  // Tasks
  getTasks: () => ipcRenderer.invoke('get-tasks'),

  // Orders
  getOrders: () => ipcRenderer.invoke('get-orders'),

  // Sync
  syncFromShopify: () => ipcRenderer.invoke('sync-shopify'),

  // Task actions
  markMade: (variantId: string, quantity: number) =>
    ipcRenderer.invoke('mark-made', variantId, quantity),
  resetTask: (variantId: string) =>
    ipcRenderer.invoke('reset-task', variantId),
  markComplete: (variantId: string) =>
    ipcRenderer.invoke('mark-complete', variantId),

  // Archiving
  archiveOrder: (orderId: string) =>
    ipcRenderer.invoke('archive-order', orderId),
  archiveAllFulfilled: () =>
    ipcRenderer.invoke('archive-all-fulfilled'),
  getArchivedOrders: () =>
    ipcRenderer.invoke('get-archived-orders'),
  unarchiveOrder: (orderId: string) =>
    ipcRenderer.invoke('unarchive-order', orderId),
  unarchiveAll: () =>
    ipcRenderer.invoke('unarchive-all'),

  // Auto-sync
  getAutoSyncSettings: () =>
    ipcRenderer.invoke('get-auto-sync-settings'),
  saveAutoSyncSettings: (enabled: boolean, intervalMinutes: number) =>
    ipcRenderer.invoke('save-auto-sync-settings', enabled, intervalMinutes),

  // Inventory
  getInventory: (options?: { outOfStockOnly?: boolean; search?: string }) =>
    ipcRenderer.invoke('get-inventory', options),
});
