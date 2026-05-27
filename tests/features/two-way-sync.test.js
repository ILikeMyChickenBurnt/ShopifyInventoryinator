/**
 * Feature Test: Two-Way Sync - Shopify Fulfillment Reconciliation
 * 
 * Tests the extraction logic used when detecting orders that were fulfilled
 * directly in Shopify (outside the desktop app).
 */

const { extractFulfilledOrdersForStorageFromFulfillmentOrders } = require('../../src/main/shopify-api');

describe('Two-Way Sync: Shopify Fulfillment Detection', () => {

  const sampleClosedFulfillmentOrders = [
    {
      id: 'gid://shopify/FulfillmentOrder/9001',
      status: 'CLOSED',
      orderName: '#1234',
      order: {
        id: 'gid://shopify/Order/1234',
        createdAt: '2025-01-10T10:00:00Z',
        name: '#1234'
      },
      lineItems: {
        edges: [
          {
            node: {
              id: 'gid://shopify/FulfillmentOrderLineItem/1',
              remainingQuantity: 0,
              totalQuantity: 5,
              sku: 'TSH-RED-M',
              productTitle: 'T-Shirt',
              variantTitle: 'Red / Medium',
              lineItem: { id: 'gid://shopify/LineItem/abc' },
              variant: {
                id: 'gid://shopify/ProductVariant/V001',
                title: 'Red / Medium',
                sku: 'TSH-RED-M',
                image: null,
                product: {
                  id: 'gid://shopify/Product/P001',
                  title: 'T-Shirt',
                  featuredImage: null
                }
              }
            }
          }
        ]
      }
    },
    {
      id: 'gid://shopify/FulfillmentOrder/9002',
      status: 'CLOSED',
      orderName: '#1235',
      order: {
        id: 'gid://shopify/Order/1235',
        createdAt: '2025-01-11T11:00:00Z',
        name: '#1235'
      },
      lineItems: {
        edges: [
          {
            node: {
              id: 'gid://shopify/FulfillmentOrderLineItem/2',
              remainingQuantity: 0,
              totalQuantity: 3,
              sku: 'HOD-BLK',
              productTitle: 'Hoodie',
              variantTitle: 'Black',
              lineItem: { id: 'gid://shopify/LineItem/def' },
              variant: {
                id: 'gid://shopify/ProductVariant/V002',
                title: 'Black',
                sku: 'HOD-BLK',
                image: null,
                product: { id: 'gid://shopify/Product/P002', title: 'Hoodie', featuredImage: null }
              }
            }
          }
        ]
      }
    }
  ];

  it('extracts fulfilled orders with quantity = totalQuantity and marks them as fully fulfilled', () => {
    const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(sampleClosedFulfillmentOrders);

    expect(result).toHaveLength(2);

    const order1234 = result.find(o => o.orderName === '#1234');
    expect(order1234).toBeDefined();
    expect(order1234.totalItems).toBe(5);
    expect(order1234.lineItems).toHaveLength(1);

    const lineItem = order1234.lineItems[0];
    expect(lineItem.quantity).toBe(5);
    expect(lineItem.fulfilledQuantity).toBe(5); // Fully fulfilled from Shopify
    expect(lineItem.variantId).toBe('gid://shopify/ProductVariant/V001');
  });

  it('ignores non-closed fulfillment orders', () => {
    const mixed = [
      ...sampleClosedFulfillmentOrders,
      {
        id: 'gid://shopify/FulfillmentOrder/9999',
        status: 'OPEN', // should be ignored
        orderName: '#9999',
        order: { id: 'gid://shopify/Order/9999', createdAt: '2025-01-01', name: '#9999' },
        lineItems: {
          edges: [{
            node: {
              remainingQuantity: 2,
              totalQuantity: 2,
              variant: { id: 'v1', title: 'x', sku: '', image: null, product: { id: 'p', title: '', featuredImage: null } }
            }
          }]
        }
      }
    ];

    const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(mixed);
    const names = result.map(o => o.orderName);
    expect(names).not.toContain('#9999');
    expect(result).toHaveLength(2);
  });

  it('produces data compatible with order + line item upsert expectations', () => {
    const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(sampleClosedFulfillmentOrders);

    result.forEach(order => {
      expect(order).toHaveProperty('orderId');
      expect(order).toHaveProperty('orderName');
      expect(order).toHaveProperty('totalItems');
      expect(order).toHaveProperty('lineItems');
      expect(Array.isArray(order.lineItems)).toBe(true);

      order.lineItems.forEach(li => {
        expect(li).toHaveProperty('orderId');
        expect(li).toHaveProperty('lineItemId');
        expect(li).toHaveProperty('variantId');
        expect(li).toHaveProperty('quantity');
        expect(li).toHaveProperty('fulfilledQuantity');
        expect(li.fulfilledQuantity).toBe(li.quantity); // fully fulfilled
      });
    });
  });
});