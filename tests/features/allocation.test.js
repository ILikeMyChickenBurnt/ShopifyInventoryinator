/**
 * Feature Test: Quantity Allocation to Orders (FIFO)
 * 
 * Tests the core business logic of allocating made quantities
 * to orders in first-in-first-out order based on order date.
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertOrder,
  upsertOrderLineItem,
  upsertTask,
  updateMadeQuantity,
  allocateMadeQuantityToOrders,
  getOrderById,
  getLineItemsByOrderId,
  getTaskByVariantId
} = require('../helpers/test-database');

describe('Feature: Quantity Allocation to Orders (FIFO)', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  describe('Basic FIFO allocation', () => {
    test('allocates to oldest order first', () => {
      // Setup: Two orders with different dates
      upsertOrder({
        orderId: 'old-order',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrder({
        orderId: 'new-order',
        orderName: '#1002',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-old',
        orderId: 'old-order',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 0
      });

      upsertOrderLineItem({
        lineItemId: 'line-new',
        orderId: 'new-order',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        quantity: 5,
        fulfilledQuantity: 0
      });

      // Allocate 3 units
      allocateMadeQuantityToOrders('variant-1', 3);

      // Old order should get the allocation
      const oldLineItems = getLineItemsByOrderId('old-order');
      expect(oldLineItems[0].fulfilled_quantity).toBe(3);

      // New order should have no allocation yet
      const newLineItems = getLineItemsByOrderId('new-order');
      expect(newLineItems[0].fulfilled_quantity).toBe(0);
    });

    test('fills oldest order completely before moving to next', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrder({
        orderId: 'order-2',
        orderName: '#1002',
        orderDate: '2025-01-02T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 3,
        fulfilledQuantity: 0
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-2',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 3,
        fulfilledQuantity: 0
      });

      // Allocate 5 units (more than first order needs)
      allocateMadeQuantityToOrders('variant-1', 5);

      // First order should be fully fulfilled
      const lineItems1 = getLineItemsByOrderId('order-1');
      expect(lineItems1[0].fulfilled_quantity).toBe(3);

      // Second order should get the overflow
      const lineItems2 = getLineItemsByOrderId('order-2');
      expect(lineItems2[0].fulfilled_quantity).toBe(2);
    });

    test('updates order status when fully fulfilled', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
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

      // Allocate enough to fulfill
      allocateMadeQuantityToOrders('variant-1', 5);

      const order = getOrderById('order-1');
      expect(order.status).toBe('fulfilled');
      expect(order.fulfilled_items).toBe(5);
    });

    test('updates order status to in_progress when partially fulfilled', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
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

      // Partial allocation
      allocateMadeQuantityToOrders('variant-1', 3);

      const order = getOrderById('order-1');
      expect(order.status).toBe('in_progress');
      expect(order.fulfilled_items).toBe(3);
    });
  });

  describe('Multi-variant orders', () => {
    test('order with multiple variants tracks fulfillment per variant', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 8, // 5 + 3
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-red',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-1',
        variantId: 'variant-blue',
        productTitle: 'T-Shirt',
        variantTitle: 'Blue',
        quantity: 3,
        fulfilledQuantity: 0
      });

      // Allocate to red variant only
      allocateMadeQuantityToOrders('variant-red', 5);

      const lineItems = getLineItemsByOrderId('order-1');
      const redLine = lineItems.find(li => li.variant_id === 'variant-red');
      const blueLine = lineItems.find(li => li.variant_id === 'variant-blue');

      expect(redLine.fulfilled_quantity).toBe(5);
      expect(blueLine.fulfilled_quantity).toBe(0);

      // Order should show 5/8 fulfilled
      const order = getOrderById('order-1');
      expect(order.fulfilled_items).toBe(5);
      expect(order.status).toBe('in_progress');
    });

    test('order becomes fulfilled only when all variants are complete', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 8, // 5 + 3
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-red',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-1',
        variantId: 'variant-blue',
        productTitle: 'T-Shirt',
        variantTitle: 'Blue',
        quantity: 3,
        fulfilledQuantity: 0
      });

      // Fulfill red
      allocateMadeQuantityToOrders('variant-red', 5);
      let order = getOrderById('order-1');
      expect(order.status).toBe('in_progress');

      // Fulfill blue
      allocateMadeQuantityToOrders('variant-blue', 3);
      order = getOrderById('order-1');
      expect(order.status).toBe('fulfilled');
      expect(order.fulfilled_items).toBe(8);
    });
  });

  describe('Edge cases', () => {
    test('allocation with no matching line items does nothing', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-red',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      // Allocate to non-existent variant
      const result = allocateMadeQuantityToOrders('variant-blue', 5);

      expect(result).toEqual([]);
      
      const order = getOrderById('order-1');
      expect(order.fulfilled_items).toBe(0);
    });

    test('already-fulfilled line items are skipped', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 5,
        status: 'fulfilled'
      });

      upsertOrder({
        orderId: 'order-2',
        orderName: '#1002',
        orderDate: '2025-01-02T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 5 // Already fulfilled
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-2',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      // Allocate - should skip first order
      allocateMadeQuantityToOrders('variant-1', 3);

      // First order unchanged
      const lineItems1 = getLineItemsByOrderId('order-1');
      expect(lineItems1[0].fulfilled_quantity).toBe(5);

      // Second order gets the allocation
      const lineItems2 = getLineItemsByOrderId('order-2');
      expect(lineItems2[0].fulfilled_quantity).toBe(3);
    });

    test('incremental allocation adds to existing progress', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 10,
        fulfilledItems: 3,
        status: 'in_progress'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 10,
        fulfilledQuantity: 3 // Already has 3
      });

      // Add 4 more
      allocateMadeQuantityToOrders('variant-1', 4);

      const lineItems = getLineItemsByOrderId('order-1');
      expect(lineItems[0].fulfilled_quantity).toBe(7); // 3 + 4

      const order = getOrderById('order-1');
      expect(order.fulfilled_items).toBe(7);
    });

    test('returns list of newly fulfilled orders', () => {
      upsertOrder({
        orderId: 'order-1',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrder({
        orderId: 'order-2',
        orderName: '#1002',
        orderDate: '2025-01-02T10:00:00Z',
        totalItems: 3,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-1',
        orderId: 'order-1',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 3,
        fulfilledQuantity: 0
      });

      upsertOrderLineItem({
        lineItemId: 'line-2',
        orderId: 'order-2',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 3,
        fulfilledQuantity: 0
      });

      // Allocate enough to fulfill both
      const fulfilledOrders = allocateMadeQuantityToOrders('variant-1', 6);

      expect(fulfilledOrders).toHaveLength(2);
      expect(fulfilledOrders[0].orderName).toBe('#1001');
      expect(fulfilledOrders[1].orderName).toBe('#1002');
    });
  });

  describe('Archived order handling', () => {
    test('archived orders are skipped during allocation', () => {
      upsertOrder({
        orderId: 'archived-order',
        orderName: '#1001',
        orderDate: '2025-01-01T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'archived'
      });

      upsertOrder({
        orderId: 'active-order',
        orderName: '#1002',
        orderDate: '2025-01-10T10:00:00Z',
        totalItems: 5,
        fulfilledItems: 0,
        status: 'pending'
      });

      upsertOrderLineItem({
        lineItemId: 'line-archived',
        orderId: 'archived-order',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      upsertOrderLineItem({
        lineItemId: 'line-active',
        orderId: 'active-order',
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        quantity: 5,
        fulfilledQuantity: 0
      });

      // Allocate - should skip archived
      allocateMadeQuantityToOrders('variant-1', 5);

      // Archived order unchanged
      const archivedLineItems = getLineItemsByOrderId('archived-order');
      expect(archivedLineItems[0].fulfilled_quantity).toBe(0);

      // Active order gets the allocation
      const activeLineItems = getLineItemsByOrderId('active-order');
      expect(activeLineItems[0].fulfilled_quantity).toBe(5);
    });
  });
});
