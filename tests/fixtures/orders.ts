// Sample order data for tests
module.exports = {
  // Basic test orders
  orders: [
    {
      orderId: 'gid://shopify/Order/1001',
      orderName: '#1001',
      orderDate: '2025-01-10T10:00:00Z',
      totalItems: 5,
      fulfilledItems: 0,
      remainingItems: 5,
      status: 'pending'
    },
    {
      orderId: 'gid://shopify/Order/1002',
      orderName: '#1002',
      orderDate: '2025-01-11T10:00:00Z',
      totalItems: 8,
      fulfilledItems: 3,
      remainingItems: 5,
      status: 'in_progress'
    },
    {
      orderId: 'gid://shopify/Order/1003',
      orderName: '#1003',
      orderDate: '2025-01-12T10:00:00Z',
      totalItems: 3,
      fulfilledItems: 3,
      remainingItems: 0,
      status: 'fulfilled'
    }
  ],

  // Line items for orders
  lineItems: [
    // Order 1001 line items
    {
      lineItemId: 'gid://shopify/LineItem/101',
      orderId: 'gid://shopify/Order/1001',
      variantId: 'gid://shopify/ProductVariant/V001',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      sku: 'TSH-RED-M',
      quantity: 3,
      fulfilledQuantity: 0,
      imageUrl: null
    },
    {
      lineItemId: 'gid://shopify/LineItem/102',
      orderId: 'gid://shopify/Order/1001',
      variantId: 'gid://shopify/ProductVariant/V002',
      productTitle: 'T-Shirt',
      variantTitle: 'Blue / Large',
      sku: 'TSH-BLU-L',
      quantity: 2,
      fulfilledQuantity: 0,
      imageUrl: null
    },
    // Order 1002 line items
    {
      lineItemId: 'gid://shopify/LineItem/201',
      orderId: 'gid://shopify/Order/1002',
      variantId: 'gid://shopify/ProductVariant/V001',
      productTitle: 'T-Shirt',
      variantTitle: 'Red / Medium',
      sku: 'TSH-RED-M',
      quantity: 5,
      fulfilledQuantity: 3,
      imageUrl: null
    },
    {
      lineItemId: 'gid://shopify/LineItem/202',
      orderId: 'gid://shopify/Order/1002',
      variantId: 'gid://shopify/ProductVariant/V003',
      productTitle: 'Hoodie',
      variantTitle: 'Black / Small',
      sku: 'HOD-BLK-S',
      quantity: 3,
      fulfilledQuantity: 0,
      imageUrl: null
    },
    // Order 1003 line items (fulfilled)
    {
      lineItemId: 'gid://shopify/LineItem/301',
      orderId: 'gid://shopify/Order/1003',
      variantId: 'gid://shopify/ProductVariant/V002',
      productTitle: 'T-Shirt',
      variantTitle: 'Blue / Large',
      sku: 'TSH-BLU-L',
      quantity: 3,
      fulfilledQuantity: 3,
      imageUrl: null
    }
  ],

  // Tasks (aggregated by variant)
  tasks: [
    {
      variantId: 'gid://shopify/ProductVariant/V001',
      variantTitle: 'Red / Medium',
      productTitle: 'T-Shirt',
      sku: 'TSH-RED-M',
      totalQuantity: 8, // 3 from order 1001 + 5 from order 1002
      madeQuantity: 3,
      remainingQuantity: 5,
      status: 'in_progress',
      imageUrl: null
    },
    {
      variantId: 'gid://shopify/ProductVariant/V002',
      variantTitle: 'Blue / Large',
      productTitle: 'T-Shirt',
      sku: 'TSH-BLU-L',
      totalQuantity: 5, // 2 from order 1001 + 3 from order 1003
      madeQuantity: 3,
      remainingQuantity: 2,
      status: 'in_progress',
      imageUrl: null
    },
    {
      variantId: 'gid://shopify/ProductVariant/V003',
      variantTitle: 'Black / Small',
      productTitle: 'Hoodie',
      sku: 'HOD-BLK-S',
      totalQuantity: 3,
      madeQuantity: 0,
      remainingQuantity: 3,
      status: 'pending',
      imageUrl: null
    }
  ]
};
