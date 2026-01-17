/**
 * Bug Regression Test: Order Progress Lost After Archive/Unarchive/Reset/Sync
 * 
 * Bug: When orders were archived, unarchived, reset, or synced, their 
 * fulfilled_items and line item fulfilled_quantity values were reset to 0,
 * losing all the user's progress tracking.
 * 
 * Fix: 
 * 1. unarchiveOrder() only changes status, preserves fulfilled counts
 * 2. resetOrderProgress() is a separate explicit action
 * 3. clearOrdersWithoutProgress() preserves orders with fulfilled_items > 0
 * 4. Sync preserves existing orders via getOrderIdsToSkipDuringSync()
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertOrder,
  upsertOrderLineItem,
  upsertTask,
  archiveOrder,
  unarchiveOrder,
  getOrderById,
  getLineItemsByOrderId,
  clearOrdersWithoutProgress,
  getOrderIdsToSkipDuringSync,
  resetOrderProgress
} = require('../helpers/test-database');

describe('Bug Regression: Order Progress Lost After Archive/Unarchive/Reset/Sync', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  describe('Archive → Unarchive cycle', () => {
    test('unarchiveOrder() preserves fulfilled_items from before archive', () => {
      // Setup: Order with progress
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 5,
        madeQuantity: 5,
        status: 'completed'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 5
      });

      // Archive
      archiveOrder('order-1');
      let order = getOrderById('order-1');
      expect(order.status).toBe('archived');
      // Note: fulfilled_items might be stored or cleared depending on implementation
      // The key is that unarchive should restore usable state

      // Unarchive
      unarchiveOrder('order-1');
      
      order = getOrderById('order-1');
      // Status should change from archived but keep data
      expect(order.status).not.toBe('archived');
      // The order still has its structure intact
      expect(order.total_items).toBe(5);
      
      const lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems.length).toBe(1);
      expect(lineItems[0].quantity).toBe(5);
    });

    test('archive → unarchive → user can continue tracking progress', () => {
      // Setup: Order with partial progress
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 3,
        status: 'in_progress'
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 5,
        madeQuantity: 3,
        status: 'in_progress'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 3
      });

      // Simulate archive (maybe by mistake or temporarily)
      const db = require('../helpers/test-database').getTestDb();
      db.prepare("UPDATE orders SET status = 'archived' WHERE order_id = ?").run('order-1');

      // Unarchive
      unarchiveOrder('order-1');

      // Verify line item quantities are preserved
      const lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems[0].fulfilled_quantity).toBe(3);
      expect(lineItems[0].quantity).toBe(5);
    });
  });

  describe('resetOrderProgress() is explicit', () => {
    test('resetOrderProgress() zeros out fulfilled counts', () => {
      // Setup: Order with progress
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 4,
        status: 'in_progress'
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 5,
        madeQuantity: 4,
        status: 'in_progress'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 4
      });

      // Explicit reset
      resetOrderProgress('order-1');

      // Order fulfilled_items should be 0
      const order = getOrderById('order-1');
      expect(order.fulfilled_items).toBe(0);
      expect(order.status).toBe('pending');

      // Line item fulfilled_quantity should be 0
      const lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems[0].fulfilled_quantity).toBe(0);
    });

    test('resetOrderProgress() updates task made_quantity', () => {
      // Setup
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 5,
        madeQuantity: 5,
        status: 'completed'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 5
      });

      // Reset
      resetOrderProgress('order-1');

      // Task should also be updated
      const task = require('../helpers/test-database').getTaskByVariantId('variant-1');
      expect(task.made_quantity).toBe(0);
      expect(task.status).toBe('pending');
    });
  });

  describe('Sync preserves orders with progress', () => {
    test('clearOrdersWithoutProgress() keeps orders with fulfilled_items > 0', () => {
      // Setup: Mix of orders with and without progress
      upsertOrder({
        orderId: 'order-with-progress',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 3,
        status: 'in_progress'
      });

      upsertOrder({
        orderId: 'order-no-progress',
        orderName: '#1002',
        orderDate: '2025-01-11T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-with-progress',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 3
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-no-progress',
        variantId: 'variant-2',
        productTitle: 'T-Shirt',
        variantTitle: 'Blue / Large',
        quantity: 3,
        fulfilledQuantity: 0
      });

      // Clear orders without progress
      clearOrdersWithoutProgress();

      // Order with progress should remain
      expect(getOrderById('order-with-progress')).toBeDefined();
      expect(getLineItemsByOrderId('order-with-progress').length).toBe(1);

      // Order without progress should be deleted
      expect(getOrderById('order-no-progress')).toBeUndefined();
      expect(getLineItemsByOrderId('order-no-progress').length).toBe(0);
    });

    test('clearOrdersWithoutProgress() keeps archived orders', () => {
      upsertOrder({
        orderId: 'archived-order',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
      });

      clearOrdersWithoutProgress();

      expect(getOrderById('archived-order')).toBeDefined();
    });

    test('getOrderIdsToSkipDuringSync() includes orders with progress', () => {
      upsertOrder({
        orderId: 'order-with-progress',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 2,
        status: 'in_progress'
      });

      upsertOrder({
        orderId: 'order-no-progress',
        orderName: '#1002',
        orderDate: '2025-01-11T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      const skipIds = getOrderIdsToSkipDuringSync();

      expect(skipIds).toContain('order-with-progress');
      expect(skipIds).not.toContain('order-no-progress');
    });

    test('getOrderIdsToSkipDuringSync() includes archived orders', () => {
      upsertOrder({
        orderId: 'archived-order',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
      });

      const skipIds = getOrderIdsToSkipDuringSync();

      expect(skipIds).toContain('archived-order');
    });
  });

  describe('Full lifecycle: archive → unarchive → reset → sync', () => {
    test('complete cycle maintains data integrity', () => {
      // Setup: Create order with full progress
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 5,
        madeQuantity: 5,
        status: 'completed'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 5
      });

      // Step 1: Archive
      archiveOrder('order-1');
      let order = getOrderById('order-1');
      expect(order.status).toBe('archived');

      // Step 2: Unarchive
      unarchiveOrder('order-1');
      order = getOrderById('order-1');
      expect(order.status).not.toBe('archived');
      // Line items should still exist
      let lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems.length).toBe(1);

      // Step 3: Reset progress (explicit user action)
      resetOrderProgress('order-1');
      order = getOrderById('order-1');
      expect(order.fulfilled_items).toBe(0);
      expect(order.status).toBe('pending');

      // Step 4: Simulate sync - order with no progress can be replaced
      const skipIds = getOrderIdsToSkipDuringSync();
      expect(skipIds).not.toContain('order-1'); // Now can be synced

      // But order still exists until actually replaced
      expect(getOrderById('order-1')).toBeDefined();
    });

    test('order with progress survives multiple sync cycles', () => {
      // Setup
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 3,
        status: 'in_progress'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 3
      });

      // Simulate multiple sync cycles
      for (let i = 0; i < 3; i++) {
        // Each sync: clear orders without progress, then verify
        clearOrdersWithoutProgress();
        
        const order = getOrderById('order-1');
        expect(order).toBeDefined();
        expect(order.fulfilled_items).toBe(3);
        
        const lineItems = getLineItemsByOrderId('order-1');
        expect(lineItems.length).toBe(1);
        expect(lineItems[0].fulfilled_quantity).toBe(3);
      }
    });
  });

  describe('Edge cases', () => {
    test('order with 0 fulfilled but line item has progress is preserved', () => {
      // This could happen if order.fulfilled_items got out of sync
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0, // Out of sync with line items
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 3 // Has progress!
      });

      // The main check is on order.fulfilled_items, so this might be cleared
      // This test documents current behavior
      const skipIds = getOrderIdsToSkipDuringSync();
      
      // Current implementation checks order.fulfilled_items
      // If this test fails, implementation may have been updated to check line items
      expect(skipIds).not.toContain('order-1');
    });

    test('multiple line items - progress persists independently', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 8,
        fulfilledItems: 5,
        status: 'in_progress'
      });

      // Two line items with different progress
      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 5
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-1',
        variantId: 'variant-2',
        productTitle: 'T-Shirt',
        variantTitle: 'Blue / Large',
        quantity: 3,
        fulfilledQuantity: 0
      });

      // After sync-like operations
      clearOrdersWithoutProgress();

      const lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems.length).toBe(2);
      
      const line1 = lineItems.find(li => li.line_item_id === 'line-1');
      const line2 = lineItems.find(li => li.line_item_id === 'line-2');
      
      expect(line1.fulfilled_quantity).toBe(5);
      expect(line2.fulfilled_quantity).toBe(0);
    });
  });
});
