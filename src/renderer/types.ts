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

export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  hasOAuthCredentials: boolean;
  storeUrl: string | null;
  needsSetup: boolean;
  needsAuth: boolean;
}

export interface AutoSyncSettings {
  enabled: boolean;
  intervalMinutes: number;
}

export interface TaskRow {
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  image_url: string | null;
  made_quantity: number;
  total_quantity: number;
  remaining_quantity: number;
  status: string;
  last_synced_at: string;
}

export interface OrderLineItemRow {
  line_item_id: string;
  variant_id: string;
  variant_title: string | null;
  product_title: string;
  sku: string | null;
  image_url: string | null;
  quantity: number;
  fulfilled_quantity: number;
}

export interface OrderRow {
  order_id: string;
  order_name: string;
  order_date: string;
  status: string;
  total_items: number;
  fulfilled_items: number;
  remaining_items: number;
  shopifyAdminUrl?: string | null;
  lineItems: OrderLineItemRow[];
}

export interface InventoryRecord {
  id: number;
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  image_url: string | null;
  inventory_quantity: number;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryPayload {
  inventory: InventoryRecord[];
  stats: unknown;
}

export interface Task {
  variant_id: string;
  product_title: string;
  variant_title?: string | null;
  sku?: string | null;
  image_url?: string | null;
  made_quantity: number;
  total_quantity: number;
  remaining_quantity: number;
  status: string;
}

export interface OrderLineItem {
  line_item_id: string;
  product_title: string;
  variant_title?: string | null;
  sku?: string | null;
  image_url?: string | null;
  fulfilled_quantity: number;
  quantity: number;
}

export interface Order {
  order_id: string;
  order_name: string;
  order_date: string;
  status: string;
  fulfilled_items: number;
  total_items: number;
  remaining_items: number;
  shopifyAdminUrl?: string | null;
  lineItems: OrderLineItem[];
}

export interface InventoryItem {
  variant_id: string;
  product_title: string;
  variant_title?: string | null;
  sku?: string | null;
  image_url?: string | null;
  inventory_quantity: number;
}

export interface AppApi {
  openExternal: (url: string) => Promise<void>;
  checkAuth: () => Promise<OperationResult<AuthStatus>>;
  startOAuth: (storeUrl: string) => Promise<OperationResult<{ message: string; storeUrl: string }>>;
  logout: () => Promise<OperationResult<{ message: string }>>;
  saveCredentials: (clientId: string, clientSecret: string) => Promise<OperationResult<{ message: string }>>;
  getTasks: () => Promise<OperationResult<TaskRow[]>>;
  getOrders: () => Promise<OperationResult<OrderRow[]>>;
  syncFromShopify: () => Promise<SyncResult>;
  markMade: (variantId: string, quantity: number) => Promise<OperationResult>;
  resetTask: (variantId: string) => Promise<OperationResult>;
  markComplete: (variantId: string) => Promise<OperationResult>;
  archiveOrder: (orderId: string) => Promise<OperationResult>;
  archiveAllFulfilled: () => Promise<OperationResult<{ archivedCount: number }>>;
  getArchivedOrders: () => Promise<OperationResult<OrderRow[]>>;
  unarchiveOrder: (orderId: string) => Promise<OperationResult>;
  unarchiveAll: () => Promise<OperationResult<{ unarchivedCount: number }>>;
  getAutoSyncSettings: () => Promise<OperationResult<AutoSyncSettings>>;
  saveAutoSyncSettings: (enabled: boolean, intervalMinutes: number) => Promise<OperationResult<AutoSyncSettings & { message: string }>>;
  getInventory: (options?: { outOfStockOnly?: boolean; search?: string }) => Promise<OperationResult<InventoryPayload>>;
}