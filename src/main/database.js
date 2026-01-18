const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

let db;
let currentStoreUrl = null;

/**
 * Sanitize store URL to create a safe filename
 */
function sanitizeStoreUrl(storeUrl) {
  if (!storeUrl) return 'default';
  // Remove protocol and replace special chars with underscores
  return storeUrl
    .replace(/^https?:\/\//, '')
    .replace(/\.myshopify\.com$/, '')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .toLowerCase();
}

/**
 * Get the data directory path
 */
function getDataPath() {
  const userDataPath = app.isPackaged 
    ? app.getPath('userData')
    : path.join(__dirname, '../../data');
  
  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  return userDataPath;
}

/**
 * Get the database path for a specific store
 */
function getDatabasePath(storeUrl) {
  const dataPath = getDataPath();
  const storeName = sanitizeStoreUrl(storeUrl);
  return path.join(dataPath, `inventory_${storeName}.db`);
}

/**
 * Initialize database connection and create tables
 */
function initDatabase(storeUrl = null) {
  // If switching stores, close existing connection
  if (db && storeUrl && storeUrl !== currentStoreUrl) {
    console.log(`Switching database from ${currentStoreUrl} to ${storeUrl}`);
    db.close();
    db = null;
  }
  
  // If already connected to this store, skip
  if (db && storeUrl === currentStoreUrl) {
    console.log('Database already initialized for this store');
    return;
  }
  
  currentStoreUrl = storeUrl;
  const dbPath = getDatabasePath(storeUrl);
  console.log('Database path:', dbPath);
  
  db = new Database(dbPath);
  
  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  
  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT UNIQUE NOT NULL,
      variant_title TEXT NOT NULL,
      product_title TEXT NOT NULL,
      sku TEXT DEFAULT '',
      image_url TEXT DEFAULT NULL,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      made_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT CHECK(status IN ('pending', 'in_progress', 'completed')) DEFAULT 'pending',
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create orders table for tracking individual orders
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      order_name TEXT NOT NULL,
      order_date DATETIME NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      fulfilled_items INTEGER NOT NULL DEFAULT 0,
      status TEXT CHECK(status IN ('pending', 'in_progress', 'fulfilled', 'archived')) DEFAULT 'pending',
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Migration: Check if orders table has old CHECK constraint (without 'archived')
  // SQLite doesn't support altering CHECK constraints, so we need to recreate the table
  try {
    // Try to detect if migration is needed by checking table schema
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes('archived')) {
      console.log('Migrating orders table to add archived status...');
      
      // Create new table with updated constraint
      db.exec(`
        CREATE TABLE orders_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT UNIQUE NOT NULL,
          order_name TEXT NOT NULL,
          order_date DATETIME NOT NULL,
          total_items INTEGER NOT NULL DEFAULT 0,
          fulfilled_items INTEGER NOT NULL DEFAULT 0,
          status TEXT CHECK(status IN ('pending', 'in_progress', 'fulfilled', 'archived')) DEFAULT 'pending',
          last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Copy data from old table
      db.exec(`
        INSERT INTO orders_new (id, order_id, order_name, order_date, total_items, fulfilled_items, status, last_synced_at, created_at, updated_at)
        SELECT id, order_id, order_name, order_date, total_items, fulfilled_items, status, last_synced_at, created_at, updated_at
        FROM orders;
      `);
      
      // Drop old table
      db.exec('DROP TABLE orders;');
      
      // Rename new table
      db.exec('ALTER TABLE orders_new RENAME TO orders;');
      
      console.log('Orders table migration completed');
    }
  } catch (e) {
    console.log('Orders table migration check:', e.message);
  }
  
  // Create order_line_items table for tracking items within each order
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      line_item_id TEXT UNIQUE NOT NULL,
      variant_id TEXT NOT NULL,
      variant_title TEXT NOT NULL,
      product_title TEXT NOT NULL,
      sku TEXT DEFAULT '',
      image_url TEXT DEFAULT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      fulfilled_quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
    );
  `);
  
  // Migration: Add new columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN sku TEXT DEFAULT ''`);
  } catch (e) { /* Column might already exist */ }
  
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN image_url TEXT DEFAULT NULL`);
  } catch (e) { /* Column might already exist */ }
  
  // Create computed column for remaining quantity
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      orders_fetched INTEGER,
      variants_updated INTEGER,
      status TEXT,
      error_message TEXT
    );
  `);
  
  // Create inventory table for storing product inventory levels
  db.exec(`
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
    );
  `);
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_variant_id ON tasks(variant_id);
    CREATE INDEX IF NOT EXISTS idx_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_order_id ON orders(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_line_order_id ON order_line_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_line_variant_id ON order_line_items(variant_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON inventory(variant_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(inventory_quantity);
  `);
  
  console.log('Database initialized successfully');
}

/**
 * Get all tasks from database
 */
function getAllTasks() {
  const stmt = db.prepare(`
    SELECT 
      *,
      (total_quantity - made_quantity) as remaining_quantity
    FROM tasks
    ORDER BY 
      CASE status 
        WHEN 'in_progress' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'completed' THEN 3
      END,
      remaining_quantity DESC,
      product_title ASC
  `);
  
  return stmt.all();
}

/**
 * Get a single task by variant ID
 */
function getTaskByVariantId(variantId) {
  const stmt = db.prepare(`
    SELECT 
      *,
      (total_quantity - made_quantity) as remaining_quantity
    FROM tasks 
    WHERE variant_id = ?
  `);
  
  return stmt.get(variantId);
}

/**
 * Insert or update a task from Shopify data
 * If task exists, update total_quantity but preserve made_quantity
 */
function upsertTask(task) {
  const { variantId, variantTitle, productTitle, sku, imageUrl, totalQuantity } = task;
  
  const stmt = db.prepare(`
    INSERT INTO tasks (variant_id, variant_title, product_title, sku, image_url, total_quantity, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(variant_id) DO UPDATE SET
      variant_title = excluded.variant_title,
      product_title = excluded.product_title,
      sku = excluded.sku,
      image_url = excluded.image_url,
      total_quantity = excluded.total_quantity,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const result = stmt.run(variantId, variantTitle, productTitle, sku || '', imageUrl || null, totalQuantity);
  
  // Update status after upsert
  updateTaskStatus(variantId);
  
  return result;
}

/**
 * Update made quantity (increment)
 */
function updateMadeQuantity(variantId, quantity) {
  // Get current task to check limits
  const task = getTaskByVariantId(variantId);
  
  if (!task) {
    throw new Error(`Task not found for variant: ${variantId}`);
  }
  
  const newMade = task.made_quantity + quantity;
  
  // Don't allow exceeding total
  if (newMade > task.total_quantity) {
    throw new Error(`Cannot mark ${quantity} - would exceed total (${task.total_quantity})`);
  }
  
  const stmt = db.prepare(`
    UPDATE tasks 
    SET made_quantity = made_quantity + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  const result = stmt.run(quantity, variantId);
  
  // Update status based on new quantity
  updateTaskStatus(variantId);
  
  return result;
}

/**
 * Mark task as complete (set made = total)
 */
function markTaskComplete(variantId) {
  const stmt = db.prepare(`
    UPDATE tasks 
    SET made_quantity = total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  const result = stmt.run(variantId);
  
  updateTaskStatus(variantId);
  
  return result;
}

/**
 * Reset task progress (set made back to 0)
 */
function resetTask(variantId) {
  const stmt = db.prepare(`
    UPDATE tasks 
    SET made_quantity = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  const result = stmt.run(variantId);
  
  updateTaskStatus(variantId);
  
  return result;
}

/**
 * Update task status based on quantities
 */
function updateTaskStatus(variantId) {
  const stmt = db.prepare(`
    UPDATE tasks
    SET status = CASE
      WHEN made_quantity = 0 THEN 'pending'
      WHEN made_quantity >= total_quantity THEN 'completed'
      ELSE 'in_progress'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  return stmt.run(variantId);
}

/**
 * Clear all tasks (for testing or reset)
 */
function clearAllTasks() {
  const stmt = db.prepare('DELETE FROM tasks');
  return stmt.run();
}

/**
 * Log sync operation to history
 */
function logSync(stats) {
  const { ordersFetched, variantsUpdated, status, errorMessage } = stats;
  
  const stmt = db.prepare(`
    INSERT INTO sync_history (orders_fetched, variants_updated, status, error_message)
    VALUES (?, ?, ?, ?)
  `);
  
  return stmt.run(ordersFetched || 0, variantsUpdated || 0, status, errorMessage || null);
}

/**
 * Get sync history
 */
function getSyncHistory(limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM sync_history
    ORDER BY synced_at DESC
    LIMIT ?
  `);
  
  return stmt.all(limit);
}

/**
 * Get the current store URL for the database
 */
function getCurrentStoreUrl() {
  return currentStoreUrl;
}

/**
 * Check if database is initialized
 */
function isDatabaseReady() {
  return db !== null;
}

// ========== ORDER FUNCTIONS ==========

/**
 * Upsert an order from Shopify data
 */
function upsertOrder(order) {
  const { orderId, orderName, orderDate, totalItems } = order;
  
  const stmt = db.prepare(`
    INSERT INTO orders (order_id, order_name, order_date, total_items, last_synced_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(order_id) DO UPDATE SET
      order_name = excluded.order_name,
      order_date = excluded.order_date,
      total_items = excluded.total_items,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  return stmt.run(orderId, orderName, orderDate, totalItems);
}

/**
 * Upsert an order line item
 */
function upsertOrderLineItem(lineItem) {
  const { orderId, lineItemId, variantId, variantTitle, productTitle, sku, imageUrl, quantity } = lineItem;
  
  const stmt = db.prepare(`
    INSERT INTO order_line_items (order_id, line_item_id, variant_id, variant_title, product_title, sku, image_url, quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(line_item_id) DO UPDATE SET
      quantity = excluded.quantity,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  return stmt.run(orderId, lineItemId, variantId, variantTitle, productTitle, sku || '', imageUrl || null, quantity);
}

/**
 * Get all orders with their progress
 * @param {boolean} includeArchived - Whether to include archived orders
 */
function getAllOrders(includeArchived = false) {
  const whereClause = includeArchived ? '' : "WHERE o.status != 'archived'";
  const stmt = db.prepare(`
    SELECT 
      o.*,
      (o.total_items - o.fulfilled_items) as remaining_items
    FROM orders o
    ${whereClause}
    ORDER BY 
      CASE o.status 
        WHEN 'in_progress' THEN 1
        WHEN 'pending' THEN 2
        WHEN 'fulfilled' THEN 3
        WHEN 'archived' THEN 4
      END,
      o.order_date ASC
  `);
  
  return stmt.all();
}

/**
 * Get only archived orders
 */
function getArchivedOrders() {
  const stmt = db.prepare(`
    SELECT 
      o.*,
      (o.total_items - o.fulfilled_items) as remaining_items
    FROM orders o
    WHERE o.status = 'archived'
    ORDER BY o.order_date ASC
  `);
  
  return stmt.all();
}

/**
 * Get order line items for a specific order
 */
function getOrderLineItems(orderId) {
  const stmt = db.prepare(`
    SELECT 
      *,
      (quantity - fulfilled_quantity) as remaining_quantity
    FROM order_line_items
    WHERE order_id = ?
    ORDER BY product_title ASC, variant_title ASC
  `);
  
  return stmt.all(orderId);
}

/**
 * Get orders with their line items (for UI display)
 * @param {boolean} includeArchived - Whether to include archived orders
 */
function getOrdersWithLineItems(includeArchived = false) {
  const orders = getAllOrders(includeArchived);
  
  return orders.map(order => ({
    ...order,
    lineItems: getOrderLineItems(order.order_id)
  }));
}

/**
 * Get archived orders with their line items
 */
function getArchivedOrdersWithLineItems() {
  const orders = getArchivedOrders();
  
  return orders.map(order => ({
    ...order,
    lineItems: getOrderLineItems(order.order_id)
  }));
}

/**
 * Allocate made quantity to orders (oldest first)
 * This is called when marking items as made for a variant
 * Returns allocations and any orders that became fully fulfilled
 */
function allocateMadeQuantityToOrders(variantId, quantity) {
  // Get orders that are NOT yet fulfilled and NOT archived (to check which become fulfilled after)
  const ordersBeforeStmt = db.prepare(`
    SELECT order_id FROM orders WHERE status != 'fulfilled' AND status != 'archived'
  `);
  const notFulfilledBefore = new Set(ordersBeforeStmt.all().map(o => o.order_id));
  
  // Get all unfulfilled line items for this variant, ordered by order date (oldest first)
  // Exclude archived orders from allocation
  const stmt = db.prepare(`
    SELECT oli.*, o.order_date, o.order_id as parent_order_id
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.order_id
    WHERE oli.variant_id = ?
      AND oli.fulfilled_quantity < oli.quantity
      AND o.status != 'archived'
    ORDER BY o.order_date ASC, oli.id ASC
  `);
  
  const lineItems = stmt.all(variantId);
  
  let remainingToAllocate = quantity;
  const allocations = [];
  const affectedOrderIds = new Set();
  
  for (const item of lineItems) {
    if (remainingToAllocate <= 0) break;
    
    const canFulfill = item.quantity - item.fulfilled_quantity;
    const willFulfill = Math.min(canFulfill, remainingToAllocate);
    
    if (willFulfill > 0) {
      // Update line item fulfilled quantity
      const updateLineItem = db.prepare(`
        UPDATE order_line_items 
        SET fulfilled_quantity = fulfilled_quantity + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE line_item_id = ?
      `);
      updateLineItem.run(willFulfill, item.line_item_id);
      
      allocations.push({
        orderId: item.order_id,
        lineItemId: item.line_item_id,
        allocated: willFulfill
      });
      
      affectedOrderIds.add(item.order_id);
      remainingToAllocate -= willFulfill;
    }
  }
  
  // Update order fulfilled counts and statuses
  updateAllOrderStatuses();
  
  // Find orders that became fulfilled after this allocation
  const newlyFulfilledOrders = [];
  if (affectedOrderIds.size > 0) {
    const fulfilledOrdersStmt = db.prepare(`
      SELECT * FROM orders 
      WHERE order_id IN (${Array.from(affectedOrderIds).map(() => '?').join(',')})
        AND status = 'fulfilled'
    `);
    const fulfilledOrders = fulfilledOrdersStmt.all(...affectedOrderIds);
    
    for (const order of fulfilledOrders) {
      // Only include if it was NOT fulfilled before
      if (notFulfilledBefore.has(order.order_id)) {
        newlyFulfilledOrders.push(order);
      }
    }
  }
  
  return { allocations, newlyFulfilledOrders };
}

/**
 * Deallocate quantity from orders (newest first - reverse of allocation)
 * This is called when resetting a task
 */
function deallocateQuantityFromOrders(variantId, quantity) {
  // Get fulfilled line items for this variant, ordered by order date (newest first - to undo in reverse)
  const stmt = db.prepare(`
    SELECT oli.*, o.order_date
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.order_id
    WHERE oli.variant_id = ?
      AND oli.fulfilled_quantity > 0
    ORDER BY o.order_date DESC, oli.id DESC
  `);
  
  const lineItems = stmt.all(variantId);
  
  let remainingToDeallocate = quantity;
  
  for (const item of lineItems) {
    if (remainingToDeallocate <= 0) break;
    
    const canDeallocate = item.fulfilled_quantity;
    const willDeallocate = Math.min(canDeallocate, remainingToDeallocate);
    
    if (willDeallocate > 0) {
      const updateLineItem = db.prepare(`
        UPDATE order_line_items 
        SET fulfilled_quantity = fulfilled_quantity - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE line_item_id = ?
      `);
      updateLineItem.run(willDeallocate, item.line_item_id);
      
      remainingToDeallocate -= willDeallocate;
    }
  }
  
  // Update order statuses
  updateAllOrderStatuses();
}

/**
 * Reset all fulfilled quantities for a variant in order line items
 */
function resetVariantInOrders(variantId) {
  const stmt = db.prepare(`
    UPDATE order_line_items 
    SET fulfilled_quantity = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  stmt.run(variantId);
  updateAllOrderStatuses();
}

/**
 * Update all order statuses based on their line items
 * Preserves 'archived' status - only updates non-archived orders
 */
function updateAllOrderStatuses() {
  // Calculate fulfilled_items for each non-archived order
  db.exec(`
    UPDATE orders
    SET fulfilled_items = (
      SELECT COALESCE(SUM(fulfilled_quantity), 0)
      FROM order_line_items
      WHERE order_line_items.order_id = orders.order_id
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE status != 'archived'
  `);
  
  // Update status based on fulfilled_items (only for non-archived orders)
  db.exec(`
    UPDATE orders
    SET status = CASE
      WHEN fulfilled_items = 0 THEN 'pending'
      WHEN fulfilled_items >= total_items THEN 'fulfilled'
      ELSE 'in_progress'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE status != 'archived'
  `);
}

/**
 * Clear all non-archived orders that have NO progress (for sync reset)
 * Preserves archived orders AND orders with any progress (fulfilled_items > 0)
 * Returns set of order IDs that have progress (so sync can skip re-inserting them)
 */
function clearOrdersWithoutProgress() {
  // Get order IDs that have progress (should not be cleared or re-synced)
  const ordersWithProgress = db.prepare(`
    SELECT order_id FROM orders 
    WHERE status != 'archived' AND fulfilled_items > 0
  `).all();
  const progressOrderIds = new Set(ordersWithProgress.map(o => o.order_id));
  
  // Only delete line items for orders without progress and not archived
  db.exec(`
    DELETE FROM order_line_items 
    WHERE order_id IN (
      SELECT order_id FROM orders 
      WHERE status != 'archived' AND fulfilled_items = 0
    )
  `);
  
  // Only delete orders without progress and not archived
  db.exec(`
    DELETE FROM orders 
    WHERE status != 'archived' AND fulfilled_items = 0
  `);
  
  return progressOrderIds;
}

/**
 * Get set of archived order IDs (to skip during sync)
 */
function getArchivedOrderIds() {
  const rows = db.prepare(`SELECT order_id FROM orders WHERE status = 'archived'`).all();
  return new Set(rows.map(r => r.order_id));
}

/**
 * Get set of order IDs that should be skipped during sync
 * (archived orders + orders with progress)
 */
function getOrderIdsToSkipDuringSync() {
  const rows = db.prepare(`
    SELECT order_id FROM orders 
    WHERE status = 'archived' OR fulfilled_items > 0
  `).all();
  return new Set(rows.map(r => r.order_id));
}

/**
 * Recalculate task totals based only on non-archived orders in the database
 * This ensures archived order quantities don't get added back during sync
 */
function recalculateTaskTotalsFromOrders() {
  // Get all variant totals from non-archived order line items
  const lineItemTotals = db.prepare(`
    SELECT 
      oli.variant_id,
      SUM(oli.quantity) as total_qty,
      SUM(oli.fulfilled_quantity) as fulfilled_qty
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.order_id
    WHERE o.status != 'archived'
    GROUP BY oli.variant_id
  `).all();
  
  // Create a map of variant_id -> totals
  const variantTotals = new Map();
  for (const item of lineItemTotals) {
    variantTotals.set(item.variant_id, {
      total: item.total_qty,
      fulfilled: item.fulfilled_qty
    });
  }
  
  // Update each task to match the calculated totals
  const allTasks = db.prepare('SELECT variant_id FROM tasks').all();
  
  const updateTask = db.prepare(`
    UPDATE tasks 
    SET total_quantity = ?,
        made_quantity = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  for (const task of allTasks) {
    const totals = variantTotals.get(task.variant_id);
    if (totals) {
      updateTask.run(totals.total, totals.fulfilled, task.variant_id);
      updateTaskStatus(task.variant_id);
    } else {
      // No orders for this variant - set to 0 (will be cleaned up)
      updateTask.run(0, 0, task.variant_id);
      updateTaskStatus(task.variant_id);
    }
  }
  
  // Clean up tasks with 0 total_quantity
  db.exec('DELETE FROM tasks WHERE total_quantity = 0');
  
  console.log('Recalculated task totals from non-archived orders');
}

/**
 * Archive a single order - sets status to archived and deallocates quantities from variants
 * This subtracts fulfilled quantities from variant made_quantity and total_quantity
 */
function archiveOrder(orderId) {
  // Check if order exists and is not already archived
  const order = db.prepare('SELECT status FROM orders WHERE order_id = ?').get(orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status === 'archived') {
    return { success: true, alreadyArchived: true };
  }
  
  // Get all line items for this order
  const lineItems = db.prepare(`
    SELECT variant_id, fulfilled_quantity, quantity
    FROM order_line_items
    WHERE order_id = ?
  `).all(orderId);
  
  // Subtract fulfilled quantities from variant made_quantity
  const updateMade = db.prepare(`
    UPDATE tasks 
    SET made_quantity = MAX(0, made_quantity - ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  // Subtract from total_quantity
  const updateTotal = db.prepare(`
    UPDATE tasks 
    SET total_quantity = MAX(0, total_quantity - ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  for (const item of lineItems) {
    if (item.fulfilled_quantity > 0) {
      updateMade.run(item.fulfilled_quantity, item.variant_id);
    }
    updateTotal.run(item.quantity, item.variant_id);
    updateTaskStatus(item.variant_id);
  }
  
  // Set order status to archived (keep data for unarchive)
  db.prepare(`
    UPDATE orders 
    SET status = 'archived',
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `).run(orderId);
  
  // Clean up tasks with 0 total_quantity
  db.exec('DELETE FROM tasks WHERE total_quantity = 0');
  
  return { success: true };
}

/**
 * Unarchive a single order - restores it from archived status
 * This adds back the quantities to variant made_quantity and total_quantity
 */
function unarchiveOrder(orderId) {
  // Check if order exists and is archived
  const order = db.prepare('SELECT status FROM orders WHERE order_id = ?').get(orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status !== 'archived') {
    return { success: true, notArchived: true };
  }
  
  // Get all line items for this order
  const lineItems = db.prepare(`
    SELECT variant_id, fulfilled_quantity, quantity, product_title, variant_title, sku, image_url
    FROM order_line_items
    WHERE order_id = ?
  `).all(orderId);
  
  // Add back quantities to tasks (upsert in case task was deleted)
  for (const item of lineItems) {
    // Check if task exists
    const existingTask = getTaskByVariantId(item.variant_id);
    
    if (existingTask) {
      // Add to existing task
      db.prepare(`
        UPDATE tasks 
        SET total_quantity = total_quantity + ?,
            made_quantity = made_quantity + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE variant_id = ?
      `).run(item.quantity, item.fulfilled_quantity, item.variant_id);
    } else {
      // Re-create the task
      db.prepare(`
        INSERT INTO tasks (variant_id, variant_title, product_title, sku, image_url, total_quantity, made_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(item.variant_id, item.variant_title, item.product_title, item.sku, item.image_url, item.quantity, item.fulfilled_quantity);
    }
    
    updateTaskStatus(item.variant_id);
  }
  
  // Restore order status based on fulfillment
  const orderData = db.prepare('SELECT total_items, fulfilled_items FROM orders WHERE order_id = ?').get(orderId);
  let newStatus = 'pending';
  if (orderData.fulfilled_items >= orderData.total_items) {
    newStatus = 'fulfilled';
  } else if (orderData.fulfilled_items > 0) {
    newStatus = 'in_progress';
  }
  
  db.prepare(`
    UPDATE orders 
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `).run(newStatus, orderId);
  
  return { success: true };
}

/**
 * Archive all fulfilled orders
 */
function archiveAllFulfilledOrders() {
  // Get all fulfilled orders (not already archived)
  const fulfilledOrders = db.prepare(`
    SELECT order_id FROM orders WHERE status = 'fulfilled'
  `).all();
  
  let archivedCount = 0;
  
  for (const order of fulfilledOrders) {
    const result = archiveOrder(order.order_id);
    if (result.success && !result.alreadyArchived) {
      archivedCount++;
    }
  }
  
  return { success: true, archivedCount };
}

/**
 * Unarchive all archived orders
 */
function unarchiveAllOrders() {
  const archivedOrders = db.prepare(`
    SELECT order_id FROM orders WHERE status = 'archived'
  `).all();
  
  let unarchivedCount = 0;
  
  for (const order of archivedOrders) {
    const result = unarchiveOrder(order.order_id);
    if (result.success && !result.notArchived) {
      unarchivedCount++;
    }
  }
  
  return { success: true, unarchivedCount };
}

/**
 * Permanently delete all archived orders (cleanup)
 */
function deleteArchivedOrders() {
  const result = db.prepare(`DELETE FROM order_line_items WHERE order_id IN (SELECT order_id FROM orders WHERE status = 'archived')`).run();
  const orderResult = db.prepare(`DELETE FROM orders WHERE status = 'archived'`).run();
  
  return { success: true, deletedCount: orderResult.changes };
}

/**
 * Upsert inventory data for a variant
 */
function upsertInventory(data) {
  const stmt = db.prepare(`
    INSERT INTO inventory (variant_id, product_id, product_title, variant_title, sku, image_url, inventory_quantity, last_synced_at, updated_at)
    VALUES (@variantId, @productId, @productTitle, @variantTitle, @sku, @imageUrl, @inventoryQuantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(variant_id) DO UPDATE SET
      product_id = @productId,
      product_title = @productTitle,
      variant_title = @variantTitle,
      sku = @sku,
      image_url = @imageUrl,
      inventory_quantity = @inventoryQuantity,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run({
    variantId: data.variantId,
    productId: data.productId,
    productTitle: data.productTitle,
    variantTitle: data.variantTitle,
    sku: data.sku || '',
    imageUrl: data.imageUrl || null,
    inventoryQuantity: data.inventoryQuantity || 0
  });
}

/**
 * Bulk upsert inventory data
 */
function bulkUpsertInventory(inventoryItems) {
  const upsertStmt = db.prepare(`
    INSERT INTO inventory (variant_id, product_id, product_title, variant_title, sku, image_url, inventory_quantity, last_synced_at, updated_at)
    VALUES (@variantId, @productId, @productTitle, @variantTitle, @sku, @imageUrl, @inventoryQuantity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(variant_id) DO UPDATE SET
      product_id = @productId,
      product_title = @productTitle,
      variant_title = @variantTitle,
      sku = @sku,
      image_url = @imageUrl,
      inventory_quantity = @inventoryQuantity,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      upsertStmt.run({
        variantId: item.variantId,
        productId: item.productId,
        productTitle: item.productTitle,
        variantTitle: item.variantTitle,
        sku: item.sku || '',
        imageUrl: item.imageUrl || null,
        inventoryQuantity: item.inventoryQuantity || 0
      });
    }
  });
  
  insertMany(inventoryItems);
  console.log(`Bulk upserted ${inventoryItems.length} inventory records`);
}

/**
 * Get all inventory data, optionally filtered
 */
function getAllInventory(options = {}) {
  const { outOfStockOnly = false, search = '' } = options;
  
  let query = `
    SELECT 
      *,
      CASE WHEN inventory_quantity <= 0 THEN 1 ELSE 0 END as is_out_of_stock
    FROM inventory
    WHERE 1=1
  `;
  
  const params = {};
  
  if (outOfStockOnly) {
    query += ` AND inventory_quantity <= 0`;
  }
  
  if (search) {
    query += ` AND (product_title LIKE @search OR variant_title LIKE @search OR sku LIKE @search)`;
    params.search = `%${search}%`;
  }
  
  query += `
    ORDER BY 
      is_out_of_stock DESC,
      product_title ASC,
      variant_title ASC
  `;
  
  const stmt = db.prepare(query);
  return stmt.all(params);
}

/**
 * Get inventory summary stats
 */
function getInventoryStats() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_variants,
      SUM(CASE WHEN inventory_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
      SUM(CASE WHEN inventory_quantity > 0 THEN 1 ELSE 0 END) as in_stock_count,
      SUM(inventory_quantity) as total_inventory
    FROM inventory
  `).get();
  
  return stats;
}

/**
 * Clear all inventory data
 */
function clearAllInventory() {
  db.prepare('DELETE FROM inventory').run();
  console.log('All inventory data cleared');
}

module.exports = {
  initDatabase,
  getAllTasks,
  getTaskByVariantId,
  upsertTask,
  updateMadeQuantity,
  markTaskComplete,
  resetTask,
  clearAllTasks,
  logSync,
  getSyncHistory,
  getCurrentStoreUrl,
  isDatabaseReady,
  // Order functions
  upsertOrder,
  upsertOrderLineItem,
  getAllOrders,
  getArchivedOrders,
  getOrderLineItems,
  getOrdersWithLineItems,
  getArchivedOrdersWithLineItems,
  allocateMadeQuantityToOrders,
  deallocateQuantityFromOrders,
  resetVariantInOrders,
  clearOrdersWithoutProgress,
  getArchivedOrderIds,
  getOrderIdsToSkipDuringSync,
  recalculateTaskTotalsFromOrders,
  updateAllOrderStatuses,
  archiveOrder,
  unarchiveOrder,
  archiveAllFulfilledOrders,
  unarchiveAllOrders,
  deleteArchivedOrders,
  // Inventory functions
  upsertInventory,
  bulkUpsertInventory,
  getAllInventory,
  getInventoryStats,
  clearAllInventory
};
