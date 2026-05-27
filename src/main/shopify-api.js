const fetch = require('node-fetch');

/**
 * Shopify Admin GraphQL API Version
 *
 * Updated from 2024-01 → 2025-04 as part of the 2025 modernization effort.
 *
 * IMPORTANT CONTEXT (2026):
 * - Between 2024-01 and 2025-04 Shopify made major changes to fulfillment modeling.
 * - Legacy `fulfillableQuantity` on OrderLineItem and the simple `fulfillment_status` filter
 *   on the `orders` query are now considered outdated for accurate "what still needs to be made" data.
 * - Recommended source of truth: `FulfillmentOrder` + `FulfillmentOrderLineItem.remainingQuantity`
 *   (this properly accounts for holds, scheduled fulfillments, location rules, etc.).
 * - `inventoryQuantity` on ProductVariant is legacy; prefer `InventoryLevel.quantities`.
 *
 * This file now contains BOTH the legacy queries (kept for reference / fallback) AND the
 * modern FulfillmentOrder-based ingestion path.
 *
 * The transformation layer (aggregateByVariant, extractOrdersForStorage, etc.) is being
 * updated to accept data from the modern sources while emitting the EXACT same object
 * shapes expected by the rest of the system (ipc-handlers → database upserts → allocation engine).
 *
 * See plan: sessions/.../019e667e-944e-7bd1-95cd-aba820e00943/plan.md
 */
const SHOPIFY_API_VERSION = '2025-04';

// GraphQL query for fetching unfulfilled orders
const UNFULFILLED_ORDERS_QUERY = `
  query GetUnfulfilledOrders($cursor: String) {
    orders(
      first: 250,
      after: $cursor,
      query: "fulfillment_status:unfulfilled OR fulfillment_status:partial"
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                fulfillableQuantity
                variant {
                  id
                  title
                  sku
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    featuredImage {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// GraphQL query for fetching all products with inventory levels (legacy simple path)
const PRODUCTS_INVENTORY_QUERY = `
  query GetProductsInventory($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          featuredImage {
            url
            altText
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                inventoryQuantity
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Modern query (2025-04 recommended path)
 * Fetches open/scheduled FulfillmentOrders and their remaining quantities.
 * This is the preferred source of truth for "what still needs to be produced".
 */
const OPEN_FULFILLMENT_ORDERS_QUERY = `
  query GetOpenFulfillmentWork($cursor: String) {
    fulfillmentOrders(
      first: 100,
      after: $cursor,
      query: "status:OPEN OR status:SCHEDULED",
      includeClosed: false
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          status
          orderName
          order {
            id
            createdAt
            name
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                remainingQuantity
                totalQuantity
                sku
                productTitle
                variantTitle
                lineItem {
                  id
                }
                variant {
                  id
                  title
                  sku
                  image {
                    url
                    altText
                  }
                  product {
                    id
                    title
                    featuredImage {
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

class ShopifyClient {
  constructor(storeUrl, accessToken) {
    if (!storeUrl || !accessToken) {
      throw new Error('Shopify store URL and access token are required');
    }
    
    this.endpoint = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken
    };
  }

  /**
   * Execute a GraphQL query
   */
  async query(graphqlQuery, variables = {}) {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ 
          query: graphqlQuery, 
          variables 
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      
      // Check for GraphQL errors
      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }
      
      return data.data;
    } catch (error) {
      console.error('Shopify API query error:', error);
      throw error;
    }
  }

  /**
   * Fetch all unfulfilled orders with pagination
   */
  async fetchAllUnfulfilledOrders() {
    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;

    console.log('Fetching unfulfilled orders from Shopify...');

    while (hasNextPage) {
      pageCount++;
      console.log(`Fetching page ${pageCount}...`);
      
      const data = await this.query(UNFULFILLED_ORDERS_QUERY, { cursor });
      const { orders } = data;
      
      if (!orders || !orders.edges) {
        console.log('No orders found');
        break;
      }
      
      // Extract order nodes from edges
      const orderNodes = orders.edges.map(edge => edge.node);
      allOrders = allOrders.concat(orderNodes);
      
      // Check pagination
      hasNextPage = orders.pageInfo.hasNextPage;
      cursor = orders.pageInfo.endCursor;
      
      console.log(`Fetched ${orderNodes.length} orders (total so far: ${allOrders.length})`);
      
      // Rate limiting: conservative delay between requests
      if (hasNextPage) {
        await this.sleep(500);
      }
    }

    console.log(`Completed fetching ${allOrders.length} total orders in ${pageCount} page(s)`);
    return allOrders;
  }

  /**
   * Aggregate line items by variant ID and sum fulfillable quantities
   */
  aggregateByVariant(orders) {
    const variantMap = new Map();

    console.log('Aggregating line items by variant...');

    for (const order of orders) {
      if (!order.lineItems || !order.lineItems.edges) {
        continue;
      }

      for (const lineItemEdge of order.lineItems.edges) {
        const lineItem = lineItemEdge.node;
        
        // Skip if no variant or no fulfillable quantity
        if (!lineItem.variant || lineItem.fulfillableQuantity <= 0) {
          continue;
        }

        const variantId = lineItem.variant.id;
        
        // Get the best available image (variant image or product featured image)
        const variantImage = lineItem.variant.image?.url || 
                            lineItem.variant.product?.featuredImage?.url || 
                            null;
        
        if (variantMap.has(variantId)) {
          // Add to existing variant
          const existing = variantMap.get(variantId);
          existing.totalQuantity += lineItem.fulfillableQuantity;
        } else {
          // Build a display-friendly variant title
          const variantTitle = lineItem.variant.title;
          const displayVariantTitle = (variantTitle && variantTitle !== 'Default Title') 
            ? variantTitle 
            : '';
          
          // Create new entry
          variantMap.set(variantId, {
            variantId: variantId,
            variantTitle: displayVariantTitle,
            productTitle: lineItem.variant.product?.title || lineItem.title || 'Unknown product',
            sku: lineItem.variant.sku || '',
            imageUrl: variantImage,
            totalQuantity: lineItem.fulfillableQuantity
          });
        }
      }
    }

    const aggregated = Array.from(variantMap.values());
    console.log(`Aggregated ${aggregated.length} unique variants`);
    
    return aggregated;
  }

  /**
   * Extract order data for storage (including line items)
   */
  extractOrdersForStorage(orders) {
    const ordersData = [];

    console.log('Extracting order data for storage...');

    for (const order of orders) {
      if (!order.lineItems || !order.lineItems.edges) {
        continue;
      }

      const lineItems = [];
      let totalItems = 0;

      for (const lineItemEdge of order.lineItems.edges) {
        const lineItem = lineItemEdge.node;
        
        // Skip if no variant or no fulfillable quantity
        if (!lineItem.variant || lineItem.fulfillableQuantity <= 0) {
          continue;
        }

        // Get the best available image
        const variantImage = lineItem.variant.image?.url || 
                            lineItem.variant.product?.featuredImage?.url || 
                            null;

        // Build a display-friendly variant title
        const variantTitle = lineItem.variant.title;
        const displayVariantTitle = (variantTitle && variantTitle !== 'Default Title') 
          ? variantTitle 
          : '';

        lineItems.push({
          orderId: order.id,
          lineItemId: lineItem.id,
          variantId: lineItem.variant.id,
          variantTitle: displayVariantTitle,
          productTitle: lineItem.variant.product?.title || lineItem.title || 'Unknown product',
          sku: lineItem.variant.sku || '',
          imageUrl: variantImage,
          quantity: lineItem.fulfillableQuantity
        });

        totalItems += lineItem.fulfillableQuantity;
      }

      // Only include orders that have line items with fulfillable quantities
      if (lineItems.length > 0) {
        ordersData.push({
          orderId: order.id,
          orderName: order.name,
          orderDate: order.createdAt,
          totalItems: totalItems,
          lineItems: lineItems
        });
      }
    }

    console.log(`Extracted ${ordersData.length} orders for storage`);
    return ordersData;
  }

  /**
   * Fetch unfulfilled work and aggregate by variant.
   *
   * As of the 2025-04 modernization, this now delegates to the FulfillmentOrder-based
   * implementation (fetchAndAggregateModern) which uses `remainingQuantity` as the
   * authoritative "still needs to be made" signal.
   *
   * The legacy order-based methods are kept for reference, comparison, and potential fallback.
   */
  async fetchAndAggregate() {
    // Modern 2025-04 path (recommended)
    const modernResult = await this.fetchAndAggregateModern();

    // For backward compatibility with any code that still expects `orders` + `orderCount`,
    // we synthesize a minimal legacy-style wrapper. The critical `aggregated` and
    // `ordersForStorage` come from the modern logic.
    return {
      orders: modernResult.fulfillmentOrders || [], // note: these are FOs, not raw orders
      aggregated: modernResult.aggregated,
      ordersForStorage: modernResult.ordersForStorage,
      stats: {
        orderCount: modernResult.stats?.fulfillmentOrderCount || 0,
        variantCount: modernResult.stats?.variantCount || 0
      },
      source: modernResult.source
    };
  }

  /**
   * Fetch all products with inventory levels
   */
  async fetchAllProductsWithInventory() {
    let allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;

    console.log('Fetching products with inventory from Shopify...');

    while (hasNextPage) {
      pageCount++;
      console.log(`Fetching products page ${pageCount}...`);
      
      const data = await this.query(PRODUCTS_INVENTORY_QUERY, { cursor });
      const { products } = data;
      
      if (!products || !products.edges) {
        console.log('No products found');
        break;
      }
      
      // Extract product nodes from edges
      const productNodes = products.edges.map(edge => edge.node);
      allProducts = allProducts.concat(productNodes);
      
      // Check pagination
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
      
      console.log(`Fetched ${productNodes.length} products (total so far: ${allProducts.length})`);
      
      // Rate limiting: conservative delay between requests
      if (hasNextPage) {
        await this.sleep(500);
      }
    }

    console.log(`Completed fetching ${allProducts.length} total products in ${pageCount} page(s)`);
    return allProducts;
  }

  /**
   * Extract inventory data from products for storage
   */
  extractInventoryForStorage(products) {
    const inventoryData = [];

    console.log('Extracting inventory data for storage...');

    for (const product of products) {
      if (!product.variants || !product.variants.edges) {
        continue;
      }

      const productImage = product.featuredImage?.url || null;

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        
        // Get the best available image (variant image or product featured image)
        const variantImage = variant.image?.url || productImage;
        
        // Build a display-friendly variant title
        const variantTitle = variant.title;
        const displayVariantTitle = (variantTitle && variantTitle !== 'Default Title') 
          ? variantTitle 
          : '';

        inventoryData.push({
          variantId: variant.id,
          productId: product.id,
          productTitle: product.title,
          variantTitle: displayVariantTitle,
          sku: variant.sku || '',
          imageUrl: variantImage,
          inventoryQuantity: variant.inventoryQuantity || 0
        });
      }
    }

    console.log(`Extracted ${inventoryData.length} variants with inventory data`);
    return inventoryData;
  }

  /**
   * Fetch products and extract inventory data
   */
  async fetchInventory() {
    const products = await this.fetchAllProductsWithInventory();
    const inventoryData = this.extractInventoryForStorage(products);
    
    return {
      products,
      inventoryData,
      stats: {
        productCount: products.length,
        variantCount: inventoryData.length
      }
    };
  }

  /**
   * Helper method for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // MODERN (2025-04) FULFILLMENT ORDER BASED PATH
  // ============================================================

  /**
   * Fetch open/scheduled FulfillmentOrders using the modern recommended model.
   * Uses remainingQuantity from FulfillmentOrderLineItem.
   */
  async fetchOpenFulfillmentOrders() {
    let allFOs = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;

    console.log('[Modern] Fetching open FulfillmentOrders from Shopify (2025-04 path)...');

    while (hasNextPage) {
      pageCount++;
      console.log(`[Modern] Fetching FulfillmentOrders page ${pageCount}...`);

      const data = await this.query(OPEN_FULFILLMENT_ORDERS_QUERY, { cursor });
      const { fulfillmentOrders } = data;

      if (!fulfillmentOrders || !fulfillmentOrders.edges) {
        console.log('[Modern] No fulfillment orders found');
        break;
      }

      const foNodes = fulfillmentOrders.edges.map(edge => edge.node);
      allFOs = allFOs.concat(foNodes);

      hasNextPage = fulfillmentOrders.pageInfo.hasNextPage;
      cursor = fulfillmentOrders.pageInfo.endCursor;

      console.log(`[Modern] Fetched ${foNodes.length} FOs (total: ${allFOs.length})`);

      if (hasNextPage) {
        await this.sleep(500);
      }
    }

    console.log(`[Modern] Completed fetching ${allFOs.length} FulfillmentOrders in ${pageCount} page(s)`);
    return allFOs;
  }

  /**
   * Aggregate FulfillmentOrderLineItems by variant using remainingQuantity.
   * Produces the same shape as the legacy aggregateByVariant so the rest of
   * the system (tasks, allocation, etc.) continues to work unchanged.
   */
  aggregateByVariantFromFulfillmentOrders(fulfillmentOrders) {
    const variantMap = new Map();
    console.log('[Modern] Aggregating FulfillmentOrderLineItems by variant using remainingQuantity...');

    for (const fo of fulfillmentOrders) {
      if (!fo.lineItems || !fo.lineItems.edges) continue;

      for (const liEdge of fo.lineItems.edges) {
        const li = liEdge.node;
        if (!li.variant || li.remainingQuantity <= 0) continue;

        const variantId = li.variant.id;
        const variantImage = li.variant.image?.url ||
                            li.variant.product?.featuredImage?.url || null;

        const variantTitle = li.variant.title;
        const displayVariantTitle = (variantTitle && variantTitle !== 'Default Title') ? variantTitle : '';

        if (variantMap.has(variantId)) {
          variantMap.get(variantId).totalQuantity += li.remainingQuantity;
        } else {
          variantMap.set(variantId, {
            variantId: variantId,
            variantTitle: displayVariantTitle,
            productTitle: li.variant.product?.title || li.productTitle || 'Unknown product',
            sku: li.variant.sku || li.sku || '',
            imageUrl: variantImage,
            totalQuantity: li.remainingQuantity
          });
        }
      }
    }

    const aggregated = Array.from(variantMap.values());
    console.log(`[Modern] Aggregated ${aggregated.length} unique variants from FulfillmentOrders`);
    return aggregated;
  }

  /**
   * Extract per-order data from FulfillmentOrders for storage.
   * We synthesize order + line item records using the FulfillmentOrder context
   * so the existing per-order progress tracking and FIFO allocation continue to function.
   *
   * Note: One FulfillmentOrder roughly corresponds to one "shipment wave" of an order.
   * For simplicity we use the FulfillmentOrder's orderName + order.id as the grouping key.
   */
  extractOrdersForStorageFromFulfillmentOrders(fulfillmentOrders) {
    const ordersData = [];
    const orderMap = new Map(); // key by order id to group line items

    console.log('[Modern] Extracting order/line item data from FulfillmentOrders...');

    for (const fo of fulfillmentOrders) {
      if (!fo.lineItems || !fo.lineItems.edges) continue;
      if (!fo.order) continue;

      const orderKey = fo.order.id;
      if (!orderMap.has(orderKey)) {
        orderMap.set(orderKey, {
          orderId: fo.order.id,
          orderName: fo.orderName || fo.order.name,
          orderDate: fo.order.createdAt,
          totalItems: 0,
          lineItems: []
        });
      }

      const orderEntry = orderMap.get(orderKey);

      for (const liEdge of fo.lineItems.edges) {
        const li = liEdge.node;
        if (!li.variant || li.remainingQuantity <= 0) continue;

        const variantImage = li.variant.image?.url ||
                            li.variant.product?.featuredImage?.url || null;

        const variantTitle = li.variant.title;
        const displayVariantTitle = (variantTitle && variantTitle !== 'Default Title') ? variantTitle : '';

        const lineItemForStorage = {
          orderId: fo.order.id,
          lineItemId: li.lineItem?.id || li.id, // fall back to FO line item id if original not present
          variantId: li.variant.id,
          variantTitle: displayVariantTitle,
          productTitle: li.variant.product?.title || li.productTitle || 'Unknown product',
          sku: li.variant.sku || li.sku || '',
          imageUrl: variantImage,
          quantity: li.remainingQuantity   // Use remainingQuantity as the "actionable" quantity
        };

        orderEntry.lineItems.push(lineItemForStorage);
        orderEntry.totalItems += li.remainingQuantity;
      }
    }

    // Convert map to array, only include orders that have actionable line items
    for (const entry of orderMap.values()) {
      if (entry.lineItems.length > 0) {
        ordersData.push(entry);
      }
    }

    console.log(`[Modern] Extracted ${ordersData.length} orders with line items from FulfillmentOrders`);
    return ordersData;
  }

  /**
   * Modern equivalent of fetchAndAggregate using FulfillmentOrders.
   * Returns data in the same structure so the rest of the app is unaffected.
   */
  async fetchAndAggregateModern() {
    const fos = await this.fetchOpenFulfillmentOrders();
    const aggregated = this.aggregateByVariantFromFulfillmentOrders(fos);
    const ordersForStorage = this.extractOrdersForStorageFromFulfillmentOrders(fos);

    return {
      fulfillmentOrders: fos,
      aggregated,
      ordersForStorage,
      stats: {
        fulfillmentOrderCount: fos.length,
        variantCount: aggregated.length
      },
      source: 'fulfillmentOrders-2025-04'
    };
  }
}

module.exports = { ShopifyClient };
