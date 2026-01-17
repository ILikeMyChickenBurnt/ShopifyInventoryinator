const { 
  getAllTasks, 
  getTaskByVariantId,
  updateMadeQuantity, 
  markTaskComplete,
  resetTask,
  upsertTask,
  logSync,
  initDatabase,
  // Order functions
  upsertOrder,
  upsertOrderLineItem,
  getOrdersWithLineItems,
  getArchivedOrdersWithLineItems,
  allocateMadeQuantityToOrders,
  resetVariantInOrders,
  clearOrdersWithoutProgress,
  getOrderIdsToSkipDuringSync,
  recalculateTaskTotalsFromOrders,
  updateAllOrderStatuses,
  archiveOrder,
  unarchiveOrder,
  archiveAllFulfilledOrders,
  unarchiveAllOrders
} = require('./database');
const { ShopifyClient } = require('./shopify-api');
const { ShopifyOAuth, REDIRECT_URI } = require('./oauth');
const { 
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
} = require('./config');

/**
 * Extract numeric order ID from Shopify GID
 * e.g., "gid://shopify/Order/660688109584" -> "660688109584"
 */
function extractOrderId(gid) {
  if (!gid) return '';
  const match = gid.match(/Order\/(\d+)/);
  return match ? match[1] : gid;
}

/**
 * Register all IPC handlers for communication between renderer and main process
 */
function registerIpcHandlers(ipcMain) {
  
  /**
   * Check if app is configured with valid credentials
   */
  ipcMain.handle('check-auth', async (event) => {
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
    } catch (error) {
      console.error('Error checking auth:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Start OAuth authentication flow
   */
  ipcMain.handle('start-oauth', async (event, storeUrl) => {
    try {
      if (!storeUrl) {
        throw new Error('Store URL is required');
      }
      
      // Normalize store URL
      storeUrl = storeUrl.replace('https://', '').replace('http://', '').replace(/\/$/, '');
      if (!storeUrl.includes('.myshopify.com')) {
        storeUrl = `${storeUrl}.myshopify.com`;
      }
      
      const clientId = getClientId();
      const clientSecret = getClientSecret();
      
      if (!clientId || !clientSecret) {
        throw new Error('OAuth credentials not configured. Please configure your Client ID and Client Secret in Settings.');
      }
      
      console.log(`Starting OAuth flow for store: ${storeUrl}`);
      
      // Create OAuth handler and start flow
      const oauth = new ShopifyOAuth(storeUrl, clientId, clientSecret);
      const accessToken = await oauth.startOAuthFlow();
      
      // Save credentials
      saveStoreUrl(storeUrl);
      saveAccessToken(accessToken);
      
      // Initialize/switch to this store's database
      initDatabase(storeUrl);
      
      console.log('OAuth flow completed successfully');
      
      return { 
        success: true, 
        data: { 
          message: 'Authentication successful!',
          storeUrl: storeUrl
        } 
      };
    } catch (error) {
      console.error('OAuth error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Logout / clear credentials
   */
  ipcMain.handle('logout', async (event) => {
    try {
      clearCredentials();
      return { success: true, data: { message: 'Logged out successfully' } };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Save OAuth credentials (Client ID and Secret)
   */
  ipcMain.handle('save-credentials', async (event, clientId, clientSecret) => {
    try {
      if (!clientId || !clientSecret) {
        throw new Error('Both Client ID and Client Secret are required');
      }
      
      saveOAuthCredentials(clientId.trim(), clientSecret.trim());
      
      return { 
        success: true, 
        data: { message: 'Credentials saved successfully' } 
      };
    } catch (error) {
      console.error('Error saving credentials:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get all tasks from local database
   */
  ipcMain.handle('get-tasks', async (event) => {
    try {
      const tasks = getAllTasks();
      return { success: true, data: tasks };
    } catch (error) {
      console.error('Error getting tasks:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Mark quantity as made for a variant
   */
  ipcMain.handle('mark-made', async (event, variantId, quantity) => {
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
        newlyFulfilledOrders: newlyFulfilledOrders.map(o => ({
          ...o,
          shopifyAdminUrl: `https://${storeUrl}/admin/orders/${extractOrderId(o.order_id)}`
        }))
      };
    } catch (error) {
      console.error('Error marking made:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Mark task as complete (all remaining quantity)
   */
  ipcMain.handle('mark-complete', async (event, variantId) => {
    try {
      if (!variantId) {
        throw new Error('Variant ID is required');
      }
      
      // Get current task to know remaining quantity
      const task = getTaskByVariantId(variantId);
      const remainingQty = task.total_quantity - task.made_quantity;
      
      markTaskComplete(variantId);
      
      // Also allocate remaining to orders
      let newlyFulfilledOrders = [];
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
        newlyFulfilledOrders: newlyFulfilledOrders.map(o => ({
          ...o,
          shopifyAdminUrl: `https://${storeUrl}/admin/orders/${extractOrderId(o.order_id)}`
        }))
      };
    } catch (error) {
      console.error('Error marking complete:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Reset task progress (set made back to 0)
   */
  ipcMain.handle('reset-task', async (event, variantId) => {
    try {
      if (!variantId) {
        throw new Error('Variant ID is required');
      }
      
      resetTask(variantId);
      
      // Also reset in orders
      resetVariantInOrders(variantId);
      
      const updatedTask = getTaskByVariantId(variantId);
      
      return { success: true, data: updatedTask };
    } catch (error) {
      console.error('Error resetting task:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Sync from Shopify - fetch unfulfilled orders and update database
   */
  ipcMain.handle('sync-shopify', async (event) => {
    try {
      console.log('Starting Shopify sync...');
      
      // Get credentials from config
      const storeUrl = getStoreUrl();
      const accessToken = getAccessToken();
      
      if (!storeUrl || !accessToken) {
        throw new Error('Not authenticated. Please connect to Shopify first.');
      }
      
      // Create Shopify client
      const client = new ShopifyClient(storeUrl, accessToken);
      
      // Fetch and aggregate data
      const result = await client.fetchAndAggregate();
      const { aggregated, ordersForStorage, stats } = result;
      
      console.log(`Synced ${stats.orderCount} orders, ${stats.variantCount} variants`);
      
      // Get order IDs to skip during sync (archived + orders with progress)
      const skipOrderIds = getOrderIdsToSkipDuringSync();
      console.log(`Preserving ${skipOrderIds.size} orders (archived or with progress)`);
      
      // Clear orders without progress (safe to refresh from Shopify)
      clearOrdersWithoutProgress();
      
      // Store orders and their line items (skip archived and orders with progress)
      let storedCount = 0;
      let skippedCount = 0;
      for (const order of ordersForStorage) {
        // Skip if this order is archived or has progress
        if (skipOrderIds.has(order.orderId)) {
          console.log(`Skipping preserved order: ${order.orderName}`);
          skippedCount++;
          continue;
        }
        upsertOrder(order);
        for (const lineItem of order.lineItems) {
          upsertOrderLineItem(lineItem);
        }
        storedCount++;
      }
      console.log(`Stored ${storedCount} orders with line items (skipped ${skippedCount} preserved)`);
      
      // Update tasks (variant aggregates) - first upsert from Shopify data
      let updatedCount = 0;
      for (const item of aggregated) {
        upsertTask(item);
        updatedCount++;
      }
      
      // Recalculate task totals to exclude archived order quantities
      // This is necessary because Shopify aggregated data includes all orders
      if (skipOrderIds.size > 0) {
        recalculateTaskTotalsFromOrders();
      }
      
      // Ensure order statuses are consistent with their line items
      updateAllOrderStatuses();
      
      // Log sync to history
      logSync({
        ordersFetched: stats.orderCount,
        variantsUpdated: updatedCount,
        status: 'success'
      });
      
      console.log('Sync completed successfully');
      
      return { 
        success: true, 
        data: {
          ordersCount: stats.orderCount,
          variantsCount: stats.variantCount,
          message: `Synced ${stats.orderCount} orders with ${stats.variantCount} unique variants`
        }
      };
    } catch (error) {
      console.error('Error syncing from Shopify:', error);
      
      // Log failed sync
      logSync({
        ordersFetched: 0,
        variantsUpdated: 0,
        status: 'error',
        errorMessage: error.message
      });
      
      return { success: false, error: error.message };
    }
  });

  /**
   * Get all orders with their line items and progress
   */
  ipcMain.handle('get-orders', async (event) => {
    try {
      const orders = getOrdersWithLineItems();
      return { success: true, data: orders };
    } catch (error) {
      console.error('Error getting orders:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Archive a single order (removes from tracking, deallocates quantities)
   */
  ipcMain.handle('archive-order', async (event, orderId) => {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      archiveOrder(orderId);
      
      return { success: true, data: { message: 'Order archived successfully' } };
    } catch (error) {
      console.error('Error archiving order:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Archive all fulfilled orders
   */
  ipcMain.handle('archive-all-fulfilled', async (event) => {
    try {
      const result = archiveAllFulfilledOrders();
      
      return { 
        success: true, 
        data: { 
          message: `Archived ${result.archivedCount} fulfilled order(s)`,
          archivedCount: result.archivedCount
        } 
      };
    } catch (error) {
      console.error('Error archiving fulfilled orders:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get archived orders with their line items
   */
  ipcMain.handle('get-archived-orders', async (event) => {
    try {
      const orders = getArchivedOrdersWithLineItems();
      return { success: true, data: orders };
    } catch (error) {
      console.error('Error getting archived orders:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Unarchive a single order (restores to active tracking)
   */
  ipcMain.handle('unarchive-order', async (event, orderId) => {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      unarchiveOrder(orderId);
      
      return { success: true, data: { message: 'Order restored successfully' } };
    } catch (error) {
      console.error('Error unarchiving order:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Unarchive all archived orders
   */
  ipcMain.handle('unarchive-all', async (event) => {
    try {
      const result = unarchiveAllOrders();
      
      return { 
        success: true, 
        data: { 
          message: `Restored ${result.unarchivedCount} order(s)`,
          unarchivedCount: result.unarchivedCount
        } 
      };
    } catch (error) {
      console.error('Error unarchiving orders:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Get auto-sync settings
   */
  ipcMain.handle('get-auto-sync-settings', async (event) => {
    try {
      const settings = getAutoSyncSettings();
      return { success: true, data: settings };
    } catch (error) {
      console.error('Error getting auto-sync settings:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Save auto-sync settings
   */
  ipcMain.handle('save-auto-sync-settings', async (event, enabled, intervalMinutes) => {
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
    } catch (error) {
      console.error('Error saving auto-sync settings:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerIpcHandlers };
