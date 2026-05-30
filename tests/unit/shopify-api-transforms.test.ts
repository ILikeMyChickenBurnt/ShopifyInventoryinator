/**
 * Unit Tests: Shopify API Transformation Functions
 *
 * These are pure functions extracted for testability.
 * They transform raw Shopify/FulfillmentOrder data into the shapes
 * expected by the rest of the application (tasks + per-order storage).
 *
 * The *Impl functions are the actual implementations; the module re-exports them
 * under the clean public names for both production use (via class delegation) and testing.
 */

const {
  aggregateByVariant,
  extractOrdersForStorage,
  extractInventoryForStorage,
  aggregateByVariantFromFulfillmentOrders,
  extractOrdersForStorageFromFulfillmentOrders,
  extractFulfilledOrdersForStorageFromFulfillmentOrders
} = require('../../src/main/shopify-api');

describe('Shopify API Transforms', () => {

  const sampleOpenFulfillmentOrders = [
    {
      id: 'fo-1',
      status: 'OPEN',
      orderName: '#1001',
      order: { id: 'order-1001', createdAt: '2025-01-01', name: '#1001' },
      lineItems: {
        edges: [
          {
            node: {
              remainingQuantity: 3,
              totalQuantity: 5,
              sku: 'SKU-1',
              productTitle: 'T-Shirt',
              variantTitle: 'Red',
              lineItem: { id: 'li-1' },
              variant: {
                id: 'var-1',
                title: 'Red',
                sku: 'SKU-1',
                image: null,
                product: { id: 'prod-1', title: 'T-Shirt', featuredImage: null }
              }
            }
          }
        ]
      }
    }
  ];

  const sampleClosedFulfillmentOrders = [
    {
      id: 'fo-2',
      status: 'CLOSED',
      orderName: '#1002',
      order: { id: 'order-1002', createdAt: '2025-01-02', name: '#1002' },
      lineItems: {
        edges: [
          {
            node: {
              remainingQuantity: 0,
              totalQuantity: 4,
              sku: 'SKU-2',
              productTitle: 'Hoodie',
              variantTitle: 'Black',
              lineItem: { id: 'li-2' },
              variant: {
                id: 'var-2',
                title: 'Black',
                sku: 'SKU-2',
                image: null,
                product: { id: 'prod-2', title: 'Hoodie', featuredImage: null }
              }
            }
          }
        ]
      }
    }
  ];

  // ============================================================
  // MODERN FULFILLMENT ORDER TRANSFORMS (2025-04 path)
  // ============================================================

  describe('aggregateByVariantFromFulfillmentOrders', () => {
    test('aggregates remaining quantities by variant', () => {
      const result = aggregateByVariantFromFulfillmentOrders(sampleOpenFulfillmentOrders);

      expect(result).toHaveLength(1);
      expect(result[0].totalQuantity).toBe(3);
      expect(result[0].variantId).toBe('var-1');
    });

    test('returns empty array for empty input', () => {
      expect(aggregateByVariantFromFulfillmentOrders([])).toEqual([]);
    });

    test('returns empty array for null input (defensive)', () => {
      expect(aggregateByVariantFromFulfillmentOrders(null)).toEqual([]);
    });

    test('returns empty array for undefined input (defensive)', () => {
      expect(aggregateByVariantFromFulfillmentOrders(undefined)).toEqual([]);
    });

    test('processes SCHEDULED status items (no status gate inside transform; caller query controls this)', () => {
      const scheduledItem = [{
        id: 'fo-sched-1',
        status: 'SCHEDULED',
        orderName: '#S1',
        order: { id: 'ord-s1', createdAt: '2025-03-01', name: '#S1' },
        lineItems: {
          edges: [{
            node: {
              remainingQuantity: 5,
              totalQuantity: 5,
              sku: 'SKU-SCHED',
              productTitle: 'Scheduled Item',
              variantTitle: 'Default',
              lineItem: { id: 'li-s1' },
              variant: {
                id: 'var-sched',
                title: 'Default',
                sku: 'SKU-SCHED',
                image: null,
                product: { id: 'p-sched', title: 'Scheduled Item', featuredImage: null }
              }
            }
          }]
        }
      }];
      const result = aggregateByVariantFromFulfillmentOrders(scheduledItem);
      expect(result).toHaveLength(1);
      expect(result[0].totalQuantity).toBe(5);
    });

    test('still processes CLOSED items if passed (status filtering lives in GraphQL layer for active path)', () => {
      const closedItem = [{
        id: 'fo-c-pass',
        status: 'CLOSED',
        orderName: '#C1',
        order: { id: 'ord-c1', createdAt: '2025-03-02', name: '#C1' },
        lineItems: {
          edges: [{
            node: {
              remainingQuantity: 3,
              totalQuantity: 8,
              sku: 'SKU-CLOSED',
              productTitle: 'Closed Item',
              variantTitle: 'Default',
              lineItem: { id: 'li-c1' },
              variant: {
                id: 'var-closed',
                title: 'Default',
                sku: 'SKU-CLOSED',
                image: null,
                product: { id: 'p-closed', title: 'Closed Item', featuredImage: null }
              }
            }
          }]
        }
      }];
      const result = aggregateByVariantFromFulfillmentOrders(closedItem);
      expect(result).toHaveLength(1);
      expect(result[0].totalQuantity).toBe(3);
    });

    test('skips line items with remainingQuantity <= 0', () => {
      const zeroQty = [{
        ...sampleOpenFulfillmentOrders[0],
        lineItems: {
          edges: [{
            node: {
              ...sampleOpenFulfillmentOrders[0].lineItems.edges[0].node,
              remainingQuantity: 0
            }
          }]
        }
      }];
      const result = aggregateByVariantFromFulfillmentOrders(zeroQty);
      expect(result).toEqual([]);
    });

    test('skips line items with missing variant object', () => {
      const noVariant = [{
        ...sampleOpenFulfillmentOrders[0],
        lineItems: {
          edges: [{
            node: {
              ...sampleOpenFulfillmentOrders[0].lineItems.edges[0].node,
              variant: null
            }
          }]
        }
      }];
      const result = aggregateByVariantFromFulfillmentOrders(noVariant);
      expect(result).toEqual([]);
    });

    test('aggregates same variant across multiple fulfillment orders', () => {
      const fo1 = sampleOpenFulfillmentOrders[0];
      const fo2 = {
        ...fo1,
        id: 'fo-1b',
        lineItems: {
          edges: [{
            node: {
              ...fo1.lineItems.edges[0].node,
              remainingQuantity: 7
            }
          }]
        }
      };
      const result = aggregateByVariantFromFulfillmentOrders([fo1, fo2]);
      expect(result).toHaveLength(1);
      expect(result[0].totalQuantity).toBe(10); // 3 + 7
    });

    test('falls back to top-level sku when variant.sku is missing', () => {
      const noVarSku = [{
        ...sampleOpenFulfillmentOrders[0],
        lineItems: {
          edges: [{
            node: {
              ...sampleOpenFulfillmentOrders[0].lineItems.edges[0].node,
              sku: 'TOP-LEVEL-SKU',
              variant: {
                ...sampleOpenFulfillmentOrders[0].lineItems.edges[0].node.variant,
                sku: null
              }
            }
          }]
        }
      }];
      const result = aggregateByVariantFromFulfillmentOrders(noVarSku);
      expect(result[0].sku).toBe('TOP-LEVEL-SKU');
    });

    test('falls back to productTitle when variant.product.title is missing', () => {
      const fallbackTitle = [{
        ...sampleOpenFulfillmentOrders[0],
        lineItems: {
          edges: [{
            node: {
              ...sampleOpenFulfillmentOrders[0].lineItems.edges[0].node,
              productTitle: 'Fallback Title',
              variant: {
                ...sampleOpenFulfillmentOrders[0].lineItems.edges[0].node.variant,
                product: null
              }
            }
          }]
        }
      }];
      const result = aggregateByVariantFromFulfillmentOrders(fallbackTitle);
      expect(result[0].productTitle).toBe('Fallback Title');
    });

    test('handles missing lineItems or edges gracefully', () => {
      const malformed = [
        { id: 'fo-bad-1', status: 'OPEN' }, // no lineItems
        { id: 'fo-bad-2', status: 'OPEN', lineItems: null },
        { id: 'fo-bad-3', status: 'OPEN', lineItems: { edges: null } }
      ];
      const result = aggregateByVariantFromFulfillmentOrders(malformed);
      expect(result).toEqual([]);
    });
  });

  describe('extractOrdersForStorageFromFulfillmentOrders', () => {
    test('produces per-order line item data using remainingQuantity as the need', () => {
      const result = extractOrdersForStorageFromFulfillmentOrders(sampleOpenFulfillmentOrders);

      expect(result).toHaveLength(1);
      expect(result[0].orderName).toBe('#1001');
      expect(result[0].lineItems[0].quantity).toBe(3);
    });

    test('returns empty array for empty input', () => {
      expect(extractOrdersForStorageFromFulfillmentOrders([])).toEqual([]);
    });

    test('returns empty array for null/undefined input', () => {
      expect(extractOrdersForStorageFromFulfillmentOrders(null)).toEqual([]);
      expect(extractOrdersForStorageFromFulfillmentOrders(undefined)).toEqual([]);
    });

    test('excludes fulfillment orders with no usable line items after filtering', () => {
      const emptyLines = [{
        ...sampleOpenFulfillmentOrders[0],
        lineItems: { edges: [] }
      }];
      const result = extractOrdersForStorageFromFulfillmentOrders([emptyLines]);
      expect(result).toEqual([]);
    });

    test('groups multiple line items under the same order', () => {
      const fo = sampleOpenFulfillmentOrders[0];
      const multiLine = {
        ...fo,
        lineItems: {
          edges: [
            fo.lineItems.edges[0],
            {
              node: {
                ...fo.lineItems.edges[0].node,
                remainingQuantity: 1,
                variant: {
                  ...fo.lineItems.edges[0].node.variant,
                  id: 'var-1b',
                  sku: 'SKU-1B'
                }
              }
            }
          ]
        }
      };
      const result = extractOrdersForStorageFromFulfillmentOrders([multiLine]);
      expect(result).toHaveLength(1);
      expect(result[0].lineItems).toHaveLength(2);
      expect(result[0].totalItems).toBe(4); // 3 + 1
    });

    test('preserves orderDate and orderId from the nested order object', () => {
      const result = extractOrdersForStorageFromFulfillmentOrders(sampleOpenFulfillmentOrders);
      expect(result[0].orderId).toBe('order-1001');
      expect(result[0].orderDate).toBe('2025-01-01');
    });
  });

  describe('extractFulfilledOrdersForStorageFromFulfillmentOrders', () => {
    test('produces fully fulfilled records using totalQuantity', () => {
      const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(sampleClosedFulfillmentOrders);

      expect(result).toHaveLength(1);
      const item = result[0].lineItems[0];
      expect(item.quantity).toBe(4);
      expect(item.fulfilledQuantity).toBe(4);
    });

    test('ignores non-closed fulfillment orders', () => {
      const mixed = [...sampleClosedFulfillmentOrders, ...sampleOpenFulfillmentOrders];
      const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(mixed);
      expect(result).toHaveLength(1);
      expect(result[0].orderName).toBe('#1002');
    });

    test('returns empty array for empty input', () => {
      expect(extractFulfilledOrdersForStorageFromFulfillmentOrders([])).toEqual([]);
    });

    test('returns empty array for null/undefined input', () => {
      expect(extractFulfilledOrdersForStorageFromFulfillmentOrders(null)).toEqual([]);
      expect(extractFulfilledOrdersForStorageFromFulfillmentOrders(undefined)).toEqual([]);
    });

    test('only includes CLOSED status even when other statuses are present', () => {
      const mixedStatuses = [
        ...sampleClosedFulfillmentOrders,
        { ...sampleOpenFulfillmentOrders[0], status: 'SCHEDULED' },
        { ...sampleOpenFulfillmentOrders[0], id: 'fo-open-2', status: 'OPEN' }
      ];
      const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(mixedStatuses);
      expect(result).toHaveLength(1);
      expect(result[0].orderName).toBe('#1002');
    });

    test('skips line items with totalQuantity <= 0 on closed orders', () => {
      const zeroTotal = [{
        ...sampleClosedFulfillmentOrders[0],
        lineItems: {
          edges: [{
            node: {
              ...sampleClosedFulfillmentOrders[0].lineItems.edges[0].node,
              totalQuantity: 0
            }
          }]
        }
      }];
      const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(zeroTotal);
      expect(result).toEqual([]);
    });

    test('sets both quantity and fulfilledQuantity to totalQuantity', () => {
      const result = extractFulfilledOrdersForStorageFromFulfillmentOrders(sampleClosedFulfillmentOrders);
      const li = result[0].lineItems[0];
      expect(li.quantity).toBe(li.fulfilledQuantity);
      expect(li.quantity).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // LEGACY TRANSFORMS (pre-2025-04 fallback path)
  // ============================================================

  const sampleLegacyOrders = [
    {
      id: 'order-legacy-1',
      name: '#2001',
      createdAt: '2025-02-01',
      lineItems: {
        edges: [
          {
            node: {
              id: 'li-legacy-1',
              fulfillableQuantity: 2,
              variant: {
                id: 'var-legacy-1',
                title: 'Blue',
                sku: 'SKU-LEGACY',
                image: null,
                product: { id: 'p-legacy', title: 'Legacy Product', featuredImage: null }
              }
            }
          }
        ]
      }
    }
  ];

  const sampleLegacyProducts = [
    {
      id: 'prod-inv-1',
      title: 'Inventory Test',
      featuredImage: null,
      variants: {
        edges: [
          {
            node: {
              id: 'var-inv-1',
              title: 'Default',
              sku: 'INV-001',
              inventoryQuantity: 42,
              image: null
            }
          }
        ]
      }
    }
  ];

  describe('Legacy transforms', () => {
    test('aggregateByVariant aggregates fulfillable quantities by variant', () => {
      const result = aggregateByVariant(sampleLegacyOrders);
      expect(result).toHaveLength(1);
      expect(result[0].totalQuantity).toBe(2);
    });

    test('extractOrdersForStorage produces correct per-order data', () => {
      const result = extractOrdersForStorage(sampleLegacyOrders);
      expect(result).toHaveLength(1);
      expect(result[0].lineItems[0].quantity).toBe(2);
    });

    test('extractInventoryForStorage produces correct inventory records', () => {
      const result = extractInventoryForStorage(sampleLegacyProducts);
      expect(result).toHaveLength(1);
      expect(result[0].inventoryQuantity).toBe(42);
      expect(result[0].sku).toBe('INV-001');
    });
  });

  // ============================================================
  // EDGE CASES AND ROBUSTNESS (cross-cutting)
  // ============================================================

  describe('Legacy transforms - edge cases', () => {
    test('aggregateByVariant returns [] for empty orders array', () => {
      expect(aggregateByVariant([])).toEqual([]);
    });

    test('aggregateByVariant skips items with fulfillableQuantity <= 0', () => {
      const zero = [{
        ...sampleLegacyOrders[0],
        lineItems: {
          edges: [{
            node: {
              ...sampleLegacyOrders[0].lineItems.edges[0].node,
              fulfillableQuantity: 0
            }
          }]
        }
      }];
      expect(aggregateByVariant(zero)).toEqual([]);
    });

    test('extractOrdersForStorage skips orders with no usable line items', () => {
      const noLines = [{ id: 'o1', name: '#1', lineItems: { edges: [] } }];
      expect(extractOrdersForStorage(noLines)).toEqual([]);
    });

    test('extractOrdersForStorage handles missing lineItems gracefully', () => {
      expect(extractOrdersForStorage([{ id: 'o1' }])).toEqual([]);
    });
  });

  describe('extractInventoryForStorage - edge cases', () => {
    test('returns empty array for empty products input', () => {
      expect(extractInventoryForStorage([])).toEqual([]);
    });

    test('returns empty array for null/undefined products', () => {
      expect(extractInventoryForStorage(null)).toEqual([]);
      expect(extractInventoryForStorage(undefined)).toEqual([]);
    });

    test('skips products that have no variants', () => {
      const noVariants = [{ id: 'p1', title: 'NoVars', variants: { edges: [] } }];
      expect(extractInventoryForStorage(noVariants)).toEqual([]);
    });

    test('defaults inventoryQuantity to 0 when missing or null', () => {
      const noInv = [{
        id: 'p1',
        title: 'Test',
        variants: {
          edges: [{
            node: {
              id: 'v1',
              title: 'Default',
              sku: 'NO-INV',
              inventoryQuantity: null,
              image: null
            }
          }]
        }
      }];
      const result = extractInventoryForStorage(noInv);
      expect(result[0].inventoryQuantity).toBe(0);
    });

    test('uses product featuredImage when variant image is missing', () => {
      const prodImage = [{
        id: 'p1',
        title: 'Prod',
        featuredImage: { url: 'prod.jpg' },
        variants: {
          edges: [{
            node: {
              id: 'v1',
              title: 'Var',
              sku: 'IMG-FALLBACK',
              inventoryQuantity: 5,
              image: null
            }
          }]
        }
      }];
      const result = extractInventoryForStorage(prodImage);
      expect(result[0].imageUrl).toBe('prod.jpg');
    });
  });

  describe('Cross-cutting null safety and malformed data', () => {
    test('all transforms are null/undefined safe and never throw', () => {
      const inputs = [null, undefined, [], [{}], [{ lineItems: null }]];

      expect(() => aggregateByVariantFromFulfillmentOrders(inputs[0])).not.toThrow();
      expect(() => extractOrdersForStorageFromFulfillmentOrders(inputs[0])).not.toThrow();
      expect(() => extractFulfilledOrdersForStorageFromFulfillmentOrders(inputs[0])).not.toThrow();
      expect(() => aggregateByVariant(inputs[0])).not.toThrow();
      expect(() => extractOrdersForStorage(inputs[0])).not.toThrow();
      expect(() => extractInventoryForStorage(inputs[0])).not.toThrow();
    });

    test('all transforms return arrays (never null or undefined)', () => {
      [null, undefined, []].forEach(input => {
        expect(Array.isArray(aggregateByVariantFromFulfillmentOrders(input))).toBe(true);
        expect(Array.isArray(extractOrdersForStorageFromFulfillmentOrders(input))).toBe(true);
        expect(Array.isArray(extractFulfilledOrdersForStorageFromFulfillmentOrders(input))).toBe(true);
        expect(Array.isArray(aggregateByVariant(input))).toBe(true);
        expect(Array.isArray(extractOrdersForStorage(input))).toBe(true);
        expect(Array.isArray(extractInventoryForStorage(input))).toBe(true);
      });
    });
  });
});