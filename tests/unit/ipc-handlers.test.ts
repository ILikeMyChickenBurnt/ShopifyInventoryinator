const mockDatabase = {
  getAllTasks: jest.fn(),
  getTaskByVariantId: jest.fn(),
  updateMadeQuantity: jest.fn(),
  markTaskComplete: jest.fn(),
  resetTask: jest.fn(),
  logSync: jest.fn(),
  initDatabase: jest.fn(),
  getOrdersWithLineItems: jest.fn(),
  getArchivedOrdersWithLineItems: jest.fn(),
  allocateMadeQuantityToOrders: jest.fn(),
  resetVariantInOrders: jest.fn(),
  archiveOrder: jest.fn(),
  unarchiveOrder: jest.fn(),
  archiveAllFulfilledOrders: jest.fn(),
  unarchiveAllOrders: jest.fn(),
  getAllInventory: jest.fn(),
  getInventoryStats: jest.fn()
};

const mockConfig = {
  getAccessToken: jest.fn(),
  saveAccessToken: jest.fn(),
  getStoreUrl: jest.fn(),
  saveStoreUrl: jest.fn(),
  isConfigured: jest.fn(),
  hasOAuthCredentials: jest.fn(),
  clearCredentials: jest.fn(),
  getClientId: jest.fn(),
  getClientSecret: jest.fn(),
  saveOAuthCredentials: jest.fn(),
  getAutoSyncSettings: jest.fn(),
  saveAutoSyncSettings: jest.fn()
};

const mockPerformSync = jest.fn();
const mockShopifyClient = jest.fn();
const mockStartOAuthFlow = jest.fn();
const mockShopifyOAuth = jest.fn().mockImplementation(() => ({
  startOAuthFlow: mockStartOAuthFlow
}));

jest.mock('../../src/main/database', () => mockDatabase);
jest.mock('../../src/main/config', () => mockConfig);
jest.mock('../../src/main/shopify-api', () => ({
  ShopifyClient: mockShopifyClient
}));
jest.mock('../../src/main/sync-orchestrator', () => ({
  performSync: mockPerformSync
}));
jest.mock('../../src/main/oauth', () => ({
  ShopifyOAuth: mockShopifyOAuth
}));

const { registerIpcHandlers } = require('../../src/main/ipc-handlers') as {
  registerIpcHandlers: (ipcMain: { handle: jest.Mock }) => void;
};

describe('registerIpcHandlers', () => {
  function createIpcMain() {
    return {
      handle: jest.fn()
    };
  }

  function registerHandlers() {
    const ipcMain = createIpcMain();
    registerIpcHandlers(ipcMain as unknown as Electron.IpcMain);
    const handlers = new Map<string, (...args: unknown[]) => unknown>(
      ipcMain.handle.mock.calls.map(([name, handler]: [string, (...args: unknown[]) => unknown]) => [name, handler])
    );

    return { ipcMain, handlers };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.isConfigured.mockReturnValue(false);
    mockConfig.hasOAuthCredentials.mockReturnValue(false);
    mockConfig.getStoreUrl.mockReturnValue('test-shop.myshopify.com');
    mockConfig.getAccessToken.mockReturnValue('access-token');
    mockConfig.getClientId.mockReturnValue('client-id');
    mockConfig.getClientSecret.mockReturnValue('client-secret');
    mockConfig.getAutoSyncSettings.mockReturnValue({ enabled: false, intervalMinutes: 15 });
    mockDatabase.allocateMadeQuantityToOrders.mockReturnValue({ newlyFulfilledOrders: [] });
    mockDatabase.getTaskByVariantId.mockReturnValue({
      variant_id: 'var-1',
      total_quantity: 5,
      made_quantity: 2,
      status: 'in_progress'
    });
    mockDatabase.getOrdersWithLineItems.mockReturnValue([]);
    mockDatabase.getArchivedOrdersWithLineItems.mockReturnValue([]);
    mockDatabase.archiveAllFulfilledOrders.mockReturnValue({ archivedCount: 2 });
    mockDatabase.unarchiveAllOrders.mockReturnValue({ unarchivedCount: 3 });
    mockDatabase.getAllInventory.mockReturnValue([{ variant_id: 'var-1' }]);
    mockDatabase.getInventoryStats.mockReturnValue({ totalVariants: 1 });
    mockPerformSync.mockResolvedValue({ success: true, data: { synced: true } });
    mockStartOAuthFlow.mockResolvedValue('oauth-token');
  });

  test('registers the key handlers needed by the renderer', () => {
    const { ipcMain } = registerHandlers();
    const registeredNames = ipcMain.handle.mock.calls.map(([name]: [string]) => name);

    expect(registeredNames).toEqual(
      expect.arrayContaining([
        'check-auth',
        'start-oauth',
        'logout',
        'save-credentials',
        'get-tasks',
        'mark-made',
        'mark-complete'
      ])
    );
  });

  test('returns auth state for check-auth', () => {
    mockConfig.isConfigured.mockReturnValue(true);
    mockConfig.hasOAuthCredentials.mockReturnValue(true);
    mockConfig.getStoreUrl.mockReturnValue('configured-shop.myshopify.com');
    const { handlers } = registerHandlers();

    const result = handlers.get('check-auth')?.();

    expect(result).toEqual({
      success: true,
      data: {
        isAuthenticated: true,
        hasOAuthCredentials: true,
        storeUrl: 'configured-shop.myshopify.com',
        needsSetup: false,
        needsAuth: false
      }
    });
  });

  test('returns a sanitized error for check-auth failures', () => {
    mockConfig.isConfigured.mockImplementation(() => {
      throw new Error('auth unavailable');
    });
    const { handlers } = registerHandlers();

    const result = handlers.get('check-auth')?.();

    expect(result).toEqual({ success: false, error: 'auth unavailable' });
  });

  test('saves trimmed OAuth credentials', () => {
    const { handlers } = registerHandlers();

    const result = handlers.get('save-credentials')?.(null, '  client-id  ', '  client-secret  ');

    expect(mockConfig.saveOAuthCredentials).toHaveBeenCalledWith('client-id', 'client-secret');
    expect(result).toEqual({
      success: true,
      data: { message: 'Credentials saved successfully' }
    });
  });

  test('validates save-credentials inputs', () => {
    const { handlers } = registerHandlers();

    const result = handlers.get('save-credentials')?.(null, 'client-id', '');

    expect(result).toEqual({
      success: false,
      error: 'Both Client ID and Client Secret are required'
    });
  });

  test('clears credentials during logout', () => {
    const { handlers } = registerHandlers();

    const result = handlers.get('logout')?.();

    expect(mockConfig.clearCredentials).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: { message: 'Logged out successfully' }
    });
  });

  test('returns an error when logout fails', () => {
    mockConfig.clearCredentials.mockImplementation(() => {
      throw new Error('logout failed');
    });
    const { handlers } = registerHandlers();

    const result = handlers.get('logout')?.();

    expect(result).toEqual({ success: false, error: 'logout failed' });
  });

  test('validates start-oauth input and missing credentials', async () => {
    const { handlers } = registerHandlers();

    await expect(handlers.get('start-oauth')?.(null, '')).resolves.toEqual({
      success: false,
      error: 'Store URL is required'
    });

    mockConfig.getClientId.mockReturnValue('');
    await expect(handlers.get('start-oauth')?.(null, 'test-shop')).resolves.toEqual({
      success: false,
      error: 'OAuth credentials not configured. Please configure your Client ID and Client Secret in Settings.'
    });
  });

  test('normalizes store URL and persists OAuth results on start-oauth success', async () => {
    const { handlers } = registerHandlers();

    const result = await handlers.get('start-oauth')?.(null, 'https://test-shop/');

    expect(mockShopifyOAuth).toHaveBeenCalledWith({
      storeUrl: 'test-shop.myshopify.com',
      clientId: 'client-id',
      clientSecret: 'client-secret'
    });
    expect(mockConfig.saveStoreUrl).toHaveBeenCalledWith('test-shop.myshopify.com');
    expect(mockConfig.saveAccessToken).toHaveBeenCalledWith('oauth-token');
    expect(mockDatabase.initDatabase).toHaveBeenCalledWith('test-shop.myshopify.com');
    expect(result).toEqual({
      success: true,
      data: {
        message: 'Authentication successful!',
        storeUrl: 'test-shop.myshopify.com'
      }
    });
  });

  test('returns a sanitized error when start-oauth fails', async () => {
    mockStartOAuthFlow.mockRejectedValue(new Error('oauth failed'));
    const { handlers } = registerHandlers();

    await expect(handlers.get('start-oauth')?.(null, 'test-shop.myshopify.com')).resolves.toEqual({
      success: false,
      error: 'oauth failed'
    });
  });

  test('validates mark-made inputs', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('mark-made')?.(null, '', 1)).toEqual({
      success: false,
      error: 'Variant ID is required'
    });
    expect(handlers.get('mark-made')?.(null, 'var-1', 0)).toEqual({
      success: false,
      error: 'Quantity must be a positive number'
    });
  });

  test('updates task progress and maps fulfilled-order admin URLs for mark-made', () => {
    mockDatabase.allocateMadeQuantityToOrders.mockReturnValue({
      newlyFulfilledOrders: [
        { orderId: 'gid://shopify/Order/12345', orderName: '#1001' },
        { order_id: 'gid://shopify/Order/67890', orderName: '#1002' }
      ]
    });
    mockDatabase.getTaskByVariantId.mockReturnValue({ variant_id: 'var-1', status: 'completed' });
    const { handlers } = registerHandlers();

    const result = handlers.get('mark-made')?.(null, 'var-1', 3);

    expect(mockDatabase.updateMadeQuantity).toHaveBeenCalledWith('var-1', 3);
    expect(mockDatabase.allocateMadeQuantityToOrders).toHaveBeenCalledWith('var-1', 3);
    expect(result).toEqual({
      success: true,
      data: { variant_id: 'var-1', status: 'completed' },
      newlyFulfilledOrders: [
        {
          orderId: 'gid://shopify/Order/12345',
          orderName: '#1001',
          shopifyAdminUrl: 'https://test-shop.myshopify.com/admin/orders/12345'
        },
        {
          order_id: 'gid://shopify/Order/67890',
          orderName: '#1002',
          shopifyAdminUrl: 'https://test-shop.myshopify.com/admin/orders/67890'
        }
      ]
    });
  });

  test('validates mark-complete input and task existence', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('mark-complete')?.(null, '')).toEqual({
      success: false,
      error: 'Variant ID is required'
    });

    mockDatabase.getTaskByVariantId.mockReturnValueOnce(null);
    expect(handlers.get('mark-complete')?.(null, 'missing-variant')).toEqual({
      success: false,
      error: 'Task not found for variant: missing-variant'
    });
  });

  test('marks a task complete and allocates remaining quantity to orders', () => {
    mockDatabase.getTaskByVariantId
      .mockReturnValueOnce({
        variant_id: 'var-1',
        total_quantity: 5,
        made_quantity: 2
      })
      .mockReturnValueOnce({
        variant_id: 'var-1',
        status: 'completed'
      });
    mockDatabase.allocateMadeQuantityToOrders.mockReturnValue({
      newlyFulfilledOrders: [{ orderId: 'gid://shopify/Order/555', orderName: '#1005' }]
    });
    const { handlers } = registerHandlers();

    const result = handlers.get('mark-complete')?.(null, 'var-1');

    expect(mockDatabase.markTaskComplete).toHaveBeenCalledWith('var-1');
    expect(mockDatabase.allocateMadeQuantityToOrders).toHaveBeenCalledWith('var-1', 3);
    expect(result).toEqual({
      success: true,
      data: { variant_id: 'var-1', status: 'completed' },
      newlyFulfilledOrders: [
        {
          orderId: 'gid://shopify/Order/555',
          orderName: '#1005',
          shopifyAdminUrl: 'https://test-shop.myshopify.com/admin/orders/555'
        }
      ]
    });
  });

  test('returns a sync error and logs it when credentials are missing', async () => {
    mockConfig.getStoreUrl.mockReturnValue('');
    const { handlers } = registerHandlers();

    await expect(handlers.get('sync-shopify')?.()).resolves.toEqual({
      success: false,
      error: 'Not authenticated. Please connect to Shopify first.'
    });
    expect(mockDatabase.logSync).toHaveBeenCalledWith({
      ordersFetched: 0,
      variantsUpdated: 0,
      status: 'error',
      errorMessage: 'Not authenticated. Please connect to Shopify first.'
    });
  });

  test('creates a Shopify client and delegates sync-shopify to the orchestrator', async () => {
    const { handlers } = registerHandlers();

    const result = await handlers.get('sync-shopify')?.();

    expect(mockShopifyClient).toHaveBeenCalledWith({
      storeUrl: 'test-shop.myshopify.com',
      accessToken: 'access-token'
    });
    expect(mockPerformSync).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { synced: true } });
  });

  test('maps admin URLs in get-orders and handles missing store URL', () => {
    mockDatabase.getOrdersWithLineItems.mockReturnValue([
      { order_id: 'gid://shopify/Order/111', order_name: '#111' }
    ]);
    const { handlers } = registerHandlers();

    expect(handlers.get('get-orders')?.()).toEqual({
      success: true,
      data: [
        {
          order_id: 'gid://shopify/Order/111',
          order_name: '#111',
          shopifyAdminUrl: 'https://test-shop.myshopify.com/admin/orders/111'
        }
      ]
    });

    mockConfig.getStoreUrl.mockReturnValue('');
    expect(handlers.get('get-orders')?.()).toEqual({
      success: true,
      data: [
        {
          order_id: 'gid://shopify/Order/111',
          order_name: '#111',
          shopifyAdminUrl: null
        }
      ]
    });
  });

  test('validates archive and unarchive order inputs', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('archive-order')?.(null, '')).toEqual({
      success: false,
      error: 'Order ID is required'
    });
    expect(handlers.get('unarchive-order')?.(null, '')).toEqual({
      success: false,
      error: 'Order ID is required'
    });
  });

  test('archives and unarchives orders successfully', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('archive-order')?.(null, 'order-1')).toEqual({
      success: true,
      data: { message: 'Order archived successfully' }
    });
    expect(mockDatabase.archiveOrder).toHaveBeenCalledWith('order-1');

    expect(handlers.get('unarchive-order')?.(null, 'order-1')).toEqual({
      success: true,
      data: { message: 'Order restored successfully' }
    });
    expect(mockDatabase.unarchiveOrder).toHaveBeenCalledWith('order-1');
  });

  test('returns aggregate archive and unarchive counts', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('archive-all-fulfilled')?.()).toEqual({
      success: true,
      data: {
        message: 'Archived 2 fulfilled order(s)',
        archivedCount: 2
      }
    });

    expect(handlers.get('unarchive-all')?.()).toEqual({
      success: true,
      data: {
        message: 'Restored 3 order(s)',
        unarchivedCount: 3
      }
    });
  });

  test('returns auto-sync settings and saves updates', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('get-auto-sync-settings')?.()).toEqual({
      success: true,
      data: { enabled: false, intervalMinutes: 15 }
    });

    expect(handlers.get('save-auto-sync-settings')?.(null, true, 30)).toEqual({
      success: true,
      data: {
        message: 'Auto-sync enabled (every 30 min)',
        enabled: true,
        intervalMinutes: 30
      }
    });
    expect(mockConfig.saveAutoSyncSettings).toHaveBeenCalledWith(true, 30);
  });

  test('returns inventory and stats payloads', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('get-inventory')?.(null, { status: 'active' })).toEqual({
      success: true,
      data: {
        inventory: [{ variant_id: 'var-1' }],
        stats: { totalVariants: 1 }
      }
    });
    expect(mockDatabase.getAllInventory).toHaveBeenCalledWith({ status: 'active' });
  });

  test('returns tasks and sanitizes get-tasks failures', () => {
    mockDatabase.getAllTasks.mockReturnValue([{ variant_id: 'var-1' }]);
    const { handlers } = registerHandlers();

    expect(handlers.get('get-tasks')?.()).toEqual({
      success: true,
      data: [{ variant_id: 'var-1' }]
    });

    mockDatabase.getAllTasks.mockImplementation(() => {
      throw new Error('tasks unavailable');
    });
    expect(handlers.get('get-tasks')?.()).toEqual({
      success: false,
      error: 'tasks unavailable'
    });
  });

  test('validates and resets task progress', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('reset-task')?.(null, '')).toEqual({
      success: false,
      error: 'Variant ID is required'
    });

    mockDatabase.getTaskByVariantId.mockReturnValue({ variant_id: 'var-1', status: 'pending' });
    expect(handlers.get('reset-task')?.(null, 'var-1')).toEqual({
      success: true,
      data: { variant_id: 'var-1', status: 'pending' }
    });
    expect(mockDatabase.resetTask).toHaveBeenCalledWith('var-1');
    expect(mockDatabase.resetVariantInOrders).toHaveBeenCalledWith('var-1');
  });

  test('returns archived orders and sanitizes retrieval failures', () => {
    mockDatabase.getArchivedOrdersWithLineItems.mockReturnValue([{ order_id: 'archived-1' }]);
    const { handlers } = registerHandlers();

    expect(handlers.get('get-archived-orders')?.()).toEqual({
      success: true,
      data: [{ order_id: 'archived-1' }]
    });

    mockDatabase.getArchivedOrdersWithLineItems.mockImplementation(() => {
      throw new Error('archive read failed');
    });
    expect(handlers.get('get-archived-orders')?.()).toEqual({
      success: false,
      error: 'archive read failed'
    });
  });

  test('sanitizes archive-all-fulfilled failures', () => {
    mockDatabase.archiveAllFulfilledOrders.mockImplementation(() => {
      throw new Error('archive batch failed');
    });
    const { handlers } = registerHandlers();

    expect(handlers.get('archive-all-fulfilled')?.()).toEqual({
      success: false,
      error: 'archive batch failed'
    });
  });

  test('returns disabled auto-sync message and sanitizes save failures', () => {
    const { handlers } = registerHandlers();

    expect(handlers.get('save-auto-sync-settings')?.(null, false, 30)).toEqual({
      success: true,
      data: {
        message: 'Auto-sync disabled',
        enabled: false,
        intervalMinutes: 30
      }
    });

    mockConfig.saveAutoSyncSettings.mockImplementation(() => {
      throw new Error('settings failed');
    });
    expect(handlers.get('save-auto-sync-settings')?.(null, true, 30)).toEqual({
      success: false,
      error: 'settings failed'
    });
  });

  test('sanitizes get-auto-sync-settings failures', () => {
    mockConfig.getAutoSyncSettings.mockImplementation(() => {
      throw new Error('settings unavailable');
    });
    const { handlers } = registerHandlers();

    expect(handlers.get('get-auto-sync-settings')?.()).toEqual({
      success: false,
      error: 'settings unavailable'
    });
  });

  test('sanitizes get-inventory failures', () => {
    mockDatabase.getAllInventory.mockImplementation(() => {
      throw new Error('inventory unavailable');
    });
    const { handlers } = registerHandlers();

    expect(handlers.get('get-inventory')?.()).toEqual({
      success: false,
      error: 'inventory unavailable'
    });
  });

  test('returns sync-shopify failure when the orchestrator throws', async () => {
    mockPerformSync.mockRejectedValue(new Error('sync failed'));
    const { handlers } = registerHandlers();

    await expect(handlers.get('sync-shopify')?.()).resolves.toEqual({
      success: false,
      error: 'sync failed'
    });
    expect(mockDatabase.logSync).toHaveBeenCalledWith({
      ordersFetched: 0,
      variantsUpdated: 0,
      status: 'error',
      errorMessage: 'sync failed'
    });
  });
});