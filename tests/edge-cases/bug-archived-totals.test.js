/**
 * Bug Regression Test: Archived Order Quantities Still in Task Totals
 * 
 * Bug: After archiving an order, the task totals still included the quantities
 * from that archived order, causing inflated totals.
 * 
 * Fix: archiveOrder() now deallocates quantities from tasks when archiving.
 * recalculateTaskTotalsFromOrders() excludes archived orders from totals.
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertOrder,
  upsertOrderLineItem,
  upsertTask,
  archiveOrder,
  getTaskByVariantId,
  getAllTasks,
  recalculateTaskTotalsFromOrders
} = require('../helpers/test-database');

describe('Bug Regression: Archived Order Quantities Still in Task Totals', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  test('archiveOrder() subtracts fulfilled_quantity from task.made_quantity', () => {
    // Setup: Order with 5 items, 3 fulfilled
    upsertOrder({
      orderId: 'order-1',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 3,
      status: 'in_progress'
    });

    // Task with total=10, made=5 (3 from this order, 2 from elsewhere)
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
      fulfilledQuantity: 3
    });

    // Mark order as fulfilled so it can be archived
    const db = require('../helpers/test-database').getTestDb();
    db.prepare("UPDATE orders SET status = 'fulfilled', fulfilled_items = 5 WHERE order_id = ?")
      .run('order-1');
    db.prepare("UPDATE order_line_items SET fulfilled_quantity = 5 WHERE order_id = ?")
      .run('order-1');

    // Archive the order
    archiveOrder('order-1');

    // Task made_quantity should be reduced by 5 (the fulfilled amount)
    const task = getTaskByVariantId('variant-1');
    expect(task.made_quantity).toBe(0); // 5 - 5 = 0
  });

  test('archiveOrder() subtracts quantity from task.total_quantity', () => {
    // Setup: Order with 5 items
    upsertOrder({
      orderId: 'order-1',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 5,
      status: 'fulfilled'
    });

    // Task with total=10
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

    // Archive
    archiveOrder('order-1');

    // Task total_quantity should be reduced by 5
    const task = getTaskByVariantId('variant-1');
    expect(task.total_quantity).toBe(5); // 10 - 5 = 5
  });

  test('task is deleted when total_quantity becomes 0 after archive', () => {
    // Setup: Only one order for this variant
    upsertOrder({
      orderId: 'order-1',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    // Task with total=3 (all from this one order)
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
      orderId: 'order-1',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 3
    });

    // Archive
    archiveOrder('order-1');

    // Task should be deleted since total would be 0
    const task = getTaskByVariantId('variant-1');
    expect(task).toBeUndefined();
  });

  test('task status updates correctly after archive (completed → in_progress if work remains)', () => {
    // Setup: Two orders for same variant
    // Order 1: 5 items, 5 fulfilled (will be archived)
    // Order 2: 3 items, 0 fulfilled (stays active)
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

    // Task: total=8, made=5 → should go to pending after archive (made=0, total=3)
    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 8,
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

    upsertOrderLineItem({
      lineItemId: 'line-2',
      orderId: 'order-2',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 0
    });

    // Archive order-1
    archiveOrder('order-1');

    // Task should now be pending (made=0, total=3)
    const task = getTaskByVariantId('variant-1');
    expect(task.total_quantity).toBe(3);
    expect(task.made_quantity).toBe(0);
    expect(task.status).toBe('pending');
  });

  test('recalculateTaskTotalsFromOrders() excludes archived orders from totals', () => {
    // Setup: Create two orders
    upsertOrder({
      orderId: 'order-1',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 3,
      status: 'in_progress'
    });

    upsertOrder({
      orderId: 'order-2',
      orderName: '#1002',
      orderDate: '2025-01-11T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      status: 'fulfilled'
    });

    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 8, // 5 + 3
      madeQuantity: 6,  // 3 + 3
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

    upsertOrderLineItem({
      lineItemId: 'line-2',
      orderId: 'order-2',
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      quantity: 3,
      fulfilledQuantity: 3
    });

    // Archive order-2
    archiveOrder('order-2');

    // Recalculate totals (simulating what happens after sync)
    recalculateTaskTotalsFromOrders();

    // Task should only include order-1's quantities
    const task = getTaskByVariantId('variant-1');
    expect(task.total_quantity).toBe(5);  // Only from order-1
    expect(task.made_quantity).toBe(3);   // Only from order-1
  });

  test('multiple variants in same order all get deallocated on archive', () => {
    // Setup: Order with multiple line items
    upsertOrder({
      orderId: 'order-1',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 8,
      fulfilledItems: 8,
      status: 'fulfilled'
    });

    // Two different tasks
    upsertTask({
      variantId: 'variant-1',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      totalQuantity: 5,
      madeQuantity: 5,
      status: 'completed'
    });

    upsertTask({
      variantId: 'variant-2',
      productTitle: 'T-Shirt',
      variantTitle: 'Blue / Large',
      totalQuantity: 3,
      madeQuantity: 3,
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

    upsertOrderLineItem({
      lineItemId: 'line-2',
      orderId: 'order-1',
      variantId: 'variant-2',
      productTitle: 'T-Shirt',
      variantTitle: 'Blue / Large',
      quantity: 3,
      fulfilledQuantity: 3
    });

    // Archive the order
    archiveOrder('order-1');

    // Both tasks should be deleted (total becomes 0)
    expect(getTaskByVariantId('variant-1')).toBeUndefined();
    expect(getTaskByVariantId('variant-2')).toBeUndefined();
  });
});
