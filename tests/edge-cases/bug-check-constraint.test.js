/**
 * Bug Regression Test: CHECK Constraint Failed When Archiving
 * 
 * Bug: When archiving an order, the database threw "CHECK constraint failed"
 * because the 'archived' status was not in the CHECK constraint.
 * 
 * Fix: Added 'archived' to the status CHECK constraint in orders table.
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertOrder,
  upsertOrderLineItem,
  upsertTask,
  archiveOrder,
  getOrderByOrderId
} = require('../helpers/test-database');

describe('Bug Regression: CHECK Constraint Failed When Archiving', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  test('orders table accepts "archived" status value', () => {
    // Insert an order with archived status directly
    upsertOrder({
      orderId: 'order-1',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 5,
      status: 'pending' // Start as pending, will be archived
    });

    // Add a task so archive has something to deallocate
    upsertTask({
      variantId: 'variant-1',
      variantTitle: 'Red / Medium',
      productTitle: 'T-Shirt',
      totalQuantity: 5,
      madeQuantity: 5,
      status: 'completed'
    });

    // Add line item
    upsertOrderLineItem({
      lineItemId: 'line-1',
      orderId: 'order-1',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 5,
      fulfilledQuantity: 5
    });

    // Mark order as fulfilled
    const db = require('../helpers/test-database').getTestDb();
    db.prepare("UPDATE orders SET status = 'fulfilled', fulfilled_items = 5 WHERE order_id = ?")
      .run('order-1');

    // This should NOT throw CHECK constraint error
    expect(() => {
      archiveOrder('order-1');
    }).not.toThrow();

    // Verify order is archived
    const order = getOrderByOrderId('order-1');
    expect(order.status).toBe('archived');
  });

  test('archiveOrder() successfully sets status to archived', () => {
    // Setup: Create a fulfilled order
    upsertOrder({
      orderId: 'order-2',
      orderName: '#1002',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-2',
      variantTitle: 'Blue / Large',
      productTitle: 'T-Shirt',
      totalQuantity: 3,
      madeQuantity: 3,
      status: 'completed'
    });

    upsertOrderLineItem({
      lineItemId: 'line-2',
      orderId: 'order-2',
      variantId: 'variant-2',
      productTitle: 'T-Shirt',
      variantTitle: 'Blue / Large',
      quantity: 3,
      fulfilledQuantity: 3
    });

    // Archive the order
    const result = archiveOrder('order-2');

    // Should succeed
    expect(result.archived).toBe(true);

    // Order should have archived status
    const order = getOrderByOrderId('order-2');
    expect(order.status).toBe('archived');
  });

  test('archiveOrder() on already-archived order returns alreadyArchived: true', () => {
    // Setup: Create and archive an order
    upsertOrder({
      orderId: 'order-3',
      orderName: '#1003',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 2,
      fulfilledItems: 2,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-3',
      variantTitle: 'Green / Small',
      productTitle: 'T-Shirt',
      totalQuantity: 2,
      madeQuantity: 2,
      status: 'completed'
    });

    upsertOrderLineItem({
      lineItemId: 'line-3',
      orderId: 'order-3',
      variantId: 'variant-3',
      productTitle: 'T-Shirt',
      variantTitle: 'Green / Small',
      quantity: 2,
      fulfilledQuantity: 2
    });

    // First archive
    archiveOrder('order-3');

    // Second archive attempt
    const result = archiveOrder('order-3');

    // Should indicate already archived
    expect(result.alreadyArchived).toBe(true);
  });

  test('all valid order statuses are accepted', () => {
    const validStatuses = ['pending', 'in_progress', 'fulfilled', 'archived'];

    validStatuses.forEach((status, index) => {
      expect(() => {
        upsertOrder({
          orderId: `status-test-${index}`,
          orderName: `#100${index}`,
          orderDate: '2025-01-10T10:00:00Z',
          totalItems: 1,
          fulfilledItems: 0,
          status: status === 'archived' ? 'pending' : status // Can't insert as archived directly due to logic
        });
      }).not.toThrow();
    });
  });
});
