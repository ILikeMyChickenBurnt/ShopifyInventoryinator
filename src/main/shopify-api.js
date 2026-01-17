const fetch = require('node-fetch');

const SHOPIFY_API_VERSION = '2024-01';

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
   * Fetch unfulfilled orders and aggregate by variant
   * This is the main method to call for syncing
   */
  async fetchAndAggregate() {
    const orders = await this.fetchAllUnfulfilledOrders();
    const aggregated = this.aggregateByVariant(orders);
    const ordersForStorage = this.extractOrdersForStorage(orders);
    
    return {
      orders,
      aggregated,
      ordersForStorage,
      stats: {
        orderCount: orders.length,
        variantCount: aggregated.length
      }
    };
  }

  /**
   * Helper method for delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ShopifyClient };
