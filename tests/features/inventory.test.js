/**
 * Inventory Feature Tests
 * 
 * Tests for the inventory tracking functionality:
 * - Upsert inventory data
 * - Bulk upsert
 * - Filtering (all, out-of-stock)
 * - Search
 * - Stats calculation
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertInventory,
  bulkUpsertInventory,
  getAllInventory,
  getInventoryByVariantId,
  getInventoryStats,
  clearAllInventory
} = require('../helpers/test-database');

describe('Inventory Feature', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  describe('Upsert inventory', () => {
    test('inserts new inventory record', () => {
      upsertInventory({
        variantId: 'variant-1',
        productId: 'product-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Large',
        sku: 'TS-RED-L',
        imageUrl: 'https://example.com/image.jpg',
        inventoryQuantity: 50
      });

      const inventory = getInventoryByVariantId('variant-1');
      expect(inventory).toBeDefined();
      expect(inventory.product_title).toBe('T-Shirt');
      expect(inventory.variant_title).toBe('Red / Large');
      expect(inventory.sku).toBe('TS-RED-L');
      expect(inventory.inventory_quantity).toBe(50);
    });

    test('updates existing inventory record', () => {
      upsertInventory({
        variantId: 'variant-1',
        productId: 'product-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Large',
        inventoryQuantity: 50
      });

      // Update with new quantity
      upsertInventory({
        variantId: 'variant-1',
        productId: 'product-1',
        productTitle: 'T-Shirt Updated',
        variantTitle: 'Red / Large',
        inventoryQuantity: 25
      });

      const inventory = getInventoryByVariantId('variant-1');
      expect(inventory.inventory_quantity).toBe(25);
      expect(inventory.product_title).toBe('T-Shirt Updated');
    });

    test('handles zero inventory', () => {
      upsertInventory({
        variantId: 'variant-1',
        productId: 'product-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        inventoryQuantity: 0
      });

      const inventory = getInventoryByVariantId('variant-1');
      expect(inventory.inventory_quantity).toBe(0);
    });

    test('handles negative inventory', () => {
      upsertInventory({
        variantId: 'variant-1',
        productId: 'product-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        inventoryQuantity: -5
      });

      const inventory = getInventoryByVariantId('variant-1');
      expect(inventory.inventory_quantity).toBe(-5);
    });
  });

  describe('Bulk upsert', () => {
    test('inserts multiple inventory records', () => {
      const items = [
        { variantId: 'v1', productId: 'p1', productTitle: 'Shirt', variantTitle: 'Red', inventoryQuantity: 10 },
        { variantId: 'v2', productId: 'p1', productTitle: 'Shirt', variantTitle: 'Blue', inventoryQuantity: 20 },
        { variantId: 'v3', productId: 'p2', productTitle: 'Pants', variantTitle: 'Black', inventoryQuantity: 0 }
      ];

      bulkUpsertInventory(items);

      const all = getAllInventory();
      expect(all).toHaveLength(3);
    });

    test('updates existing records in bulk', () => {
      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'Shirt', variantTitle: 'Red', inventoryQuantity: 10 }
      ]);

      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'Shirt', variantTitle: 'Red', inventoryQuantity: 5 }
      ]);

      const inventory = getInventoryByVariantId('v1');
      expect(inventory.inventory_quantity).toBe(5);
    });
  });

  describe('Get all inventory', () => {
    beforeEach(() => {
      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'Apple T-Shirt', variantTitle: 'Red', sku: 'APP-RED', inventoryQuantity: 50 },
        { variantId: 'v2', productId: 'p1', productTitle: 'Apple T-Shirt', variantTitle: 'Blue', sku: 'APP-BLUE', inventoryQuantity: 0 },
        { variantId: 'v3', productId: 'p2', productTitle: 'Banana Pants', variantTitle: 'Yellow', sku: 'BAN-YEL', inventoryQuantity: 25 },
        { variantId: 'v4', productId: 'p3', productTitle: 'Cherry Hat', variantTitle: '', sku: 'CHE-HAT', inventoryQuantity: 0 }
      ]);
    });

    test('returns all inventory sorted by out-of-stock first', () => {
      const all = getAllInventory();
      expect(all).toHaveLength(4);
      
      // Out of stock items should be first
      expect(all[0].inventory_quantity).toBeLessThanOrEqual(0);
      expect(all[1].inventory_quantity).toBeLessThanOrEqual(0);
    });

    test('filters to out-of-stock only', () => {
      const outOfStock = getAllInventory({ outOfStockOnly: true });
      expect(outOfStock).toHaveLength(2);
      outOfStock.forEach(item => {
        expect(item.inventory_quantity).toBeLessThanOrEqual(0);
      });
    });

    test('searches by product title', () => {
      const results = getAllInventory({ search: 'Apple' });
      expect(results).toHaveLength(2);
      results.forEach(item => {
        expect(item.product_title).toContain('Apple');
      });
    });

    test('searches by variant title', () => {
      const results = getAllInventory({ search: 'Yellow' });
      expect(results).toHaveLength(1);
      expect(results[0].variant_title).toBe('Yellow');
    });

    test('searches by SKU', () => {
      const results = getAllInventory({ search: 'BAN' });
      expect(results).toHaveLength(1);
      expect(results[0].sku).toBe('BAN-YEL');
    });

    test('search is case-insensitive', () => {
      const results = getAllInventory({ search: 'apple' });
      expect(results).toHaveLength(2);
    });

    test('combines out-of-stock filter with search', () => {
      const results = getAllInventory({ outOfStockOnly: true, search: 'Apple' });
      expect(results).toHaveLength(1);
      expect(results[0].variant_title).toBe('Blue');
      expect(results[0].inventory_quantity).toBe(0);
    });
  });

  describe('Inventory stats', () => {
    test('returns correct stats for mixed inventory', () => {
      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'A', variantTitle: '', inventoryQuantity: 50 },
        { variantId: 'v2', productId: 'p1', productTitle: 'B', variantTitle: '', inventoryQuantity: 0 },
        { variantId: 'v3', productId: 'p2', productTitle: 'C', variantTitle: '', inventoryQuantity: 25 },
        { variantId: 'v4', productId: 'p3', productTitle: 'D', variantTitle: '', inventoryQuantity: 0 }
      ]);

      const stats = getInventoryStats();
      expect(stats.total_variants).toBe(4);
      expect(stats.in_stock_count).toBe(2);
      expect(stats.out_of_stock_count).toBe(2);
      expect(stats.total_inventory).toBe(75);
    });

    test('returns correct stats for empty inventory', () => {
      const stats = getInventoryStats();
      // When empty, COUNT returns 0 but SUM returns null
      expect(stats.total_variants).toBe(0);
      expect(stats.in_stock_count).toBeNull(); // SUM of no rows is null
      expect(stats.out_of_stock_count).toBeNull();
    });

    test('returns correct stats for all in-stock', () => {
      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'A', variantTitle: '', inventoryQuantity: 10 },
        { variantId: 'v2', productId: 'p1', productTitle: 'B', variantTitle: '', inventoryQuantity: 20 }
      ]);

      const stats = getInventoryStats();
      expect(stats.in_stock_count).toBe(2);
      expect(stats.out_of_stock_count).toBe(0);
    });

    test('returns correct stats for all out-of-stock', () => {
      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'A', variantTitle: '', inventoryQuantity: 0 },
        { variantId: 'v2', productId: 'p1', productTitle: 'B', variantTitle: '', inventoryQuantity: 0 }
      ]);

      const stats = getInventoryStats();
      expect(stats.in_stock_count).toBe(0);
      expect(stats.out_of_stock_count).toBe(2);
    });
  });

  describe('Clear inventory', () => {
    test('removes all inventory records', () => {
      bulkUpsertInventory([
        { variantId: 'v1', productId: 'p1', productTitle: 'A', variantTitle: '', inventoryQuantity: 10 },
        { variantId: 'v2', productId: 'p1', productTitle: 'B', variantTitle: '', inventoryQuantity: 20 }
      ]);

      expect(getAllInventory()).toHaveLength(2);

      clearAllInventory();

      expect(getAllInventory()).toHaveLength(0);
    });
  });
});
