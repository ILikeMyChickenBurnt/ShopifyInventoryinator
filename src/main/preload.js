const { contextBridge, ipcRenderer, shell } = require('electron');

// Expose protected methods to renderer process via contextBridge
// This is the ONLY way renderer can communicate with main process (secure)
contextBridge.exposeInMainWorld('api', {
  // System
  openExternal: (url) => shell.openExternal(url),
  
  // Authentication
  checkAuth: () => ipcRenderer.invoke('check-auth'),
  startOAuth: (storeUrl) => ipcRenderer.invoke('start-oauth', storeUrl),
  logout: () => ipcRenderer.invoke('logout'),
  saveCredentials: (clientId, clientSecret) => ipcRenderer.invoke('save-credentials', clientId, clientSecret),
  
  // Fetch current tasks from local database
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  
  // Fetch orders with line items and progress
  getOrders: () => ipcRenderer.invoke('get-orders'),
  
  // Sync tasks from Shopify API (fetch unfulfilled orders)
  syncFromShopify: () => ipcRenderer.invoke('sync-shopify'),
  
  // Mark quantity as made for a specific variant
  markMade: (variantId, quantity) => 
    ipcRenderer.invoke('mark-made', variantId, quantity),
  
  // Reset task progress (set made back to 0)
  resetTask: (variantId) => 
    ipcRenderer.invoke('reset-task', variantId),
  
  // Mark all remaining quantity as complete
  markComplete: (variantId) => 
    ipcRenderer.invoke('mark-complete', variantId),
  
  // Archive a single order
  archiveOrder: (orderId) => 
    ipcRenderer.invoke('archive-order', orderId),
  
  // Archive all fulfilled orders
  archiveAllFulfilled: () => 
    ipcRenderer.invoke('archive-all-fulfilled'),
  
  // Get archived orders
  getArchivedOrders: () => 
    ipcRenderer.invoke('get-archived-orders'),
  
  // Unarchive a single order
  unarchiveOrder: (orderId) => 
    ipcRenderer.invoke('unarchive-order', orderId),
  
  // Unarchive all archived orders
  unarchiveAll: () => 
    ipcRenderer.invoke('unarchive-all'),
  
  // Auto-sync settings
  getAutoSyncSettings: () => 
    ipcRenderer.invoke('get-auto-sync-settings'),
  
  saveAutoSyncSettings: (enabled, intervalMinutes) => 
    ipcRenderer.invoke('save-auto-sync-settings', enabled, intervalMinutes)
});
