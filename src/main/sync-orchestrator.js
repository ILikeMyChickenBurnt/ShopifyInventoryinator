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

const realDb = require('./database');
const { getStoreUrl } = require('./config');

/**
 * Extract numeric order ID from Shopify GID (small shared helper)
 */
function extractOrderId(gid) {
  if (!gid) return '';
  const match = gid.match(/Order\/(\d+)/);
  return match ? match[1] : gid;
}

/**
 * Perform a full sync using the provided client.
 * Returns the same shape the IPC handler used to return.
 *
 * @param {object} client - An instance with fetch methods (real or mock)
 * @param {object} [db] - Optional database operations (defaults to real module).
 *                        Allows tests to inject the sql.js test helper.
 */
async function performSync(client, db = realDb) {
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
    logSync
  } = db;

  // Fetch and aggregate data (modern FulfillmentOrder path)
  const result = await client.fetchAndAggregate();
  const { aggregated, ordersForStorage, stats } = result;

  // Skip logic
  const skipOrderIds = getOrderIdsToSkipDuringSync();

  // Clear orders without progress
  clearOrdersWithoutProgress();

  // Store new orders/line items (respecting skips)
  let storedCount = 0;
  let skippedCount = 0;

  for (const order of ordersForStorage) {
    if (skipOrderIds.has(order.orderId)) {
      skippedCount++;
      continue;
    }
    upsertOrder(order);
    for (const lineItem of order.lineItems) {
      upsertOrderLineItem(lineItem);
    }
    storedCount++;
  }

  // Two-way sync: Shopify fulfilled orders
  let newlyFulfilledFromShopify = [];
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const fulfilledResult = await client.fetchFulfilledOrdersForReconciliation(
      ninetyDaysAgo.toISOString()
    );
    const { fulfilledOrdersForStorage } = fulfilledResult;

    if (fulfilledOrdersForStorage && fulfilledOrdersForStorage.length > 0) {
      for (const order of fulfilledOrdersForStorage) {
        upsertOrder(order);

        for (const lineItem of order.lineItems) {
          upsertOrderLineItem({
            ...lineItem,
            fulfilledQuantity: lineItem.quantity || lineItem.fulfilledQuantity
          });
        }

        newlyFulfilledFromShopify.push(order);
      }
    }
  } catch (twoWayError) {
    // Non-fatal in production
    // Security: log only message + type to avoid leaking Shopify response data or tokens
    console.error('[SyncOrchestrator] Two-way sync error (non-fatal):', twoWayError?.message || twoWayError);
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
  const inventoryResult = await client.fetchInventory();
  const { inventoryData, stats: inventoryStats } = inventoryResult;
  bulkUpsertInventory(inventoryData);

  // Log
  logSync({
    ordersFetched: stats.orderCount,
    variantsUpdated: updatedCount,
    status: 'success'
  });

  // Shape response for the UI (including toast data)
  const storeUrl = getStoreUrl();
  const newlyFulfilledForToast = newlyFulfilledFromShopify.map(o => ({
    order_id: o.orderId,
    order_name: o.orderName,
    shopifyAdminUrl: storeUrl
      ? `https://${storeUrl}/admin/orders/${extractOrderId(o.orderId)}`
      : null
  }));

  const twoWayMessage = newlyFulfilledFromShopify.length > 0
    ? ` (reconciled ${newlyFulfilledFromShopify.length} orders fulfilled in Shopify)`
    : '';

  return {
    success: true,
    data: {
      ordersCount: stats.orderCount,
      variantsCount: stats.variantCount,
      inventoryCount: inventoryStats.variantCount,
      newlyFulfilledFromShopify: newlyFulfilledForToast,
      message: `Synced ${stats.orderCount} orders, ${stats.variantCount} task variants, ${inventoryStats.variantCount} inventory items${twoWayMessage}`
    }
  };
}

module.exports = {
  performSync
};
