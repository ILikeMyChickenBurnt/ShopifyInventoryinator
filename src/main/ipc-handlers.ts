import { 
  getAllTasks, 
  getTaskByVariantId,
  updateMadeQuantity, 
  markTaskComplete,
  resetTask,
  logSync,
  initDatabase,
  // Order functions
  getOrdersWithLineItems,
  getArchivedOrdersWithLineItems,
  allocateMadeQuantityToOrders,
  resetVariantInOrders,
  archiveOrder,
  unarchiveOrder,
  archiveAllFulfilledOrders,
  unarchiveAllOrders,
  // Inventory functions
  getAllInventory,
  getInventoryStats
} from './database';
import { ShopifyClient } from './shopify-api';
import { performSync } from './sync-orchestrator';
import { ShopifyOAuth } from './oauth';
import { 
  getAccessToken, 
  saveAccessToken, 
  getStoreUrl, 
  saveStoreUrl,
  isConfigured,
  hasOAuthCredentials,
  clearCredentials,
  getClientId,
  getClientSecret,
  saveOAuthCredentials,
  getAutoSyncSettings,
  saveAutoSyncSettings
} from './config';

/**
 * Extract numeric order ID from Shopify GID
 * e.g., "gid://shopify/Order/660688109584" -> "660688109584"
 */
function extractOrderId(gid: string | null | undefined): string {
  if (!gid) return '';
  const match = gid.match(/Order\/(\d+)/);
  return match ? match[1] : gid;
}

/**
 * Safely extract a human-readable error message.
 * Replaces the previous pattern of `catch (error: any)` + unsafe `.message` access.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

/**
 * Register all IPC handlers for communication between renderer and main process
 */
function registerIpcHandlers(ipcMain: Electron.IpcMain): void {
  
  /**
   * Check if app is configured with valid credentials
   */
  ipcMain.handle('check-auth', () => {
    try {
      const configured = isConfigured();
      const hasOAuth = hasOAuthCredentials();
      const storeUrl = getStoreUrl();
      
      return { 
        success: true, 
        data: { 
          isAuthenticated: configured,
          hasOAuthCredentials: hasOAuth,
          storeUrl: storeUrl,
          needsSetup: !hasOAuth,
          needsAuth: hasOAuth && !configured
        } 
      };
    } catch (error: unknown) {
      console.error('Error checking auth:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Start OAuth authentication flow
   */
  ipcMain.handle('start-oauth', async (_event, storeUrl: string) => {
    try {
      if (!storeUrl) {
        throw new Error('Store URL is required');
      }
      
      // Normalize store URL
      let normalizedStoreUrl = storeUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
      if (!normalizedStoreUrl.includes('.myshopify.com')) {
        normalizedStoreUrl = `${normalizedStoreUrl}.myshopify.com`;
      }
      
      const clientId = getClientId();
      const clientSecret = getClientSecret();
      
      if (!clientId || !clientSecret) {
        throw new Error('OAuth credentials not configured. Please configure your Client ID and Client Secret in Settings.');
      }
      
      console.log(`Starting OAuth flow for store: ${normalizedStoreUrl}`);
      
      // Create OAuth handler and start flow
      const oauth = new ShopifyOAuth({ storeUrl: normalizedStoreUrl, clientId, clientSecret });
      const accessToken = await oauth.startOAuthFlow();
      
      // Save credentials
      saveStoreUrl(normalizedStoreUrl);
      saveAccessToken(accessToken);
      
      // Initialize/switch to this store's database
      initDatabase(normalizedStoreUrl);
      
      console.log('OAuth flow completed successfully');
      
      return { 
        success: true, 
        data: { 
          message: 'Authentication successful!',
          storeUrl: normalizedStoreUrl
        } 
      };
    } catch (error: unknown) {
      console.error('OAuth error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Logout / clear credentials
   */
  ipcMain.handle('logout', () => {
    try {
      clearCredentials();
      return { success: true, data: { message: 'Logged out successfully' } };
    } catch (error: unknown) {
      console.error('Logout error:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Save OAuth credentials (Client ID and Secret)
   */
  ipcMain.handle('save-credentials', (_event, clientId: string, clientSecret: string) => {
    try {
      if (!clientId || !clientSecret) {
        throw new Error('Both Client ID and Client Secret are required');
      }
      
      saveOAuthCredentials(clientId.trim(), clientSecret.trim());
      
      return { 
        success: true, 
        data: { message: 'Credentials saved successfully' } 
      };
    } catch (error: unknown) {
      // Security: Do not log the full error object here as it may contain credential-related context
      console.error('Error saving credentials (sanitized):', getErrorMessage(error));
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get all tasks from local database
   */
  ipcMain.handle('get-tasks', () => {
    try {
      const tasks = getAllTasks();
      return { success: true, data: tasks };
    } catch (error: unknown) {
      console.error('Error getting tasks:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Mark quantity as made for a variant
   */
  ipcMain.handle('mark-made', (_event, variantId: string, quantity: number) => {
    try {
      // Validate inputs
      if (!variantId) {
        throw new Error('Variant ID is required');
      }
      
      if (typeof quantity !== 'number' || quantity < 1) {
        throw new Error('Quantity must be a positive number');
      }
      
      // Update task database
      updateMadeQuantity(variantId, quantity);
      
      // Also allocate to orders (oldest first)
      const { newlyFulfilledOrders } = allocateMadeQuantityToOrders(variantId, quantity);
      
      // Get updated task
      const updatedTask = getTaskByVariantId(variantId);
      
      // Include store URL for building Shopify admin links
      const storeUrl = getStoreUrl();
      
      return { 
        success: true, 
        data: updatedTask,
        newlyFulfilledOrders: newlyFulfilledOrders.map((o: unknown) => {
          const order = o as { orderId?: string; order_id?: string };
          const id = order.orderId || order.order_id || '';
          return {
            ...order,
            shopifyAdminUrl: `https://${storeUrl}/admin/orders/${extractOrderId(id)}`
          };
        })
      };
    } catch (error: unknown) {
      console.error('Error marking made:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Mark task as complete (all remaining quantity)
   */
  ipcMain.handle('mark-complete', (_event, variantId: string) => {
    try {
      if (!variantId) {
        throw new Error('Variant ID is required');
      }
      
      // Get current task to know remaining quantity
      const task = getTaskByVariantId(variantId);
      if (!task) {
        throw new Error(`Task not found for variant: ${variantId}`);
      }
      const remainingQty = task.total_quantity - task.made_quantity;
      
      markTaskComplete(variantId);
      
      // Also allocate remaining to orders
      let newlyFulfilledOrders: unknown[] = [];
      if (remainingQty > 0) {
        const result = allocateMadeQuantityToOrders(variantId, remainingQty);
        newlyFulfilledOrders = result.newlyFulfilledOrders;
      }
      
      const updatedTask = getTaskByVariantId(variantId);
      
      // Include store URL for building Shopify admin links
      const storeUrl = getStoreUrl();
      
      return { 
        success: true, 
        data: updatedTask,
        newlyFulfilledOrders: newlyFulfilledOrders.map((o: unknown) => {
          const order = o as { orderId?: string; order_id?: string };
          const id = order.orderId || order.order_id || '';
          return {
            ...order,
            shopifyAdminUrl: storeUrl ? `https://${storeUrl}/admin/orders/${extractOrderId(id)}` : null
          };
        })
      };
    } catch (error: unknown) {
      console.error('Error marking complete:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Reset task progress (set made back to 0)
   */
  ipcMain.handle('reset-task', (_event, variantId: string) => {
    try {
      if (!variantId) {
        throw new Error('Variant ID is required');
      }
      
      resetTask(variantId);
      
      // Also reset in orders
      resetVariantInOrders(variantId);
      
      const updatedTask = getTaskByVariantId(variantId);
      
      return { success: true, data: updatedTask };
    } catch (error: unknown) {
      console.error('Error resetting task:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Sync from Shopify - thin wrapper around the testable orchestrator
   */
  ipcMain.handle('sync-shopify', async () => {
    try {
      console.log('Starting Shopify sync...');

      const storeUrl = getStoreUrl();
      const accessToken = getAccessToken();

      if (!storeUrl || !accessToken) {
        throw new Error('Not authenticated. Please connect to Shopify first.');
      }

      const client = new ShopifyClient({ storeUrl, accessToken });

      // Delegate to the extracted, highly testable orchestrator
      const syncResult = await performSync(client);

      return syncResult;
    } catch (error: unknown) {
      console.error('Error syncing from Shopify:', error);
      const msg = getErrorMessage(error);

      logSync({
        ordersFetched: 0,
        variantsUpdated: 0,
        status: 'error',
        errorMessage: msg
      });

      return { success: false, error: msg };
    }
  });

  /**
   * Get all orders with their line items and progress
   */
  ipcMain.handle('get-orders', () => {
    try {
      const orders = getOrdersWithLineItems();
      const storeUrl = getStoreUrl();
      
      // Add Shopify admin URL to each order
      const ordersWithUrls = orders.map((order: unknown) => {
        const o = order as { order_id?: string };
        return {
          ...o,
          shopifyAdminUrl: storeUrl ? `https://${storeUrl}/admin/orders/${extractOrderId(o.order_id)}` : null
        };
      });
      
      return { success: true, data: ordersWithUrls };
    } catch (error: unknown) {
      console.error('Error getting orders:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Archive a single order (removes from tracking, deallocates quantities)
   */
  ipcMain.handle('archive-order', (_event, orderId: string) => {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      archiveOrder(orderId);
      
      return { success: true, data: { message: 'Order archived successfully' } };
    } catch (error: unknown) {
      console.error('Error archiving order:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Archive all fulfilled orders
   */
  ipcMain.handle('archive-all-fulfilled', () => {
    try {
      const result = archiveAllFulfilledOrders();
      
      return { 
        success: true, 
        data: { 
          message: `Archived ${result.archivedCount} fulfilled order(s)`,
          archivedCount: result.archivedCount
        } 
      };
    } catch (error: unknown) {
      console.error('Error archiving fulfilled orders:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get archived orders with their line items
   */
  ipcMain.handle('get-archived-orders', () => {
    try {
      const orders = getArchivedOrdersWithLineItems();
      return { success: true, data: orders };
    } catch (error: unknown) {
      console.error('Error getting archived orders:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Unarchive a single order (restores to active tracking)
   */
  ipcMain.handle('unarchive-order', (_event, orderId: string) => {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      unarchiveOrder(orderId);
      
      return { success: true, data: { message: 'Order restored successfully' } };
    } catch (error: unknown) {
      console.error('Error unarchiving order:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Unarchive all archived orders
   */
  ipcMain.handle('unarchive-all', () => {
    try {
      const result = unarchiveAllOrders();
      
      return { 
        success: true, 
        data: { 
          message: `Restored ${result.unarchivedCount} order(s)`,
          unarchivedCount: result.unarchivedCount
        } 
      };
    } catch (error: unknown) {
      console.error('Error unarchiving orders:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get auto-sync settings
   */
  ipcMain.handle('get-auto-sync-settings', () => {
    try {
      const settings = getAutoSyncSettings();
      return { success: true, data: settings };
    } catch (error: unknown) {
      console.error('Error getting auto-sync settings:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Save auto-sync settings
   */
  ipcMain.handle('save-auto-sync-settings', (_event, enabled: boolean, intervalMinutes: number) => {
    try {
      saveAutoSyncSettings(enabled, intervalMinutes);
      return { 
        success: true, 
        data: { 
          message: enabled ? `Auto-sync enabled (every ${intervalMinutes} min)` : 'Auto-sync disabled',
          enabled,
          intervalMinutes
        } 
      };
    } catch (error: unknown) {
      console.error('Error saving auto-sync settings:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });

  /**
   * Get all inventory data
   */
  ipcMain.handle('get-inventory', (_event, options: unknown = {}) => {
    try {
      const inventory = getAllInventory(options as Record<string, unknown>);
      const stats = getInventoryStats();
      
      return { 
        success: true, 
        data: {
          inventory,
          stats
        }
      };
    } catch (error: unknown) {
      console.error('Error getting inventory:', error);
      return { success: false, error: getErrorMessage(error) };
    }
  });
}

export { registerIpcHandlers };
