import fetch from 'node-fetch';

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

/**
 * Query for recently closed/fulfilled FulfillmentOrders.
 * Used for two-way sync: detecting orders fulfilled directly in Shopify.
 * We use a date filter in the query string (e.g. "status:CLOSED updated_at:>2026-...").
 */
const RECENTLY_CLOSED_FULFILLMENT_ORDERS_QUERY = `
  query GetRecentlyClosedFulfillmentOrders($cursor: String, $query: String) {
    fulfillmentOrders(
      first: 100,
      after: $cursor,
      query: $query,
      includeClosed: true
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

interface ShopifyClientOptions {
  storeUrl: string;
  accessToken: string;
}

interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: GraphQLError[];
}

export class ShopifyClient {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor({ storeUrl, accessToken }: ShopifyClientOptions) {
    if (!storeUrl || !accessToken) {
      throw new Error('Shopify store URL and access token are required');
    }

    this.endpoint = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    this.headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    };
  }

  /**
   * Execute a GraphQL query
   */
  async query<T = unknown>(graphqlQuery: string, variables: Record<string, unknown> = {}): Promise<T> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          query: graphqlQuery,
          variables,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API HTTP error ${response.status}: ${errorText}`);
      }

      const jsonResponse = (await response.json()) as GraphQLResponse<T>;

      // Check for GraphQL errors
      if (jsonResponse.errors && jsonResponse.errors.length > 0) {
        throw new Error(`GraphQL errors: ${JSON.stringify(jsonResponse.errors)}`);
      }

      return jsonResponse.data as T;
    } catch (error) {
      console.error('Shopify API query error:', error);
      throw error;
    }
  }

  /**
   * Fetch all unfulfilled orders with pagination
   */
  async fetchAllUnfulfilledOrders(): Promise<RawOrderNode[]> {
    const allOrders: RawOrderNode[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    console.log('Fetching unfulfilled orders from Shopify...');

    while (hasNextPage) {
      pageCount++;
      console.log(`Fetching page ${pageCount}...`);

      // Raw GraphQL response (transitional `any` layer for untyped Shopify shapes).
      // The pure *Impl functions convert these into our strict OrderForStorage / AggregatedVariant types.
      const data: { orders?: RawGraphQLConnection<RawOrderNode> } = await this.query(UNFULFILLED_ORDERS_QUERY, { cursor });
      const orders = data?.orders;

      if (!orders || !orders.edges) {
        console.log('No orders found');
        break;
      }

      const orderNodes = orders.edges.map((edge: { node: RawOrderNode }) => edge.node);
      allOrders.push(...orderNodes);

      hasNextPage = orders.pageInfo?.hasNextPage ?? false;
      cursor = orders.pageInfo?.endCursor ?? null;

      console.log(`Fetched ${orderNodes.length} orders (total so far: ${allOrders.length})`);

      if (hasNextPage) {
        await this.sleep(500);
      }
    }

    console.log(`Completed fetching ${allOrders.length} total orders in ${pageCount} page(s)`);
    return allOrders;
  }

  /**
   * Aggregate line items by variant ID and sum fulfillable quantities.
   * Accepts raw order nodes from either legacy or modern fetch paths during migration.
   */
  aggregateByVariant(orders: RawOrderNode[] | unknown[]): AggregatedVariant[] {
    return aggregateByVariantImpl(orders);
  }

  /**
   * Extract order data for storage (including line items).
   * Accepts raw order nodes from either legacy or modern fetch paths during migration.
   */
  extractOrdersForStorage(orders: RawOrderNode[] | unknown[]): OrderForStorage[] {
    return extractOrdersForStorageImpl(orders);
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
  async fetchAndAggregate(): Promise<FetchAndAggregateResult> {
    // Modern 2025-04 path (recommended)
    const modernResult = await this.fetchAndAggregateModern();

    // For backward compatibility with any code that still expects `orders` + `orderCount`,
    // we synthesize a minimal legacy-style wrapper. The critical `aggregated` and
    // `ordersForStorage` come from the modern logic.
    return {
      aggregated: modernResult.aggregated,
      ordersForStorage: modernResult.ordersForStorage,
      stats: {
        orderCount: modernResult.stats?.orderCount || 0,
        variantCount: modernResult.stats?.variantCount || 0,
      },
      source: modernResult.source,
    };
  }

  /**
   * Fetch all products with inventory levels
   */
  async fetchAllProductsWithInventory(): Promise<RawProductNode[]> {
    const allProducts: RawProductNode[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    console.log('Fetching products with inventory from Shopify...');

    while (hasNextPage) {
      pageCount++;
      console.log(`Fetching products page ${pageCount}...`);

      // GraphQL response is intentionally loosely typed here (raw Shopify shape).
      // The pure extract*Impl functions handle the transformation into our strict types.
      const data: { products?: RawGraphQLConnection<RawProductNode> } = await this.query(PRODUCTS_INVENTORY_QUERY, { cursor });
      const products = data?.products;
      
      if (!products || !products.edges) {
        console.log('No products found');
        break;
      }
      
      // Extract product nodes from edges
      const productNodes = products.edges.map((edge: { node: RawProductNode }) => edge.node);
      allProducts.push(...productNodes);
      
      // Check pagination
      hasNextPage = products.pageInfo?.hasNextPage ?? false;
      cursor = products.pageInfo?.endCursor ?? null;
      
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
  extractInventoryForStorage(products: RawProductNode[] | unknown[]): InventoryItem[] {
    return extractInventoryForStorageImpl(products);
  }

  /**
   * Fetch products and extract inventory data
   */
  async fetchInventory(): Promise<InventoryFetchResult> {
    const products = await this.fetchAllProductsWithInventory();
    const inventoryData = this.extractInventoryForStorage(products);

    return {
      inventoryData,
      stats: {
        variantCount: inventoryData.length,
      },
    };
  }

  /**
   * Helper method for delays (rate limiting)
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // MODERN (2025-04) FULFILLMENT ORDER BASED PATH
  // ============================================================

  /**
   * Fetch open/scheduled FulfillmentOrders using the modern recommended model.
   * Uses remainingQuantity from FulfillmentOrderLineItem.
   */
  async fetchOpenFulfillmentOrders(): Promise<RawFulfillmentOrder[]> {
    const allFOs: RawFulfillmentOrder[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    console.log('[Modern] Fetching open FulfillmentOrders from Shopify (2025-04 path)...');

    while (hasNextPage) {
      pageCount++;
      console.log(`[Modern] Fetching FulfillmentOrders page ${pageCount}...`);

      const data: { fulfillmentOrders?: RawGraphQLConnection<RawFulfillmentOrder> } = await this.query(OPEN_FULFILLMENT_ORDERS_QUERY, { cursor });
      const fulfillmentOrders = data?.fulfillmentOrders;

      if (!fulfillmentOrders || !fulfillmentOrders.edges) {
        console.log('[Modern] No fulfillment orders found');
        break;
      }

      const foNodes = fulfillmentOrders.edges.map((edge: { node: RawFulfillmentOrder }) => edge.node);
      allFOs.push(...foNodes);

      hasNextPage = fulfillmentOrders.pageInfo?.hasNextPage ?? false;
      cursor = fulfillmentOrders.pageInfo?.endCursor ?? null;

      console.log(`[Modern] Fetched ${foNodes.length} FOs (total: ${allFOs.length})`);

      if (hasNextPage) {
        await this.sleep(500);
      }
    }

    console.log(`[Modern] Completed fetching ${allFOs.length} FulfillmentOrders in ${pageCount} page(s)`);
    return allFOs;
  }

  /**
   * Fetch recently closed/fulfilled FulfillmentOrders for two-way sync.
   * These represent orders that were fulfilled directly in Shopify (outside the app).
   * We use a query string with status:CLOSED + updated_at filter for efficiency.
   */
  async fetchRecentlyClosedFulfillmentOrders(sinceDate: string | null = null): Promise<RawFulfillmentOrder[]> {
    const allFOs: RawFulfillmentOrder[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    if (!sinceDate) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      sinceDate = ninetyDaysAgo.toISOString();
    }

    const queryString = `status:CLOSED updated_at:>=${sinceDate}`;

    console.log(`[TwoWaySync] Fetching recently closed FulfillmentOrders since ${sinceDate} (2025-04 path)...`);

    while (hasNextPage) {
      pageCount++;
      console.log(`[TwoWaySync] Fetching closed FOs page ${pageCount}...`);

      const data: { fulfillmentOrders?: RawGraphQLConnection<RawFulfillmentOrder> } = await this.query(RECENTLY_CLOSED_FULFILLMENT_ORDERS_QUERY, {
        cursor,
        query: queryString,
      });
      const fulfillmentOrders = data?.fulfillmentOrders;

      if (!fulfillmentOrders || !fulfillmentOrders.edges) {
        console.log('[TwoWaySync] No closed fulfillment orders found in window');
        break;
      }

      const foNodes = fulfillmentOrders.edges.map((edge: { node: RawFulfillmentOrder }) => edge.node);
      allFOs.push(...foNodes);

      hasNextPage = fulfillmentOrders.pageInfo?.hasNextPage ?? false;
      cursor = fulfillmentOrders.pageInfo?.endCursor ?? null;

      console.log(`[TwoWaySync] Fetched ${foNodes.length} closed FOs (total: ${allFOs.length})`);

      if (hasNextPage) {
        await this.sleep(500);
      }
    }

    console.log(`[TwoWaySync] Completed fetching ${allFOs.length} closed FulfillmentOrders in ${pageCount} page(s)`);
    return allFOs;
  }

  /**
   * Aggregate FulfillmentOrderLineItems by variant using remainingQuantity.
   * Produces the same shape as the legacy aggregateByVariant so the rest of
   * the system (tasks, allocation, etc.) continues to work unchanged.
   */
  aggregateByVariantFromFulfillmentOrders(fulfillmentOrders: RawFulfillmentOrder[] | unknown[]): AggregatedVariant[] {
    return aggregateByVariantFromFulfillmentOrdersImpl(fulfillmentOrders);
  }

  /**
   * Extract per-order data from FulfillmentOrders for storage.
   * We synthesize order + line item records using the FulfillmentOrder context
   * so the existing per-order progress tracking and FIFO allocation continue to function.
   *
   * Note: One FulfillmentOrder roughly corresponds to one "shipment wave" of an order.
   * For simplicity we use the FulfillmentOrder's orderName + order.id as the grouping key.
   */
  extractOrdersForStorageFromFulfillmentOrders(fulfillmentOrders: RawFulfillmentOrder[] | unknown[]): OrderForStorage[] {
    return extractOrdersForStorageFromFulfillmentOrdersImpl(fulfillmentOrders);
  }

  /**
   * Extract per-order data from closed/fulfilled FulfillmentOrders for storage.
   * These represent work that has been completed directly in Shopify.
   * We set quantity = totalQuantity and will mark as fully fulfilled on upsert.
   * This allows the existing order status + task recalculation logic to handle cleanup.
   */
  extractFulfilledOrdersForStorageFromFulfillmentOrders(fulfillmentOrders: RawFulfillmentOrder[] | unknown[]): OrderForStorage[] {
    return extractFulfilledOrdersForStorageFromFulfillmentOrdersImpl(fulfillmentOrders);
  }

  /**
   * Modern equivalent of fetchAndAggregate using FulfillmentOrders.
   * Returns data in the same structure so the rest of the app is unaffected.
   */
  async fetchAndAggregateModern(): Promise<FetchAndAggregateResult & { fulfillmentOrders: RawFulfillmentOrder[] }> {
    const fos = await this.fetchOpenFulfillmentOrders();
    const aggregated = this.aggregateByVariantFromFulfillmentOrders(fos);
    const ordersForStorage = this.extractOrdersForStorageFromFulfillmentOrders(fos);

    return {
      fulfillmentOrders: fos,
      aggregated,
      ordersForStorage,
      stats: {
        orderCount: fos.length,
        variantCount: aggregated.length,
      },
      source: 'fulfillmentOrders-2025-04',
    };
  }

  /**
   * Fetch fulfilled orders from Shopify for two-way reconciliation.
   * Returns data in a shape suitable for forcing local orders to 'fulfilled' status.
   */
  async fetchFulfilledOrdersForReconciliation(sinceDate: string | null = null): Promise<FulfilledReconciliationResult> {
    const fos = await this.fetchRecentlyClosedFulfillmentOrders(sinceDate);
    const fulfilledOrdersForStorage = this.extractFulfilledOrdersForStorageFromFulfillmentOrders(fos);

    return {
      fulfilledOrdersForStorage,
      stats: {
        fulfilledOrderCount: fulfilledOrdersForStorage.length,
      },
    };
  }
}

// =============================================================================
// Pure Transformation Functions (exported for testability)
// =============================================================================

export interface AggregatedVariant {
  variantId: string;
  variantTitle: string;
  productTitle: string;
  sku: string;
  imageUrl: string | null;
  totalQuantity: number;
}

export interface InventoryFetchResult {
  inventoryData: InventoryItem[];
  stats: {
    variantCount: number;
  };
}

export interface FetchAndAggregateResult {
  aggregated: AggregatedVariant[];
  ordersForStorage: OrderForStorage[];
  stats: {
    orderCount: number;
    variantCount: number;
  };
  source?: string;
}

export interface FulfilledReconciliationResult {
  fulfilledOrdersForStorage: OrderForStorage[];
  stats: {
    fulfilledOrderCount: number;
  };
}

/**
 * Standalone pure function for aggregating FulfillmentOrder line items by variant.
 * Exported for easy unit testing.
 */
export function aggregateByVariantFromFulfillmentOrdersImpl(
  fulfillmentOrders: RawFulfillmentOrder[] | unknown[]
): AggregatedVariant[] {
  if (!Array.isArray(fulfillmentOrders)) return [];

  const variantMap = new Map<string, AggregatedVariant>();

  for (const fo of fulfillmentOrders as RawFulfillmentOrder[]) {
    const edges = fo?.lineItems?.edges ?? [];

    for (const liEdge of edges) {
      const li = liEdge.node;
      if (!li?.variant || (li.remainingQuantity ?? 0) <= 0) continue;

      const variantId = li.variant.id;
      const variantImage =
        li.variant.image?.url || li.variant.product?.featuredImage?.url || null;

      const variantTitle = li.variant.title;
      const displayVariantTitle =
        variantTitle && variantTitle !== 'Default Title' ? variantTitle : '';

      const existing = variantMap.get(variantId);
      if (existing) {
        existing.totalQuantity += li.remainingQuantity ?? 0;
      } else {
        variantMap.set(variantId, {
          variantId,
          variantTitle: displayVariantTitle,
          productTitle: li.variant.product?.title || li.productTitle || 'Unknown product',
          sku: li.variant.sku || li.sku || '',
          imageUrl: variantImage,
          totalQuantity: li.remainingQuantity ?? 0,
        });
      }
    }
  }

  return Array.from(variantMap.values());
}

export interface LineItemForStorage {
  orderId: string;
  lineItemId: string;
  variantId: string;
  variantTitle: string;
  productTitle: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
}

export interface OrderForStorage {
  orderId: string;
  orderName: string;
  orderDate: string;
  totalItems: number;
  lineItems: LineItemForStorage[];
}

export function extractOrdersForStorageFromFulfillmentOrdersImpl(
  fulfillmentOrders: RawFulfillmentOrder[] | unknown[]
): OrderForStorage[] {
  if (!Array.isArray(fulfillmentOrders)) return [];

  const ordersData: OrderForStorage[] = [];
  const orderMap = new Map<string, OrderForStorage>();

  for (const fo of fulfillmentOrders as RawFulfillmentOrder[]) {
    if (!fo.lineItems || !fo.lineItems.edges) continue;
    if (!fo.order) continue;

    const orderKey = fo.order.id;
    if (!orderMap.has(orderKey)) {
      orderMap.set(orderKey, {
        orderId: fo.order.id,
        orderName: fo.orderName || fo.order.name || '',
        orderDate: fo.order.createdAt || '',
        totalItems: 0,
        lineItems: [],
      });
    }

    const orderEntry = orderMap.get(orderKey)!;

    for (const liEdge of fo.lineItems.edges) {
      const li = liEdge.node;
      if (!li.variant || (li.remainingQuantity ?? 0) <= 0) continue;

      const variantImage =
        li.variant.image?.url || li.variant.product?.featuredImage?.url || null;

      const variantTitle = li.variant.title;
      const displayVariantTitle =
        variantTitle && variantTitle !== 'Default Title' ? variantTitle : '';

      const lineItemForStorage: LineItemForStorage = {
        orderId: fo.order.id,
        lineItemId: li.lineItem?.id || li.id || '',
        variantId: li.variant.id,
        variantTitle: displayVariantTitle,
        productTitle: li.variant.product?.title || li.productTitle || 'Unknown product',
        sku: li.variant.sku || li.sku || '',
        imageUrl: variantImage,
        quantity: li.remainingQuantity ?? 0,
      };

      orderEntry.lineItems.push(lineItemForStorage);
      orderEntry.totalItems += li.remainingQuantity ?? 0;
    }
  }

  for (const entry of orderMap.values()) {
    if (entry.lineItems.length > 0) {
      ordersData.push(entry);
    }
  }

  return ordersData;
}

export interface InventoryItem {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  imageUrl: string | null;
  inventoryQuantity: number;
}

// Transitional raw shapes for Shopify GraphQL responses (used only inside the *Impl functions
// while we finish introducing full response types for the queries).
interface RawProductForInventory {
  id: string;
  title: string;
  featuredImage?: { url?: string } | null;
  variants?: {
    edges?: Array<{
      node: {
        id: string;
        title?: string;
        sku?: string;
        image?: { url?: string } | null;
        inventoryQuantity?: number;
      };
    }>;
  };
}

export function extractInventoryForStorageImpl(products: RawProductForInventory[] | unknown[]): InventoryItem[] {
  if (!Array.isArray(products)) return [];

  const inventoryData: InventoryItem[] = [];

  for (const product of products as RawProductForInventory[]) {
    if (!product.variants || !product.variants.edges) {
      continue;
    }

    const productImage = product.featuredImage?.url || null;

    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      
      const variantImage = variant.image?.url || productImage;
      
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

  return inventoryData;
}

// Raw shape for the legacy orders-based aggregation path
interface RawOrderForAggregation {
  lineItems?: {
    edges?: Array<{
      node: {
        id?: string;
        title?: string;
        fulfillableQuantity?: number;
        variant?: {
          id: string;
          title?: string;
          sku?: string;
          image?: { url?: string } | null;
          product?: {
            title?: string;
            featuredImage?: { url?: string } | null;
          };
        };
      };
    }>;
  };
}

export function aggregateByVariantImpl(orders: RawOrderForAggregation[] | unknown[]): AggregatedVariant[] {
  if (!Array.isArray(orders)) return [];

  const variantMap = new Map<string, AggregatedVariant>();

  for (const order of orders as RawOrderForAggregation[]) {
    if (!order.lineItems || !order.lineItems.edges) {
      continue;
    }

    for (const lineItemEdge of order.lineItems.edges) {
      const lineItem = lineItemEdge.node;

      if (!lineItem.variant || (lineItem.fulfillableQuantity ?? 0) <= 0) {
        continue;
      }

      const variantId = lineItem.variant.id;
      const variantImage =
        lineItem.variant.image?.url ||
        lineItem.variant.product?.featuredImage?.url ||
        null;

      const variantTitle = lineItem.variant.title;
      const displayVariantTitle =
        variantTitle && variantTitle !== 'Default Title' ? variantTitle : '';

      const qty = lineItem.fulfillableQuantity ?? 0;

      if (variantMap.has(variantId)) {
        const existing = variantMap.get(variantId)!;
        existing.totalQuantity += qty;
      } else {
        variantMap.set(variantId, {
          variantId,
          variantTitle: displayVariantTitle,
          productTitle: lineItem.variant.product?.title || lineItem.title || 'Unknown product',
          sku: lineItem.variant.sku || '',
          imageUrl: variantImage,
          totalQuantity: qty,
        });
      }
    }
  }

  return Array.from(variantMap.values());
}

export function extractOrdersForStorageImpl(orders: RawOrderNode[] | unknown[]): OrderForStorage[] {
  if (!Array.isArray(orders)) return [];

  const ordersData: OrderForStorage[] = [];

  for (const order of orders as RawOrderNode[]) {
    if (!order.lineItems || !order.lineItems.edges) {
      continue;
    }

    const lineItems: LineItemForStorage[] = [];
    let totalItems = 0;

    for (const lineItemEdge of order.lineItems.edges) {
      const lineItem = lineItemEdge.node;

      if (!lineItem.variant || (lineItem.fulfillableQuantity ?? 0) <= 0) {
        continue;
      }

      const variantTitle = lineItem.variant.title;
      const displayVariantTitle =
        variantTitle && variantTitle !== 'Default Title' ? variantTitle : '';

      const quantity = lineItem.fulfillableQuantity ?? 0;

      lineItems.push({
        orderId: order.id,
        lineItemId: lineItem.id,
        variantId: lineItem.variant.id,
        variantTitle: displayVariantTitle,
        productTitle: lineItem.title,
        sku: lineItem.variant.sku || '',
        imageUrl: null,
        quantity,
      });

      totalItems += quantity;
    }

    if (lineItems.length > 0) {
      ordersData.push({
        orderId: order.id,
        orderName: order.name,
        orderDate: order.createdAt,
        totalItems,
        lineItems,
      });
    }
  }

  return ordersData;
}



// Raw shape for FulfillmentOrder responses from the modern 2025-04 queries.
// This is intentionally a partial shape focused on what the extraction logic needs.
interface RawFulfillmentOrder {
  status?: string;
  orderName?: string;
  order?: {
    id: string;
    name?: string;
    createdAt?: string;
  };
  lineItems?: {
    edges?: Array<{
      node: {
        id?: string;
        totalQuantity?: number;
        remainingQuantity?: number;
        lineItem?: { id?: string };
        variant?: {
          id: string;
          title?: string;
          sku?: string;
          image?: { url?: string } | null;
          product?: {
            title?: string;
            featuredImage?: { url?: string } | null;
          };
        };
        productTitle?: string;
        sku?: string;
      };
    }>;
  };
}

interface RawOrderNode {
  id: string;
  name: string;
  createdAt: string;
  lineItems?: {
    edges?: Array<{
      node: {
        id: string;
        title: string;
        quantity: number;
        fulfillableQuantity?: number;
        variant?: { id: string; title?: string; sku?: string };
      };
    }>;
  };
}

interface RawProductNode {
  id: string;
  title: string;
  featuredImage?: { url?: string } | null;
  variants?: {
    edges?: Array<{
      node: {
        id: string;
        title?: string;
        sku?: string;
        image?: { url?: string } | null;
        inventoryQuantity?: number;
      };
    }>;
  };
}

// Generic shape for Shopify GraphQL connection responses (used for typing raw query results)
interface RawGraphQLConnection<T> {
  edges?: Array<{ node: T }>;
  pageInfo?: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
}

/**
 * Standalone pure function for extracting fulfilled orders.
 * Exported for easy unit testing.
 */
export function extractFulfilledOrdersForStorageFromFulfillmentOrdersImpl(
  fulfillmentOrders: RawFulfillmentOrder[] | unknown[]
): OrderForStorage[] {
  if (!Array.isArray(fulfillmentOrders)) return [];

  const ordersData: OrderForStorage[] = [];
  const orderMap = new Map<string, OrderForStorage>();

  for (const fo of fulfillmentOrders as RawFulfillmentOrder[]) {
    if (!fo.lineItems || !fo.lineItems.edges) continue;
    if (!fo.order) continue;

    if (fo.status !== 'CLOSED') continue;

    const orderKey = fo.order.id;
    if (!orderMap.has(orderKey)) {
      orderMap.set(orderKey, {
        orderId: fo.order.id,
        orderName: fo.order.name || '',
        orderDate: fo.order.createdAt || '',
        totalItems: 0,
        lineItems: [],
      });
    }

    const orderEntry = orderMap.get(orderKey)!;

    for (const liEdge of fo.lineItems.edges) {
      const li = liEdge.node;

      if (!li.variant || (li.totalQuantity ?? 0) <= 0) continue;

      const variantImage =
        li.variant.image?.url || li.variant.product?.featuredImage?.url || null;

      const variantTitle = li.variant.title;
      const displayVariantTitle =
        variantTitle && variantTitle !== 'Default Title' ? variantTitle : '';

      const lineItemForStorage: LineItemForStorage & { fulfilledQuantity: number } = {
        orderId: fo.order.id,
        lineItemId: li.lineItem?.id || li.id || '',
        variantId: li.variant.id,
        variantTitle: displayVariantTitle,
        productTitle: li.variant.product?.title || li.productTitle || 'Unknown product',
        sku: li.variant.sku || li.sku || '',
        imageUrl: variantImage,
        quantity: li.totalQuantity ?? 0,
        fulfilledQuantity: li.totalQuantity ?? 0,
      };

      orderEntry.lineItems.push(lineItemForStorage);
      orderEntry.totalItems += li.totalQuantity ?? 0;
    }
  }

  for (const entry of orderMap.values()) {
    if (entry.lineItems.length > 0) {
      ordersData.push(entry);
    }
  }

  return ordersData;
}

// =============================================================================
// Exports
// =============================================================================

// All transformation functions are already exported individually above with `export function`.
// The class is exported as `export class ShopifyClient`.

// Re-export for convenience (matches previous module.exports shape for any remaining JS consumers during migration)
// All *Impl functions are already exported via their individual `export function` declarations above.
// This block is kept only for any legacy JS consumers during the migration.
// aggregateByVariantImpl is already exported via its `export function` declaration.
export {
  aggregateByVariantImpl as aggregateByVariant,
  aggregateByVariantFromFulfillmentOrdersImpl as aggregateByVariantFromFulfillmentOrders,
  extractFulfilledOrdersForStorageFromFulfillmentOrdersImpl as extractFulfilledOrdersForStorageFromFulfillmentOrders,
  extractInventoryForStorageImpl as extractInventoryForStorage,
  extractOrdersForStorageFromFulfillmentOrdersImpl as extractOrdersForStorageFromFulfillmentOrders,
  extractOrdersForStorageImpl as extractOrdersForStorage,
};
