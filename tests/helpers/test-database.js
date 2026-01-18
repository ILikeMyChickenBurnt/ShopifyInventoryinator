/**
 * Test Database Helper
 * 
 * Creates an isolated in-memory database for testing.
 * Uses sql.js (pure JavaScript SQLite) to avoid native module version conflicts.
 */

const initSqlJs = require('sql.js');

let db;
let SQL;

/**
 * Helper to convert sql.js results to array of objects
 */
function resultToObjects(result) {
  if (!result || result.length === 0) return [];
  const res = result[0];
  if (!res) return [];
  return res.values.map(row => {
    const obj = {};
    res.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Helper to get a single row as object
 */
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push(row);
  }
  stmt.free();
  return rows[0];
}

/**
 * Helper to get all rows as objects
 */
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push(row);
  }
  stmt.free();
  return rows;
}

/**
 * Initialize an in-memory test database with all required tables
 */
async function initTestDatabase() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  db = new SQL.Database();
  
  // Create tasks table
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT UNIQUE NOT NULL,
      variant_title TEXT NOT NULL,
      product_title TEXT NOT NULL,
      sku TEXT DEFAULT '',
      image_url TEXT,
      total_quantity INTEGER DEFAULT 0,
      made_quantity INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      order_name TEXT NOT NULL,
      order_date DATETIME NOT NULL,
      total_items INTEGER DEFAULT 0,
      fulfilled_items INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'fulfilled', 'archived')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create order_line_items table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_item_id TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      product_title TEXT NOT NULL,
      variant_title TEXT DEFAULT '',
      sku TEXT DEFAULT '',
      image_url TEXT,
      quantity INTEGER DEFAULT 0,
      fulfilled_quantity INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(order_id)
    )
  `);

  // Create sync_history table
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      orders_fetched INTEGER DEFAULT 0,
      variants_updated INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_message TEXT
    )
  `);

  // Create inventory table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL,
      product_title TEXT NOT NULL,
      variant_title TEXT NOT NULL,
      sku TEXT DEFAULT '',
      image_url TEXT DEFAULT NULL,
      inventory_quantity INTEGER NOT NULL DEFAULT 0,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}

/**
 * Close and cleanup the test database
 */
function closeTestDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the raw database instance for direct queries in tests
 */
function getTestDb() {
  return {
    prepare: (sql) => ({
      run: (...params) => db.run(sql, params),
      get: (...params) => getOne(sql, params),
      all: (...params) => getAll(sql, params)
    }),
    exec: (sql) => db.run(sql),
    run: (sql, params) => db.run(sql, params)
  };
}

/**
 * Reset all tables (clear data but keep structure)
 */
function resetTestDatabase() {
  db.run('DELETE FROM order_line_items');
  db.run('DELETE FROM orders');
  db.run('DELETE FROM tasks');
  db.run('DELETE FROM sync_history');
  db.run('DELETE FROM inventory');
}

// ============================================
// Database operations (mirrored from database.js)
// ============================================

function upsertTask(task) {
  const variantId = task.variantId;
  const variantTitle = task.variantTitle || '';
  const productTitle = task.productTitle || '';
  const sku = task.sku || '';
  const imageUrl = task.imageUrl || null;
  const totalQuantity = task.totalQuantity || 0;
  const madeQuantity = task.madeQuantity || 0;
  const status = task.status || 'pending';
  
  db.run(`
    INSERT INTO tasks (variant_id, variant_title, product_title, sku, image_url, total_quantity, made_quantity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(variant_id) DO UPDATE SET
      variant_title = excluded.variant_title,
      product_title = excluded.product_title,
      sku = excluded.sku,
      image_url = excluded.image_url,
      total_quantity = excluded.total_quantity,
      updated_at = CURRENT_TIMESTAMP
  `, [variantId, variantTitle, productTitle, sku, imageUrl, totalQuantity, madeQuantity, status]);
}

function getTaskByVariantId(variantId) {
  return getOne('SELECT * FROM tasks WHERE variant_id = ?', [variantId]);
}

function getAllTasks() {
  return getAll('SELECT * FROM tasks ORDER BY status ASC, product_title ASC');
}

function updateMadeQuantity(variantId, quantityToAdd) {
  const task = getTaskByVariantId(variantId);
  if (!task) {
    throw new Error(`Task not found for variant: ${variantId}`);
  }
  
  const newMade = Math.min(task.made_quantity + quantityToAdd, task.total_quantity);
  const actualAdded = newMade - task.made_quantity;
  
  const newStatus = newMade >= task.total_quantity ? 'completed' 
    : newMade > 0 ? 'in_progress' 
    : 'pending';
  
  db.run(`
    UPDATE tasks 
    SET made_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE variant_id = ?
  `, [newMade, newStatus, variantId]);
  
  return { 
    previousMade: task.made_quantity,
    newMade,
    actualAdded,
    newStatus
  };
}

function resetTask(variantId) {
  db.run(`
    UPDATE tasks 
    SET made_quantity = 0, status = 'pending', updated_at = CURRENT_TIMESTAMP 
    WHERE variant_id = ?
  `, [variantId]);
  
  return true;
}

function upsertOrder(order) {
  const orderId = order.orderId;
  const orderName = order.orderName;
  const orderDate = order.orderDate;
  const totalItems = order.totalItems || 0;
  const fulfilledItems = order.fulfilledItems || 0;
  const status = order.status || 'pending';
  
  db.run(`
    INSERT INTO orders (order_id, order_name, order_date, total_items, fulfilled_items, status)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      order_name = excluded.order_name,
      order_date = excluded.order_date,
      total_items = excluded.total_items,
      updated_at = CURRENT_TIMESTAMP
  `, [orderId, orderName, orderDate, totalItems, fulfilledItems, status]);
}

function upsertOrderLineItem(lineItem) {
  const lineItemId = lineItem.lineItemId;
  const orderId = lineItem.orderId;
  const variantId = lineItem.variantId;
  const productTitle = lineItem.productTitle || '';
  const variantTitle = lineItem.variantTitle || '';
  const sku = lineItem.sku || '';
  const imageUrl = lineItem.imageUrl || null;
  const quantity = lineItem.quantity || 0;
  const fulfilledQuantity = lineItem.fulfilledQuantity || 0;
  
  db.run(`
    INSERT INTO order_line_items (line_item_id, order_id, variant_id, product_title, variant_title, sku, image_url, quantity, fulfilled_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(line_item_id) DO UPDATE SET
      quantity = excluded.quantity
  `, [lineItemId, orderId, variantId, productTitle, variantTitle, sku, imageUrl, quantity, fulfilledQuantity]);
}

function getOrderByOrderId(orderId) {
  return getOne('SELECT * FROM orders WHERE order_id = ?', [orderId]);
}

// Alias for backwards compatibility with tests
function getOrderById(orderId) {
  return getOrderByOrderId(orderId);
}

function getAllOrders() {
  return getAll("SELECT * FROM orders WHERE status != 'archived' ORDER BY order_date ASC");
}

function getArchivedOrders() {
  return getAll("SELECT * FROM orders WHERE status = 'archived' ORDER BY order_date ASC");
}

function getOrderLineItems(orderId) {
  return getAll('SELECT * FROM order_line_items WHERE order_id = ?', [orderId]);
}

// Alias for backwards compatibility with tests
function getLineItemsByOrderId(orderId) {
  return getOrderLineItems(orderId);
}

function archiveOrder(orderId) {
  const order = getOrderByOrderId(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }
  
  if (order.status === 'archived') {
    return { alreadyArchived: true };
  }
  
  // Get line items to deallocate
  const lineItems = getOrderLineItems(orderId);
  
  // Deallocate quantities from tasks
  for (const item of lineItems) {
    const task = getTaskByVariantId(item.variant_id);
    if (task) {
      // Subtract fulfilled quantity from made
      const newMade = Math.max(0, task.made_quantity - item.fulfilled_quantity);
      // Subtract total quantity from task total
      const newTotal = Math.max(0, task.total_quantity - item.quantity);
      
      if (newTotal === 0) {
        // Delete task if no quantity left
        db.run('DELETE FROM tasks WHERE variant_id = ?', [item.variant_id]);
      } else {
        const newStatus = newMade >= newTotal ? 'completed' 
          : newMade > 0 ? 'in_progress' 
          : 'pending';
        db.run(`
          UPDATE tasks 
          SET made_quantity = ?, total_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE variant_id = ?
        `, [newMade, newTotal, newStatus, item.variant_id]);
      }
    }
  }
  
  // Set order status to archived
  db.run(`
    UPDATE orders 
    SET status = 'archived', updated_at = CURRENT_TIMESTAMP 
    WHERE order_id = ?
  `, [orderId]);
  
  return { archived: true };
}

function unarchiveOrder(orderId) {
  const order = getOrderByOrderId(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }
  
  if (order.status !== 'archived') {
    return { notArchived: true };
  }
  
  // Get line items to reallocate
  const lineItems = getOrderLineItems(orderId);
  
  // Reallocate quantities to tasks
  for (const item of lineItems) {
    const task = getTaskByVariantId(item.variant_id);
    if (task) {
      // Add back quantities
      const newTotal = task.total_quantity + item.quantity;
      const newMade = task.made_quantity + item.fulfilled_quantity;
      const newStatus = newMade >= newTotal ? 'completed' 
        : newMade > 0 ? 'in_progress' 
        : 'pending';
      db.run(`
        UPDATE tasks 
        SET made_quantity = ?, total_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE variant_id = ?
      `, [newMade, newTotal, newStatus, item.variant_id]);
    } else {
      // Task was deleted, recreate it
      upsertTask({
        variantId: item.variant_id,
        variantTitle: item.variant_title,
        productTitle: item.product_title,
        sku: item.sku,
        imageUrl: item.image_url,
        totalQuantity: item.quantity,
        madeQuantity: item.fulfilled_quantity,
        status: item.fulfilled_quantity >= item.quantity ? 'completed' 
          : item.fulfilled_quantity > 0 ? 'in_progress' 
          : 'pending'
      });
    }
  }
  
  // Determine new status based on fulfillment
  const newStatus = order.fulfilled_items >= order.total_items ? 'fulfilled'
    : order.fulfilled_items > 0 ? 'in_progress'
    : 'pending';
  
  db.run(`
    UPDATE orders 
    SET status = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE order_id = ?
  `, [newStatus, orderId]);
  
  return { unarchived: true, newStatus };
}

function resetOrderProgress(orderId) {
  const order = getOrderByOrderId(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }
  
  const lineItems = getOrderLineItems(orderId);
  
  // Subtract fulfilled quantities from tasks
  for (const item of lineItems) {
    const task = getTaskByVariantId(item.variant_id);
    if (task && item.fulfilled_quantity > 0) {
      const newMade = Math.max(0, task.made_quantity - item.fulfilled_quantity);
      const newStatus = newMade >= task.total_quantity ? 'completed'
        : newMade > 0 ? 'in_progress'
        : 'pending';
      
      db.run(`
        UPDATE tasks 
        SET made_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE variant_id = ?
      `, [newMade, newStatus, item.variant_id]);
    }
    
    // Reset line item fulfilled quantity
    db.run(`
      UPDATE order_line_items 
      SET fulfilled_quantity = 0 
      WHERE line_item_id = ?
    `, [item.line_item_id]);
  }
  
  // Reset order fulfilled items and status
  db.run(`
    UPDATE orders 
    SET fulfilled_items = 0, status = 'pending', updated_at = CURRENT_TIMESTAMP 
    WHERE order_id = ?
  `, [orderId]);
  
  return { reset: true };
}

function clearOrdersWithoutProgress() {
  // Get order IDs that have progress (should not be cleared)
  const ordersWithProgress = getAll(`
    SELECT order_id FROM orders 
    WHERE status != 'archived' AND fulfilled_items > 0
  `);
  const progressOrderIds = new Set(ordersWithProgress.map(o => o.order_id));
  
  // Delete line items for orders without progress
  db.run(`
    DELETE FROM order_line_items 
    WHERE order_id IN (
      SELECT order_id FROM orders 
      WHERE status != 'archived' AND fulfilled_items = 0
    )
  `);
  
  // Delete orders without progress
  db.run(`
    DELETE FROM orders 
    WHERE status != 'archived' AND fulfilled_items = 0
  `);
  
  return progressOrderIds;
}

function getOrderIdsToSkipDuringSync() {
  const rows = getAll(`
    SELECT order_id FROM orders 
    WHERE status = 'archived' OR fulfilled_items > 0
  `);
  return new Set(rows.map(r => r.order_id));
}

function allocateMadeQuantityToOrders(variantId, quantityToAllocate) {
  // Get all non-archived line items for this variant, ordered by order date (FIFO)
  const lineItems = getAll(`
    SELECT li.*, o.order_date, o.order_id as parent_order_id
    FROM order_line_items li
    JOIN orders o ON li.order_id = o.order_id
    WHERE li.variant_id = ? AND o.status != 'archived'
    ORDER BY o.order_date ASC
  `, [variantId]);
  
  let remainingToAllocate = quantityToAllocate;
  const fulfilledOrders = [];
  
  for (const item of lineItems) {
    if (remainingToAllocate <= 0) break;
    
    const canFulfill = item.quantity - item.fulfilled_quantity;
    if (canFulfill <= 0) continue;
    
    const toFulfill = Math.min(canFulfill, remainingToAllocate);
    const newFulfilled = item.fulfilled_quantity + toFulfill;
    
    // Update line item
    db.run(`
      UPDATE order_line_items 
      SET fulfilled_quantity = ? 
      WHERE line_item_id = ?
    `, [newFulfilled, item.line_item_id]);
    
    // Update order fulfilled_items
    const order = getOrderByOrderId(item.order_id);
    const newOrderFulfilled = order.fulfilled_items + toFulfill;
    const newOrderStatus = newOrderFulfilled >= order.total_items ? 'fulfilled'
      : newOrderFulfilled > 0 ? 'in_progress'
      : 'pending';
    
    db.run(`
      UPDATE orders 
      SET fulfilled_items = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE order_id = ?
    `, [newOrderFulfilled, newOrderStatus, item.order_id]);
    
    if (newOrderStatus === 'fulfilled' && order.status !== 'fulfilled') {
      fulfilledOrders.push({
        orderId: order.order_id,
        orderName: order.order_name
      });
    }
    
    remainingToAllocate -= toFulfill;
  }
  
  return fulfilledOrders;
}

function resetVariantInOrders(variantId) {
  // Get all non-archived line items for this variant
  const lineItems = getAll(`
    SELECT li.*, o.order_id as parent_order_id
    FROM order_line_items li
    JOIN orders o ON li.order_id = o.order_id
    WHERE li.variant_id = ? AND o.status != 'archived'
  `, [variantId]);
  
  for (const item of lineItems) {
    if (item.fulfilled_quantity > 0) {
      // Reset line item
      db.run(`
        UPDATE order_line_items 
        SET fulfilled_quantity = 0 
        WHERE line_item_id = ?
      `, [item.line_item_id]);
      
      // Update order
      const order = getOrderByOrderId(item.order_id);
      const newFulfilled = Math.max(0, order.fulfilled_items - item.fulfilled_quantity);
      const newStatus = newFulfilled >= order.total_items ? 'fulfilled'
        : newFulfilled > 0 ? 'in_progress'
        : 'pending';
      
      db.run(`
        UPDATE orders 
        SET fulfilled_items = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE order_id = ?
      `, [newFulfilled, newStatus, item.order_id]);
    }
  }
}

function recalculateTaskTotalsFromOrders() {
  // Get all non-archived line items grouped by variant
  const variantTotals = getAll(`
    SELECT 
      li.variant_id,
      SUM(li.quantity) as total_quantity,
      SUM(li.fulfilled_quantity) as made_quantity
    FROM order_line_items li
    JOIN orders o ON li.order_id = o.order_id
    WHERE o.status != 'archived'
    GROUP BY li.variant_id
  `);
  
  for (const vt of variantTotals) {
    const newStatus = vt.made_quantity >= vt.total_quantity ? 'completed'
      : vt.made_quantity > 0 ? 'in_progress'
      : 'pending';
    
    db.run(`
      UPDATE tasks 
      SET total_quantity = ?, made_quantity = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE variant_id = ?
    `, [vt.total_quantity, vt.made_quantity, newStatus, vt.variant_id]);
  }
}

function updateAllOrderStatuses() {
  // Get all non-archived orders
  const orders = getAllOrders();
  
  for (const order of orders) {
    const newStatus = order.fulfilled_items >= order.total_items ? 'fulfilled'
      : order.fulfilled_items > 0 ? 'in_progress'
      : 'pending';
    
    if (newStatus !== order.status) {
      db.run(`
        UPDATE orders 
        SET status = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE order_id = ?
      `, [newStatus, order.order_id]);
    }
  }
}

// ============================================
// INVENTORY FUNCTIONS
// ============================================

/**
 * Upsert inventory data for a variant
 */
function upsertInventory(data) {
  db.run(`
    INSERT INTO inventory (variant_id, product_id, product_title, variant_title, sku, image_url, inventory_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(variant_id) DO UPDATE SET
      product_id = excluded.product_id,
      product_title = excluded.product_title,
      variant_title = excluded.variant_title,
      sku = excluded.sku,
      image_url = excluded.image_url,
      inventory_quantity = excluded.inventory_quantity,
      updated_at = CURRENT_TIMESTAMP
  `, [
    data.variantId,
    data.productId,
    data.productTitle,
    data.variantTitle,
    data.sku || '',
    data.imageUrl || null,
    data.inventoryQuantity || 0
  ]);
}

/**
 * Bulk upsert inventory data
 */
function bulkUpsertInventory(inventoryItems) {
  for (const item of inventoryItems) {
    upsertInventory(item);
  }
}

/**
 * Get all inventory data
 */
function getAllInventory(options = {}) {
  const { outOfStockOnly = false, search = '' } = options;
  
  let query = `
    SELECT *,
      CASE WHEN inventory_quantity <= 0 THEN 1 ELSE 0 END as is_out_of_stock
    FROM inventory
    WHERE 1=1
  `;
  
  if (outOfStockOnly) {
    query += ` AND inventory_quantity <= 0`;
  }
  
  if (search) {
    query += ` AND (product_title LIKE '%${search}%' OR variant_title LIKE '%${search}%' OR sku LIKE '%${search}%')`;
  }
  
  query += `
    ORDER BY 
      is_out_of_stock DESC,
      product_title ASC,
      variant_title ASC
  `;
  
  return getAll(query);
}

/**
 * Get inventory by variant ID
 */
function getInventoryByVariantId(variantId) {
  return getOne('SELECT * FROM inventory WHERE variant_id = ?', [variantId]);
}

/**
 * Get inventory stats
 */
function getInventoryStats() {
  const result = getOne(`
    SELECT 
      COUNT(*) as total_variants,
      SUM(CASE WHEN inventory_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
      SUM(CASE WHEN inventory_quantity > 0 THEN 1 ELSE 0 END) as in_stock_count,
      SUM(inventory_quantity) as total_inventory
    FROM inventory
  `);
  
  return result || {
    total_variants: 0,
    out_of_stock_count: 0,
    in_stock_count: 0,
    total_inventory: 0
  };
}

/**
 * Clear all inventory data
 */
function clearAllInventory() {
  db.run('DELETE FROM inventory');
}

module.exports = {
  initTestDatabase,
  closeTestDatabase,
  getTestDb,
  resetTestDatabase,
  // Task functions
  upsertTask,
  getTaskByVariantId,
  getAllTasks,
  updateMadeQuantity,
  resetTask,
  // Order functions
  upsertOrder,
  upsertOrderLineItem,
  getOrderByOrderId,
  getOrderById,
  getAllOrders,
  getArchivedOrders,
  getOrderLineItems,
  getLineItemsByOrderId,
  archiveOrder,
  unarchiveOrder,
  resetOrderProgress,
  clearOrdersWithoutProgress,
  getOrderIdsToSkipDuringSync,
  allocateMadeQuantityToOrders,
  resetVariantInOrders,
  recalculateTaskTotalsFromOrders,
  updateAllOrderStatuses,
  // Inventory functions
  upsertInventory,
  bulkUpsertInventory,
  getAllInventory,
  getInventoryByVariantId,
  getInventoryStats,
  clearAllInventory
};
