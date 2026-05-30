/**
 * Jest mock for src/main/shopify-api.js
 *
 * Provides a controllable ShopifyClient mock so we can test
 * the sync orchestration (and future API paths) without network calls.
 */

class MockShopifyClient {
  constructor(storeUrl, accessToken) {
    this.storeUrl = storeUrl;
    this.accessToken = accessToken;
  }

  // These will be replaced per-test with jest.fn().mockResolvedValue(...)
  async fetchAndAggregate() {
    return {
      aggregated: [],
      ordersForStorage: [],
      stats: { orderCount: 0, variantCount: 0 },
      source: 'mock-2025-04'
    };
  }

  async fetchFulfilledOrdersForReconciliation(_sinceDate) {
    return {
      fulfilledOrdersForStorage: [],
      stats: { fulfilledOrderCount: 0 }
    };
  }

  async fetchInventory() {
    return {
      inventoryData: [],
      stats: { variantCount: 0 }
    };
  }
}

// Re-export the class under the same name the real module uses
const ShopifyClient = MockShopifyClient;

// Also export the pure transform functions by requiring the real implementation
// (this keeps our existing unit tests for transforms working even when this mock is active)
let realTransforms;
try {
  realTransforms = require('../../src/main/shopify-api');
} catch {
  realTransforms = {};
}

module.exports = {
  ShopifyClient,
  // Pass through the pure functions so existing transform tests keep working
  ...realTransforms
};