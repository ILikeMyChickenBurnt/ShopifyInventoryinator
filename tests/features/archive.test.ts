/**
 * Feature Test: Archive/Unarchive Functionality
 * 
 * Tests the complete archive and unarchive workflow including
 * task quantity adjustments and order state management.
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
  getTaskByVariantId,
  getAllOrders,
  getArchivedOrders
} = require('../helpers/test-database');

describe('Feature: Archive/Unarchive Functionality', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  describe('Archive order', () => {
    test('archiveOrder() changes order status to archived', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      archiveOrder('order-1');

      const order = getOrderById('order-1');
      expect(order.status).toBe('archived');
    });

    test('archived order is excluded from getAllOrders()', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      upsertOrder({
        orderId: 'order-2',
        orderName: '#1002',
        orderDate: '2025-01-11T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      archiveOrder('order-1');

      const activeOrders = getAllOrders();
      expect(activeOrders).toHaveLength(1);
      expect(activeOrders[0].order_id).toBe('order-2');
    });

    test('archived order appears in getArchivedOrders()', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      archiveOrder('order-1');

      const archivedOrders = getArchivedOrders();
      expect(archivedOrders).toHaveLength(1);
      expect(archivedOrders[0].order_id).toBe('order-1');
    });

    test('archiveOrder() deallocates quantities from tasks', () => {
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
        totalQuantity: 10,
        madeQuantity: 5,
        status: 'in_progress'
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

      archiveOrder('order-1');

      const task = getTaskByVariantId('variant-1');
      expect(task.total_quantity).toBe(5); // 10 - 5
      expect(task.made_quantity).toBe(0);  // 5 - 5
    });

    test('archiving already-archived order returns alreadyArchived flag', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
      });

      const result = archiveOrder('order-1');
      expect(result.alreadyArchived).toBe(true);
    });

    test('archiving non-existent order throws error', () => {
      expect(() => {
        archiveOrder('non-existent');
      }).toThrow('Order not found');
    });
  });

  describe('Unarchive order', () => {
    test('unarchiveOrder() restores order to appropriate status', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
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

      unarchiveOrder('order-1');

      const order = getOrderById('order-1');
      expect(order.status).toBe('fulfilled'); // Restored based on fulfilled_items
    });

    test('unarchived order appears in getAllOrders()', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
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

      unarchiveOrder('order-1');

      const activeOrders = getAllOrders();
      expect(activeOrders).toHaveLength(1);
      expect(activeOrders[0].order_id).toBe('order-1');
    });

    test('unarchiveOrder() reallocates quantities to tasks', () => {
      // Start with task that has some quantities from other orders
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 3,
        madeQuantity: 2,
        status: 'in_progress'
      });

      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
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

      unarchiveOrder('order-1');

      const task = getTaskByVariantId('variant-1');
      expect(task.total_quantity).toBe(8); // 3 + 5
      expect(task.made_quantity).toBe(7);  // 2 + 5
    });

    test('unarchiveOrder() recreates deleted tasks', () => {
      // No task exists for this variant
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 3,
        status: 'archived'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'new-variant',
        productTitle: 'New Product',
        variantTitle: 'Size L',
        quantity: 5,
        fulfilledQuantity: 3
      });

      // Verify no task exists
      expect(getTaskByVariantId('new-variant')).toBeUndefined();

      unarchiveOrder('order-1');

      // Task should be recreated
      const task = getTaskByVariantId('new-variant');
      expect(task).toBeDefined();
      expect(task.total_quantity).toBe(5);
      expect(task.made_quantity).toBe(3);
      expect(task.status).toBe('in_progress');
    });

    test('unarchiving non-archived order returns notArchived flag', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      const result = unarchiveOrder('order-1');
      expect(result.notArchived).toBe(true);
    });

    test('unarchiving non-existent order throws error', () => {
      expect(() => {
        unarchiveOrder('non-existent');
      }).toThrow('Order not found');
    });
  });

  describe('Archive/Unarchive round-trip', () => {
    test('archive then unarchive preserves line items', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 8,
        fulfilledItems: 8,
        status: 'fulfilled'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 5
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-1',
        variantId: 'variant-2',
        productTitle: 'T-Shirt',
        variantTitle: 'Blue',
        quantity: 3,
        fulfilledQuantity: 3
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 5,
        madeQuantity: 5,
        status: 'completed'
      });

      upsertTask({
        variantId: 'variant-2',
        productTitle: 'T-Shirt',
        variantTitle: 'Blue',
        totalQuantity: 3,
        madeQuantity: 3,
        status: 'completed'
      });

      // Archive
      archiveOrder('order-1');

      // Unarchive
      unarchiveOrder('order-1');

      // Verify line items still exist
      const lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems).toHaveLength(2);

      // Verify order is back to fulfilled
      const order = getOrderById('order-1');
      expect(order.status).toBe('fulfilled');
    });

    test('multiple archive/unarchive cycles maintain integrity', () => {
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
        variantTitle: 'Red',
        totalQuantity: 5,
        madeQuantity: 5,
        status: 'completed'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 5
      });

      // Cycle 1
      archiveOrder('order-1');
      unarchiveOrder('order-1');

      // Cycle 2
      archiveOrder('order-1');
      unarchiveOrder('order-1');

      // Cycle 3
      archiveOrder('order-1');
      unarchiveOrder('order-1');

      // Final state should be restored
      const order = getOrderById('order-1');
      expect(order.status).toBe('fulfilled');

      const task = getTaskByVariantId('variant-1');
      expect(task.total_quantity).toBe(5);
      expect(task.made_quantity).toBe(5);
      expect(task.status).toBe('completed');
    });
  });

  describe('Status restoration logic', () => {
    test('unarchive sets status to fulfilled when all items complete', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'archived'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 5
      });

      unarchiveOrder('order-1');

      expect(getOrderById('order-1').status).toBe('fulfilled');
    });

    test('unarchive sets status to in_progress when partially complete', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 3,
        status: 'archived'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 3
      });

      unarchiveOrder('order-1');

      expect(getOrderById('order-1').status).toBe('in_progress');
    });

    test('unarchive sets status to pending when no progress', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'archived'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      unarchiveOrder('order-1');

      expect(getOrderById('order-1').status).toBe('pending');
    });
  });
});
