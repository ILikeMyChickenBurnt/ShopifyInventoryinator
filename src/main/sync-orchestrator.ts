/**
 * Sync Orchestrator
 *
 * Extracted from ipc-handlers.js for testability.
 * This module contains the core sync + two-way reconciliation logic.
 *
 * It accepts a ShopifyClient instance (real or mocked) so the expensive
 * network calls and data fetching can be controlled in tests.
 *
 * All database side-effects still go through the real (or test) database helpers.
 */

import * as realDb from './database';
import { getStoreUrl as realGetStoreUrl } from './config';
import type {
  LogSyncInput,
  UpsertOrderInput,
  UpsertOrderLineItemInput,
  UpsertTaskInput,
  InventoryInput,
} from './database';
import type { AggregatedVariant } from './shopify-api';

// =============================================================================
// Sync result shapes (what the Shopify client methods actually return)
// These will be moved to shopify-api.ts in a follow-up pass for a single source of truth.
// =============================================================================

export interface SyncStats {
  orderCount: number;
  variantCount: number;
}

export interface FetchAndAggregateResult {
  aggregated: AggregatedVariant[];
  ordersForStorage: OrderForStorage[];
  stats: SyncStats;
  source?: string;
}

export interface FulfilledReconciliationResult {
  fulfilledOrdersForStorage: OrderForStorage[];
  stats: { fulfilledOrderCount: number };
}

export interface InventoryFetchResult {
  inventoryData: InventoryInput[];
  stats: { variantCount: number };
}

interface SyncClient {
  fetchAndAggregate: () => Promise<FetchAndAggregateResult>;
  fetchFulfilledOrdersForReconciliation: (since: string | null) => Promise<FulfilledReconciliationResult>;
  fetchInventory: () => Promise<InventoryFetchResult>;
}

// Note: We accept a subset of the real DB module for testability (dependency injection)
interface DbOperations {
  getOrderIdsToSkipDuringSync: () => Set<string>;
  clearOrdersWithoutProgress: () => void;
  upsertOrder: (order: UpsertOrderInput) => void;
  upsertOrderLineItem: (lineItem: UpsertOrderLineItemInput) => void;
  upsertTask: (task: UpsertTaskInput) => void;
  recalculateTaskTotalsFromOrders: () => void;
  updateAllOrderStatuses: () => void;
  bulkUpsertInventory: (inventory: InventoryInput[]) => void;
  logSync: (entry: LogSyncInput) => void;
}

interface ConfigOverrides {
  getStoreUrl?: () => string | null;
}

// Order shape used for storage (matches what the extract*Impl functions produce)
export interface OrderForStorage {
  orderId: string;
  orderName: string;
  orderDate: string;
  totalItems: number;
  lineItems: Array<{
    lineItemId: string;
    variantId: string;
    variantTitle: string;
    productTitle: string;
    sku: string;
    imageUrl: string | null;
    quantity: number;
  }>;
}

// =============================================================================
// Pure Helpers (exported for testability)
// =============================================================================

export function extractOrderId(gid: string | null | undefined): string {
  if (!gid) return '';
  const match = gid.match(/Order\/(\d+)/);
  return match ? match[1] : gid;
}

// =============================================================================
// Main Sync Function
// =============================================================================

export async function performSync(
  client: SyncClient,
  // The real DB module has many more exports than our minimal DbOperations interface
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  db: DbOperations = realDb as unknown as DbOperations,
  configOverrides: ConfigOverrides = {}
) {
  if (!client) {
    throw new Error('Shopify client is required for sync');
  }

  const {
    getOrderIdsToSkipDuringSync,
    clearOrdersWithoutProgress,
    upsertOrder,
    upsertOrderLineItem,
    upsertTask,
    recalculateTaskTotalsFromOrders,
    updateAllOrderStatuses,
    bulkUpsertInventory,
    logSync,
  } = db;

  // Fetch and aggregate data (modern FulfillmentOrder path)
  const result: FetchAndAggregateResult = await client.fetchAndAggregate();
  const { aggregated, ordersForStorage, stats } = result;

  // Skip logic
  const skipOrderIds = getOrderIdsToSkipDuringSync();

  // Clear orders without progress
  clearOrdersWithoutProgress();

  // Store new orders/line items (respecting skips)
  for (const order of ordersForStorage) {
    if (skipOrderIds.has(order.orderId)) {
      continue;
    }
    upsertOrder(order);
    for (const lineItem of order.lineItems) {
      upsertOrderLineItem({
        orderId: order.orderId,
        lineItemId: lineItem.lineItemId,
        variantId: lineItem.variantId,
        variantTitle: lineItem.variantTitle,
        productTitle: lineItem.productTitle,
        sku: lineItem.sku,
        imageUrl: lineItem.imageUrl,
        quantity: lineItem.quantity,
      });
    }
  }

  // Two-way sync: Shopify fulfilled orders
  const newlyFulfilledFromShopify: OrderForStorage[] = [];
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const fulfilledResult: FulfilledReconciliationResult = await client.fetchFulfilledOrdersForReconciliation(
      ninetyDaysAgo.toISOString()
    );
    const { fulfilledOrdersForStorage } = fulfilledResult;

    if (fulfilledOrdersForStorage && fulfilledOrdersForStorage.length > 0) {
      for (const order of fulfilledOrdersForStorage) {
        upsertOrder(order);

        for (const lineItem of order.lineItems) {
          upsertOrderLineItem({
            orderId: order.orderId,
            lineItemId: lineItem.lineItemId,
            variantId: lineItem.variantId,
            variantTitle: lineItem.variantTitle,
            productTitle: lineItem.productTitle,
            sku: lineItem.sku,
            imageUrl: lineItem.imageUrl,
            quantity: lineItem.quantity,
            fulfilledQuantity: lineItem.quantity || (lineItem as { fulfilledQuantity?: number } | undefined)?.fulfilledQuantity,
          });
        }

        newlyFulfilledFromShopify.push(order);
      }
    }
  } catch (twoWayError: unknown) {
    // Non-fatal in production
    // Security: log only message + type to avoid leaking Shopify response data or tokens
    const message = twoWayError instanceof Error ? twoWayError.message : twoWayError;
    console.error('[SyncOrchestrator] Two-way sync error (non-fatal):', message);
  }

  // Upsert tasks from aggregated data
  let updatedCount = 0;
  for (const item of aggregated) {
    upsertTask(item);
    updatedCount++;
  }

  // Recalculate if we have skips
  if (skipOrderIds.size > 0) {
    recalculateTaskTotalsFromOrders();
  }

  updateAllOrderStatuses();

  // Inventory
  const inventoryResult: InventoryFetchResult = await client.fetchInventory();
  const { inventoryData, stats: inventoryStats } = inventoryResult;
  bulkUpsertInventory(inventoryData);

  // Log
  logSync({
    ordersFetched: stats.orderCount,
    variantsUpdated: updatedCount,
    status: 'success',
    errorMessage: null,
  });

  // Shape response for the UI (including toast data)
  const { getStoreUrl: getStoreUrlOverride } = configOverrides;
  const storeUrl = getStoreUrlOverride ? getStoreUrlOverride() : realGetStoreUrl();

  const newlyFulfilledForToast = newlyFulfilledFromShopify.map((o) => ({
    order_id: o.orderId,
    order_name: o.orderName,
    shopifyAdminUrl: storeUrl
      ? `https://${storeUrl}/admin/orders/${extractOrderId(o.orderId)}`
      : null,
  }));

  const twoWayMessage =
    newlyFulfilledFromShopify.length > 0
      ? ` (reconciled ${newlyFulfilledFromShopify.length} orders fulfilled in Shopify)`
      : '';

  return {
    success: true,
    data: {
      ordersCount: stats.orderCount,
      variantsCount: stats.variantCount,
      inventoryCount: inventoryStats.variantCount,
      newlyFulfilledFromShopify: newlyFulfilledForToast,
      message: `Synced ${stats.orderCount} orders, ${stats.variantCount} task variants, ${inventoryStats.variantCount} inventory items${twoWayMessage}`,
    },
  };
}

export default {
  performSync,
  extractOrderId, // Exported for testability and reuse (pure helper)
};
