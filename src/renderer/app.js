const { createApp, ref, computed, onMounted, onUnmounted, watch } = Vue;

const App = {
  setup() {
    // App initialization state
    const appReady = ref(false);
    
    // Auth state
    const isAuthenticated = ref(false);
    const needsSetup = ref(false);
    const storeUrl = ref('');
    const storeUrlInput = ref('');
    const authLoading = ref(false);
    
    // Credentials setup state
    const setupStep = ref(1);
    const clientIdInput = ref('');
    const clientSecretInput = ref('');
    const savingCredentials = ref(false);

    // Reactive state
    const tasks = ref([]);
    const orders = ref([]);
    const archivedOrders = ref([]);
    const inventory = ref([]);
    const inventoryStats = ref(null);
    const loading = ref(false);
    const error = ref(null);
    const successMessage = ref(null);
    const toastMessage = ref(null);
    const fulfilledOrderToast = ref(null); // For order fulfilled notification
    const filter = ref('active'); // all, active, completed
    const viewMode = ref('variants'); // 'variants', 'orders', or 'inventory'
    const orderFilter = ref('active'); // all, active, fulfilled, archived
    
    // Inventory state
    const inventoryFilter = ref('all'); // 'all' or 'out-of-stock'
    const inventorySearchQuery = ref('');
    const debouncedInventorySearch = ref('');
    const inventoryLoading = ref(false);
    let inventorySearchTimeout = null;
    
    // Auto-sync state
    const autoSyncEnabled = ref(false);
    const autoSyncInterval = ref(5);
    const lastSyncTime = ref(null);
    const lastSyncAgo = ref('');
    let autoSyncTimer = null;
    let lastSyncAgoTimer = null;
    
    // Search state
    const taskSearchQuery = ref('');
    const orderSearchQuery = ref('');
    const debouncedTaskSearch = ref('');
    const debouncedOrderSearch = ref('');
    let taskSearchTimeout = null;
    let orderSearchTimeout = null;

    // Computed properties
    const filteredTasks = computed(() => {
      let result = tasks.value;
      
      // Apply search filter
      if (debouncedTaskSearch.value) {
        const query = debouncedTaskSearch.value.toLowerCase();
        result = result.filter(t => 
          (t.product_title && t.product_title.toLowerCase().includes(query)) ||
          (t.variant_title && t.variant_title.toLowerCase().includes(query)) ||
          (t.sku && t.sku.toLowerCase().includes(query))
        );
      }
      
      // Apply status filter
      if (filter.value === 'active') {
        return result.filter(t => t.status === 'pending' || t.status === 'in_progress');
      }
      if (filter.value !== 'all') {
        return result.filter(t => t.status === filter.value);
      }
      return result;
    });

    const filteredOrders = computed(() => {
      let result;
      
      // First apply status filter
      if (orderFilter.value === 'all') {
        result = orders.value;
      } else if (orderFilter.value === 'active') {
        result = orders.value.filter(o => o.status === 'pending' || o.status === 'in_progress');
      } else if (orderFilter.value === 'archived') {
        result = archivedOrders.value;
      } else {
        result = orders.value.filter(o => o.status === orderFilter.value);
      }
      
      // Then apply search filter
      if (debouncedOrderSearch.value) {
        const query = debouncedOrderSearch.value.toLowerCase();
        result = result.filter(o => {
          // Search order name
          if (o.order_name && o.order_name.toLowerCase().includes(query)) {
            return true;
          }
          // Search within line items
          if (o.lineItems && o.lineItems.some(item =>
            (item.product_title && item.product_title.toLowerCase().includes(query)) ||
            (item.variant_title && item.variant_title.toLowerCase().includes(query)) ||
            (item.sku && item.sku.toLowerCase().includes(query))
          )) {
            return true;
          }
          return false;
        });
      }
      
      return result;
    });

    const summary = computed(() => ({
      total: tasks.value.length,
      active: tasks.value.filter(t => t.status === 'pending' || t.status === 'in_progress').length,
      completed: tasks.value.filter(t => t.status === 'completed').length
    }));

    const orderSummary = computed(() => ({
      total: orders.value.length,
      active: orders.value.filter(o => o.status === 'pending' || o.status === 'in_progress').length,
      fulfilled: orders.value.filter(o => o.status === 'fulfilled').length,
      archived: archivedOrders.value.length
    }));

    // Computed: Filtered inventory
    const filteredInventory = computed(() => {
      let result = inventory.value;
      
      // Apply out-of-stock filter
      if (inventoryFilter.value === 'out-of-stock') {
        result = result.filter(item => item.inventory_quantity <= 0);
      }
      
      // Apply no-image filter
      if (inventoryFilter.value === 'no-image') {
        result = result.filter(item => !item.image_url);
      }
      
      // Apply search filter
      if (debouncedInventorySearch.value) {
        const query = debouncedInventorySearch.value.toLowerCase();
        result = result.filter(item =>
          (item.product_title && item.product_title.toLowerCase().includes(query)) ||
          (item.variant_title && item.variant_title.toLowerCase().includes(query)) ||
          (item.sku && item.sku.toLowerCase().includes(query))
        );
      }
      
      return result;
    });

    // Computed: Count of inventory items without images
    const inventoryNoImageCount = computed(() => {
      return inventory.value.filter(item => !item.image_url).length;
    });

    // Save OAuth credentials
    async function saveCredentials() {
      if (!clientIdInput.value || !clientSecretInput.value) {
        error.value = 'Please enter both Client ID and Client Secret';
        return;
      }

      savingCredentials.value = true;
      error.value = null;

      try {
        const result = await window.api.saveCredentials(
          clientIdInput.value, 
          clientSecretInput.value
        );
        
        if (result.success) {
          successMessage.value = 'Credentials saved! You can now connect to your store.';
          needsSetup.value = false;
          setupStep.value = 1; // Reset for next time
          clientIdInput.value = '';
          clientSecretInput.value = '';
          
          setTimeout(() => {
            successMessage.value = null;
          }, 5000);
        } else {
          error.value = result.error || 'Failed to save credentials';
        }
      } catch (e) {
        error.value = e.message || 'Failed to save credentials';
        console.error('Save credentials error:', e);
      } finally {
        savingCredentials.value = false;
      }
    }

    // Copy text to clipboard
    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        toastMessage.value = '✓ Copied to clipboard!';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
      } catch (e) {
        console.error('Failed to copy:', e);
        toastMessage.value = '✗ Failed to copy';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
      }
    }

    // Check authentication status
    async function checkAuth() {
      try {
        const result = await window.api.checkAuth();
        if (result.success) {
          isAuthenticated.value = result.data.isAuthenticated;
          needsSetup.value = result.data.needsSetup;
          storeUrl.value = result.data.storeUrl || '';
          
          if (isAuthenticated.value) {
            await loadAll();
            await loadAutoSyncSettings();
            startLastSyncAgoTimer();
          }
        }
      } catch (e) {
        console.error('Auth check error:', e);
      } finally {
        appReady.value = true;
      }
    }

    // Start OAuth flow
    async function connectToShopify() {
      if (!storeUrlInput.value) {
        error.value = 'Please enter your store URL';
        return;
      }

      authLoading.value = true;
      error.value = null;

      try {
        const result = await window.api.startOAuth(storeUrlInput.value);
        
        if (result.success) {
          successMessage.value = result.data.message;
          isAuthenticated.value = true;
          storeUrl.value = result.data.storeUrl;
          await loadAll();
          
          setTimeout(() => {
            successMessage.value = null;
          }, 5000);
        } else {
          error.value = result.error || 'Authentication failed';
        }
      } catch (e) {
        error.value = e.message || 'Failed to connect to Shopify';
        console.error('OAuth error:', e);
      } finally {
        authLoading.value = false;
      }
    }

    // Logout
    async function logout() {
      if (!confirm('Are you sure you want to disconnect from Shopify?')) {
        return;
      }

      try {
        await window.api.logout();
        isAuthenticated.value = false;
        storeUrl.value = '';
        tasks.value = [];
        orders.value = [];
        successMessage.value = 'Disconnected from Shopify';
        
        setTimeout(() => {
          successMessage.value = null;
        }, 3000);
      } catch (e) {
        error.value = e.message || 'Failed to logout';
      }
    }

    // Methods
    async function loadTasks() {
      loading.value = true;
      error.value = null;
      
      try {
        const result = await window.api.getTasks();
        
        if (result.success) {
          // Add customQty property for each task
          tasks.value = result.data.map(task => ({
            ...task,
            customQty: null
          }));
        } else {
          error.value = result.error || 'Failed to load tasks';
        }
      } catch (e) {
        error.value = e.message || 'Failed to load tasks';
        console.error('Load tasks error:', e);
      } finally {
        loading.value = false;
      }
    }

    async function loadOrders() {
      try {
        const result = await window.api.getOrders();
        
        if (result.success) {
          orders.value = result.data;
        } else {
          console.error('Failed to load orders:', result.error);
        }
      } catch (e) {
        console.error('Load orders error:', e);
      }
    }

    async function loadArchivedOrders() {
      try {
        const result = await window.api.getArchivedOrders();
        
        if (result.success) {
          archivedOrders.value = result.data;
        } else {
          console.error('Failed to load archived orders:', result.error);
        }
      } catch (e) {
        console.error('Load archived orders error:', e);
      }
    }

    async function loadAll() {
      await Promise.all([loadTasks(), loadOrders(), loadArchivedOrders(), loadInventory()]);
    }

    // Auto-sync functions
    async function loadAutoSyncSettings() {
      try {
        const result = await window.api.getAutoSyncSettings();
        if (result.success) {
          autoSyncEnabled.value = result.data.enabled;
          autoSyncInterval.value = result.data.intervalMinutes;
          if (autoSyncEnabled.value) {
            startAutoSync();
          }
        }
      } catch (e) {
        console.error('Failed to load auto-sync settings:', e);
      }
    }

    function startAutoSync() {
      stopAutoSync();
      if (autoSyncEnabled.value && autoSyncInterval.value >= 1) {
        const intervalMs = autoSyncInterval.value * 60 * 1000;
        autoSyncTimer = setInterval(() => {
          backgroundSync();
        }, intervalMs);
        console.log(`Auto-sync started: every ${autoSyncInterval.value} minute(s)`);
      }
    }

    function stopAutoSync() {
      if (autoSyncTimer) {
        clearInterval(autoSyncTimer);
        autoSyncTimer = null;
      }
    }

    async function toggleAutoSync() {
      try {
        const result = await window.api.saveAutoSyncSettings(
          autoSyncEnabled.value, 
          autoSyncInterval.value
        );
        if (result.success) {
          if (autoSyncEnabled.value) {
            startAutoSync();
            showToast('Auto-sync enabled');
          } else {
            stopAutoSync();
            showToast('Auto-sync disabled');
          }
        }
      } catch (e) {
        console.error('Failed to save auto-sync settings:', e);
      }
    }

    async function updateAutoSyncInterval() {
      // Validate interval
      if (!autoSyncInterval.value || autoSyncInterval.value < 1) {
        autoSyncInterval.value = 1;
      }
      autoSyncInterval.value = Math.floor(autoSyncInterval.value);
      
      try {
        const result = await window.api.saveAutoSyncSettings(
          autoSyncEnabled.value, 
          autoSyncInterval.value
        );
        if (result.success && autoSyncEnabled.value) {
          startAutoSync(); // Restart with new interval
          showToast(`Sync interval: ${autoSyncInterval.value} min`);
        }
      } catch (e) {
        console.error('Failed to update auto-sync interval:', e);
      }
    }

    async function backgroundSync() {
      if (loading.value) return; // Skip if already syncing
      
      const previousOrderCount = orders.value.length;
      
      try {
        const result = await window.api.syncFromShopify();
        
        if (result.success) {
          await loadAll();
          updateLastSyncTime();
          
          // Check for new orders
          const newOrderCount = orders.value.length - previousOrderCount;
          if (newOrderCount > 0) {
            showToast(`🔄 ${newOrderCount} new order${newOrderCount > 1 ? 's' : ''} synced`);
          }
        }
      } catch (e) {
        console.error('Background sync error:', e);
      }
    }

    function updateLastSyncTime() {
      lastSyncTime.value = new Date().toLocaleTimeString();
      updateLastSyncAgo();
    }

    function updateLastSyncAgo() {
      if (!lastSyncTime.value) {
        lastSyncAgo.value = '';
        return;
      }
      
      // Just show the time for simplicity
      lastSyncAgo.value = `Synced ${lastSyncTime.value}`;
    }

    function startLastSyncAgoTimer() {
      // Update "ago" text every minute
      lastSyncAgoTimer = setInterval(updateLastSyncAgo, 60000);
    }

    function showToast(message) {
      toastMessage.value = message;
      setTimeout(() => {
        toastMessage.value = null;
      }, 3000);
    }

    // Search debounce functions
    function onTaskSearchInput() {
      if (taskSearchTimeout) clearTimeout(taskSearchTimeout);
      taskSearchTimeout = setTimeout(() => {
        debouncedTaskSearch.value = taskSearchQuery.value;
      }, 250);
    }

    function onOrderSearchInput() {
      if (orderSearchTimeout) clearTimeout(orderSearchTimeout);
      orderSearchTimeout = setTimeout(() => {
        debouncedOrderSearch.value = orderSearchQuery.value;
      }, 250);
    }

    function onInventorySearchInput() {
      if (inventorySearchTimeout) clearTimeout(inventorySearchTimeout);
      inventorySearchTimeout = setTimeout(() => {
        debouncedInventorySearch.value = inventorySearchQuery.value;
      }, 250);
    }

    async function loadInventory() {
      try {
        const result = await window.api.getInventory({
          outOfStockOnly: false,
          search: ''
        });
        
        if (result.success) {
          inventory.value = result.data.inventory;
          inventoryStats.value = result.data.stats;
        }
      } catch (e) {
        console.error('Error loading inventory:', e);
      }
    }


    async function syncFromShopify() {
      loading.value = true;
      error.value = null;
      successMessage.value = null;
      
      try {
        const result = await window.api.syncFromShopify();
        
        if (result.success) {
          successMessage.value = result.data.message || 'Sync completed successfully';
          await loadAll();
          updateLastSyncTime();
          
          // Auto-hide success message after 5 seconds
          setTimeout(() => {
            successMessage.value = null;
          }, 5000);
        } else {
          error.value = result.error || 'Sync failed';
        }
      } catch (e) {
        error.value = e.message || 'Failed to sync from Shopify';
        console.error('Sync error:', e);
      } finally {
        loading.value = false;
      }
    }

    async function markMade(variantId, quantity) {
      error.value = null;
      
      try {
        const result = await window.api.markMade(variantId, quantity);
        
        if (result.success) {
          await loadAll();
          
          // Check for newly fulfilled orders
          if (result.newlyFulfilledOrders && result.newlyFulfilledOrders.length > 0) {
            showFulfilledOrderToast(result.newlyFulfilledOrders);
          }
        } else {
          error.value = result.error || 'Failed to mark quantity';
        }
      } catch (e) {
        error.value = e.message || 'Failed to mark quantity';
        console.error('Mark made error:', e);
      }
    }

    async function markMadeCustom(task) {
      if (!task.customQty || task.customQty < 1) {
        return;
      }
      
      await markMade(task.variant_id, task.customQty);
      
      // Reset custom quantity input
      task.customQty = null;
    }

    async function markComplete(variantId) {
      error.value = null;
      
      try {
        const result = await window.api.markComplete(variantId);
        
        if (result.success) {
          await loadAll();
          
          // Check for newly fulfilled orders
          if (result.newlyFulfilledOrders && result.newlyFulfilledOrders.length > 0) {
            showFulfilledOrderToast(result.newlyFulfilledOrders);
          }
        } else {
          error.value = result.error || 'Failed to mark complete';
        }
      } catch (e) {
        error.value = e.message || 'Failed to mark complete';
        console.error('Mark complete error:', e);
      }
    }

    async function resetTask(variantId) {
      if (!confirm('Are you sure you want to reset this task? All progress will be lost.')) {
        return;
      }
      
      error.value = null;
      
      try {
        const result = await window.api.resetTask(variantId);
        
        if (result.success) {
          await loadAll();
        } else {
          error.value = result.error || 'Failed to reset task';
        }
      } catch (e) {
        error.value = e.message || 'Failed to reset task';
        console.error('Reset task error:', e);
      }
    }

    function progressPercentage(task) {
      if (task.total_quantity === 0) return 0;
      return Math.round((task.made_quantity / task.total_quantity) * 100);
    }

    function orderProgressPercentage(order) {
      if (order.total_items === 0) return 0;
      return Math.round((order.fulfilled_items / order.total_items) * 100);
    }

    function formatStatus(status) {
      const statusMap = {
        'pending': 'Pending',
        'in_progress': 'In Progress',
        'completed': 'Completed',
        'fulfilled': 'Fulfilled',
        'archived': 'Archived'
      };
      return statusMap[status] || status;
    }

    function formatOrderDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function showFulfilledOrderToast(orders) {
      // Support both single order and array of orders
      const orderArray = Array.isArray(orders) ? orders : [orders];
      
      fulfilledOrderToast.value = {
        orders: orderArray.map(order => ({
          orderName: order.order_name,
          orderId: order.order_id,
          shopifyAdminUrl: order.shopifyAdminUrl
        }))
      };
    }

    function dismissFulfilledOrderToast() {
      fulfilledOrderToast.value = null;
    }

    function openShopifyOrder(url) {
      // Open in OS default browser
      window.api.openExternal(url);
    }

    function copyOrderLink(url) {
      if (url) {
        navigator.clipboard.writeText(url);
        toastMessage.value = '✓ Link copied to clipboard!';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
      }
    }

    // Build Shopify admin URL for a product variant
    function getInventoryAdminUrl(item) {
      if (!storeUrl.value || !item.product_id || !item.variant_id) return null;
      
      // Extract numeric IDs from GIDs
      const productMatch = item.product_id.match(/Product\/(\d+)/);
      const variantMatch = item.variant_id.match(/ProductVariant\/(\d+)/);
      
      if (!productMatch || !variantMatch) return null;
      
      const productId = productMatch[1];
      const variantId = variantMatch[1];
      
      return `https://${storeUrl.value}/admin/products/${productId}/variants/${variantId}`;
    }

    function copyInventoryLink(item) {
      const url = getInventoryAdminUrl(item);
      if (url) {
        navigator.clipboard.writeText(url);
        toastMessage.value = '✓ Link copied to clipboard!';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
      } else {
        toastMessage.value = '⚠️ Could not generate link';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
      }
    }

    function openInventoryLink(item) {
      const url = getInventoryAdminUrl(item);
      if (url) {
        window.api.openExternal(url);
      }
    }

    async function archiveOrder(orderId) {
      error.value = null;
      
      try {
        const result = await window.api.archiveOrder(orderId);
        
        if (result.success) {
          toastMessage.value = '✓ Order archived';
          await loadAll();
          
          setTimeout(() => {
            toastMessage.value = null;
          }, 2000);
        } else {
          error.value = result.error || 'Failed to archive order';
        }
      } catch (e) {
        error.value = e.message || 'Failed to archive order';
        console.error('Archive order error:', e);
      }
    }

    async function archiveOrderFromToast() {
      if (fulfilledOrderToast.value && fulfilledOrderToast.value.orders) {
        // Archive all orders in the toast
        for (const order of fulfilledOrderToast.value.orders) {
          await archiveOrder(order.orderId);
        }
        fulfilledOrderToast.value = null;
      }
    }

    async function archiveAllFulfilled() {
      const fulfilledCount = orders.value.filter(o => o.status === 'fulfilled').length;
      
      if (fulfilledCount === 0) {
        toastMessage.value = 'No fulfilled orders to archive';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
        return;
      }
      
      if (!confirm(`Are you sure you want to archive ${fulfilledCount} fulfilled order(s)? This will remove them from active tracking.`)) {
        return;
      }
      
      error.value = null;
      
      try {
        const result = await window.api.archiveAllFulfilled();
        
        if (result.success) {
          toastMessage.value = result.data.message;
          await loadAll();
          
          setTimeout(() => {
            toastMessage.value = null;
          }, 3000);
        } else {
          error.value = result.error || 'Failed to archive orders';
        }
      } catch (e) {
        error.value = e.message || 'Failed to archive orders';
        console.error('Archive all fulfilled error:', e);
      }
    }

    async function unarchiveOrder(orderId) {
      error.value = null;
      
      try {
        const result = await window.api.unarchiveOrder(orderId);
        
        if (result.success) {
          toastMessage.value = '✓ Order restored';
          await loadAll();
          
          setTimeout(() => {
            toastMessage.value = null;
          }, 2000);
        } else {
          error.value = result.error || 'Failed to restore order';
        }
      } catch (e) {
        error.value = e.message || 'Failed to restore order';
        console.error('Unarchive order error:', e);
      }
    }

    async function unarchiveAllOrders() {
      const archivedCount = archivedOrders.value.length;
      
      if (archivedCount === 0) {
        toastMessage.value = 'No archived orders to restore';
        setTimeout(() => {
          toastMessage.value = null;
        }, 2000);
        return;
      }
      
      if (!confirm(`Are you sure you want to restore ${archivedCount} archived order(s)? This will add them back to active tracking.`)) {
        return;
      }
      
      error.value = null;
      
      try {
        const result = await window.api.unarchiveAll();
        
        if (result.success) {
          toastMessage.value = result.data.message;
          await loadAll();
          
          setTimeout(() => {
            toastMessage.value = null;
          }, 3000);
        } else {
          error.value = result.error || 'Failed to restore orders';
        }
      } catch (e) {
        error.value = e.message || 'Failed to restore orders';
        console.error('Unarchive all error:', e);
      }
    }

    // Lifecycle
    onMounted(() => {
      checkAuth();
    });

    onUnmounted(() => {
      stopAutoSync();
      if (lastSyncAgoTimer) clearInterval(lastSyncAgoTimer);
      if (taskSearchTimeout) clearTimeout(taskSearchTimeout);
      if (orderSearchTimeout) clearTimeout(orderSearchTimeout);
      if (inventorySearchTimeout) clearTimeout(inventorySearchTimeout);
    });

    return {
      // App state
      appReady,
      // Auth
      isAuthenticated,
      needsSetup,
      storeUrl,
      storeUrlInput,
      authLoading,
      checkAuth,
      connectToShopify,
      logout,
      // Credentials setup
      setupStep,
      clientIdInput,
      clientSecretInput,
      savingCredentials,
      saveCredentials,
      copyToClipboard,
      // Tasks
      tasks,
      loading,
      error,
      successMessage,
      toastMessage,
      fulfilledOrderToast,
      dismissFulfilledOrderToast,
      openShopifyOrder,
      copyOrderLink,
      archiveOrder,
      archiveOrderFromToast,
      archiveAllFulfilled,
      unarchiveOrder,
      unarchiveAllOrders,
      filter,
      filteredTasks,
      summary,
      loadTasks,
      syncFromShopify,
      markMade,
      markMadeCustom,
      markComplete,
      resetTask,
      progressPercentage,
      formatStatus,
      // Orders
      orders,
      archivedOrders,
      orderFilter,
      filteredOrders,
      orderSummary,
      orderProgressPercentage,
      formatOrderDate,
      viewMode,
      // Auto-sync
      autoSyncEnabled,
      autoSyncInterval,
      lastSyncTime,
      lastSyncAgo,
      toggleAutoSync,
      updateAutoSyncInterval,
      // Search
      taskSearchQuery,
      orderSearchQuery,
      debouncedTaskSearch,
      debouncedOrderSearch,
      onTaskSearchInput,
      onOrderSearchInput,
      // Inventory
      inventory,
      inventoryStats,
      inventoryFilter,
      inventorySearchQuery,
      debouncedInventorySearch,
      filteredInventory,
      inventoryNoImageCount,
      onInventorySearchInput,
      copyInventoryLink,
      openInventoryLink
    };
  }
};

createApp(App).mount('#app');
