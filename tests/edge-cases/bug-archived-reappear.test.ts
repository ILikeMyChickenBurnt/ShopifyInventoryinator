/**
 * Bug Regression Test: Archived Orders Re-appeared After Sync
 * 
 * Bug: After syncing from Shopify, archived orders would reappear because
 * clearAllOrders() was deleting them, and then they'd be re-inserted from Shopify.
 * 
 * Fix: Modified clearOrdersWithoutProgress() to preserve archived orders AND
 * orders with progress. Sync now uses getOrderIdsToSkipDuringSync() to skip
 * re-inserting these orders.
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertOrder,
  upsertOrderLineItem,
  upsertTask,
  archiveOrder,
  getOrderByOrderId,
  getAllOrders,
  getArchivedOrders,
  clearOrdersWithoutProgress,
  getOrderIdsToSkipDuringSync
} = require('../helpers/test-database');

describe('Bug Regression: Archived Orders Re-appeared After Sync', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  test('clearOrdersWithoutProgress() preserves archived orders', () => {
    // Setup: Create an archived order
    upsertOrder({
      orderId: 'archived-order',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 3,
      madeQuantity: 3,
      status: 'completed'
    });

    upsertOrderLineItem({
      lineItemId: 'line-1',
      orderId: 'archived-order',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 3
    });

    // Archive the order
    archiveOrder('archived-order');

    // Create a non-archived order with no progress (should be deleted)
    upsertOrder({
      orderId: 'fresh-order',
      orderName: '#1002',
      orderDate: '2025-01-11T10:00:00Z',
      totalItems: 2,
      fulfilledItems: 0,
      status: 'pending'
    });

    upsertOrderLineItem({
      lineItemId: 'line-2',
      orderId: 'fresh-order',
      variantId: 'variant-2',
      productTitle: 'Hoodie',
      variantTitle: 'Black / Small',
      quantity: 2,
      fulfilledQuantity: 0
    });

    // Clear orders without progress
    clearOrdersWithoutProgress();

    // Archived order should still exist
    const archivedOrder = getOrderByOrderId('archived-order');
    expect(archivedOrder).toBeDefined();
    expect(archivedOrder.status).toBe('archived');

    // Fresh order should be deleted
    const freshOrder = getOrderByOrderId('fresh-order');
    expect(freshOrder).toBeUndefined();
  });

  test('clearOrdersWithoutProgress() preserves orders with progress', () => {
    // Setup: Create an order with progress (fulfilled_items > 0)
    upsertOrder({
      orderId: 'progress-order',
      orderName: '#1003',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 2, // Has progress!
      status: 'in_progress'
    });

    upsertOrderLineItem({
      lineItemId: 'line-3',
      orderId: 'progress-order',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 5,
      fulfilledQuantity: 2
    });

    // Create an order without progress
    upsertOrder({
      orderId: 'no-progress-order',
      orderName: '#1004',
      orderDate: '2025-01-11T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 0, // No progress
      status: 'pending'
    });

    // Clear orders without progress
    clearOrdersWithoutProgress();

    // Order with progress should still exist
    const progressOrder = getOrderByOrderId('progress-order');
    expect(progressOrder).toBeDefined();
    expect(progressOrder.fulfilled_items).toBe(2);

    // Order without progress should be deleted
    const noProgressOrder = getOrderByOrderId('no-progress-order');
    expect(noProgressOrder).toBeUndefined();
  });

  test('getOrderIdsToSkipDuringSync() includes archived order IDs', () => {
    // Setup: Create an archived order
    upsertOrder({
      orderId: 'archived-order',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 3,
      madeQuantity: 3,
      status: 'completed'
    });

    upsertOrderLineItem({
      lineItemId: 'line-1',
      orderId: 'archived-order',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 3
    });

    archiveOrder('archived-order');

    // Get skip IDs
    const skipIds = getOrderIdsToSkipDuringSync();

    // Should include archived order
    expect(skipIds.has('archived-order')).toBe(true);
  });

  test('getOrderIdsToSkipDuringSync() includes orders with progress', () => {
    // Setup: Create an order with progress
    upsertOrder({
      orderId: 'progress-order',
      orderName: '#1002',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 2,
      status: 'in_progress'
    });

    // Create an order without progress
    upsertOrder({
      orderId: 'no-progress-order',
      orderName: '#1003',
      orderDate: '2025-01-11T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 0,
      status: 'pending'
    });

    // Get skip IDs
    const skipIds = getOrderIdsToSkipDuringSync();

    // Should include order with progress
    expect(skipIds.has('progress-order')).toBe(true);

    // Should NOT include order without progress
    expect(skipIds.has('no-progress-order')).toBe(false);
  });

  test('simulated sync: archived orders remain archived after sync', () => {
    // Setup: Create and archive an order
    upsertOrder({
      orderId: 'order-to-archive',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 3,
      madeQuantity: 3,
      status: 'completed'
    });

    upsertOrderLineItem({
      lineItemId: 'line-1',
      orderId: 'order-to-archive',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 3
    });

    archiveOrder('order-to-archive');

    // Simulate sync: get skip IDs, clear, then "re-insert" from Shopify
    const skipIds = getOrderIdsToSkipDuringSync();
    clearOrdersWithoutProgress();

    // Simulate Shopify returning the same order
    const shopifyOrders = [{
      orderId: 'order-to-archive',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3
    }];

    // Sync logic: skip orders in skipIds
    for (const order of shopifyOrders) {
      if (!skipIds.has(order.orderId)) {
        upsertOrder(order);
      }
    }

    // Order should still be archived (not overwritten)
    const order = getOrderByOrderId('order-to-archive');
    expect(order.status).toBe('archived');
  });

  test('archived orders appear in getArchivedOrders() not getAllOrders()', () => {
    // Create and archive an order
    upsertOrder({
      orderId: 'archived-order',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 3,
      madeQuantity: 3,
      status: 'completed'
    });

    upsertOrderLineItem({
      lineItemId: 'line-1',
      orderId: 'archived-order',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 3
    });

    archiveOrder('archived-order');

    // Create a normal order
    upsertOrder({
      orderId: 'normal-order',
      orderName: '#1002',
      orderDate: '2025-01-11T10:00:00Z',
      totalItems: 2,
      fulfilledItems: 0,
      status: 'pending'
    });

    // getAllOrders should NOT include archived
    const allOrders = getAllOrders();
    expect(allOrders.find(o => o.order_id === 'archived-order')).toBeUndefined();
    expect(allOrders.find(o => o.order_id === 'normal-order')).toBeDefined();

    // getArchivedOrders should include ONLY archived
    const archivedOrders = getArchivedOrders();
    expect(archivedOrders.find(o => o.order_id === 'archived-order')).toBeDefined();
    expect(archivedOrders.find(o => o.order_id === 'normal-order')).toBeUndefined();
  });
});
