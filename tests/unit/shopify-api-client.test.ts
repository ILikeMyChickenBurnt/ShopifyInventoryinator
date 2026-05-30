import fetch from 'node-fetch';

import { ShopifyClient } from '../../src/main/shopify-api';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

type FetchMock = jest.MockedFunction<typeof fetch>;

function createJsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('ShopifyClient', () => {
  const fetchMock = fetch as FetchMock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires store URL and access token', () => {
    expect(() => new ShopifyClient({ storeUrl: '', accessToken: 'token' })).toThrow(
      'Shopify store URL and access token are required'
    );
    expect(() => new ShopifyClient({ storeUrl: 'shop.myshopify.com', accessToken: '' })).toThrow(
      'Shopify store URL and access token are required'
    );
  });

  test('posts GraphQL queries to the versioned Shopify endpoint', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ data: { shop: { name: 'Demo' } } }) as never);
    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    await expect(client.query('query Demo { shop { name } }', { cursor: 'abc' })).resolves.toEqual({
      shop: { name: 'Demo' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-shop.myshopify.com/admin/api/2025-04/graphql.json',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': 'secret',
        },
        body: JSON.stringify({
          query: 'query Demo { shop { name } }',
          variables: { cursor: 'abc' },
        }),
      })
    );
  });

  test('surfaces HTTP errors from query', async () => {
    fetchMock.mockResolvedValue(createJsonResponse('upstream failed', false, 500) as never);
    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    await expect(client.query('query Demo')).rejects.toThrow('Shopify API HTTP error 500: upstream failed');
  });

  test('surfaces GraphQL errors from query', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ errors: [{ message: 'forbidden' }] }) as never
    );
    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    await expect(client.query('query Demo')).rejects.toThrow('GraphQL errors:');
  });

  test('fetches unfulfilled orders across pages and waits between requests', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            orders: {
              edges: [{ node: { id: 'order-1' } }],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          },
        }) as never
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            orders: {
              edges: [{ node: { id: 'order-2' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }) as never
      );

    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });
    const sleepSpy = jest
      .spyOn(client as unknown as { sleep(ms: number): Promise<void> }, 'sleep')
      .mockResolvedValue();

    await expect(client.fetchAllUnfulfilledOrders()).resolves.toEqual([{ id: 'order-1' }, { id: 'order-2' }]);
    expect(sleepSpy).toHaveBeenCalledWith(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('stops fetching unfulfilled orders when Shopify returns no edges', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({ data: { orders: null } }) as never);
    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    await expect(client.fetchAllUnfulfilledOrders()).resolves.toEqual([]);
  });

  test('fetches products with inventory across pages and handles empty responses', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            products: {
              edges: [{ node: { id: 'product-1' } }],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          },
        }) as never
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            products: {
              edges: [{ node: { id: 'product-2' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }) as never
      );

    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });
    const sleepSpy = jest
      .spyOn(client as unknown as { sleep(ms: number): Promise<void> }, 'sleep')
      .mockResolvedValue();

    await expect(client.fetchAllProductsWithInventory()).resolves.toEqual([
      { id: 'product-1' },
      { id: 'product-2' },
    ]);
    expect(sleepSpy).toHaveBeenCalledWith(500);

    fetchMock.mockResolvedValueOnce(createJsonResponse({ data: { products: undefined } }) as never);
    await expect(client.fetchAllProductsWithInventory()).resolves.toEqual([]);
  });

  test('fetches open fulfillment orders across pages and handles empty responses', async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            fulfillmentOrders: {
              edges: [{ node: { id: 'fo-1' } }],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          },
        }) as never
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          data: {
            fulfillmentOrders: {
              edges: [{ node: { id: 'fo-2' } }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }) as never
      );

    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });
    const sleepSpy = jest
      .spyOn(client as unknown as { sleep(ms: number): Promise<void> }, 'sleep')
      .mockResolvedValue();

    await expect(client.fetchOpenFulfillmentOrders()).resolves.toEqual([{ id: 'fo-1' }, { id: 'fo-2' }]);
    expect(sleepSpy).toHaveBeenCalledWith(500);

    fetchMock.mockResolvedValueOnce(createJsonResponse({ data: { fulfillmentOrders: null } }) as never);
    await expect(client.fetchOpenFulfillmentOrders()).resolves.toEqual([]);
  });

  test('fetches recently closed fulfillment orders with explicit and default since dates', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({
        data: {
          fulfillmentOrders: {
            edges: [{ node: { id: 'closed-1' } }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }) as never
    );

    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    await expect(client.fetchRecentlyClosedFulfillmentOrders('2026-01-01T00:00:00.000Z')).resolves.toEqual([
      { id: 'closed-1' },
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('status:CLOSED updated_at:>=2026-01-01T00:00:00.000Z'),
      })
    );

    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
    await expect(client.fetchRecentlyClosedFulfillmentOrders()).resolves.toEqual([{ id: 'closed-1' }]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('status:CLOSED updated_at:>='),
      })
    );
    jest.useRealTimers();
  });

  test('delegates inventory aggregation and modern orchestration helpers', async () => {
    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    jest.spyOn(client, 'fetchAllProductsWithInventory').mockResolvedValue([{ id: 'product-1' }] as never);
    jest.spyOn(client, 'extractInventoryForStorage').mockReturnValue([{ variantId: 'var-1' }] as never);
    await expect(client.fetchInventory()).resolves.toEqual({
      inventoryData: [{ variantId: 'var-1' }],
      stats: { variantCount: 1 },
    });

    jest.spyOn(client, 'fetchOpenFulfillmentOrders').mockResolvedValue([{ id: 'fo-1' }] as never);
    jest.spyOn(client, 'aggregateByVariantFromFulfillmentOrders').mockReturnValue([{ variantId: 'var-1' }] as never);
    jest.spyOn(client, 'extractOrdersForStorageFromFulfillmentOrders').mockReturnValue([{ orderId: 'order-1' }] as never);
    await expect(client.fetchAndAggregateModern()).resolves.toEqual({
      fulfillmentOrders: [{ id: 'fo-1' }],
      aggregated: [{ variantId: 'var-1' }],
      ordersForStorage: [{ orderId: 'order-1' }],
      stats: { orderCount: 1, variantCount: 1 },
      source: 'fulfillmentOrders-2025-04',
    });

    await expect(client.fetchAndAggregate()).resolves.toEqual({
      aggregated: [{ variantId: 'var-1' }],
      ordersForStorage: [{ orderId: 'order-1' }],
      stats: { orderCount: 1, variantCount: 1 },
      source: 'fulfillmentOrders-2025-04',
    });
  });

  test('delegates fulfilled-order reconciliation extraction', async () => {
    const client = new ShopifyClient({ storeUrl: 'test-shop.myshopify.com', accessToken: 'secret' });

    jest.spyOn(client, 'fetchRecentlyClosedFulfillmentOrders').mockResolvedValue([{ id: 'closed-1' }] as never);
    jest
      .spyOn(client, 'extractFulfilledOrdersForStorageFromFulfillmentOrders')
      .mockReturnValue([{ orderId: 'order-1' }] as never);

    await expect(client.fetchFulfilledOrdersForReconciliation('2026-01-01T00:00:00.000Z')).resolves.toEqual({
      fulfilledOrdersForStorage: [{ orderId: 'order-1' }],
      stats: { fulfilledOrderCount: 1 },
    });
  });
});