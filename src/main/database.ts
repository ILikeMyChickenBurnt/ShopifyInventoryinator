import DatabaseConstructor from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

type Database = InstanceType<typeof DatabaseConstructor>;

let db: Database | null = null;
let currentStoreUrl: string | null = null;

// ============================================================
// CORE DATABASE ROW INTERFACES (single source of truth for shapes)
// These replace the previous `any` usage on public APIs and internal queries.
// ============================================================

export interface TaskRow {
  id: number;
  variant_id: string;
  variant_title: string;
  product_title: string;
  sku: string;
  image_url: string | null;
  total_quantity: number;
  made_quantity: number;
  status: 'pending' | 'in_progress' | 'completed';
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  remaining_quantity?: number; // computed in some SELECTs
}

export interface OrderRow {
  id: number;
  order_id: string;
  order_name: string;
  order_date: string;
  total_items: number;
  fulfilled_items: number;
  status: 'pending' | 'in_progress' | 'fulfilled' | 'archived';
  last_synced_at: string;
  created_at: string;
  updated_at: string;
  remaining_items?: number; // computed in some SELECTs
}

export interface OrderLineItemRow {
  id: number;
  order_id: string;
  line_item_id: string;
  variant_id: string;
  variant_title: string;
  product_title: string;
  sku: string;
  image_url: string | null;
  quantity: number;
  fulfilled_quantity: number;
  created_at: string;
  updated_at: string;
  remaining_quantity?: number; // computed in some SELECTs
}

export interface Allocation {
  orderId: string;
  lineItemId: string;
  allocated: number;
}

export interface SyncHistoryRow {
  id: number;
  synced_at: string;
  orders_fetched: number | null;
  variants_updated: number | null;
  status: string | null;
  error_message: string | null;
}

export interface LogSyncInput {
  ordersFetched?: number;
  variantsUpdated?: number;
  status?: string | null;
  errorMessage?: string | null;
}

export interface InventoryRow {
  id: number;
  variant_id: string;
  product_id: string;
  product_title: string;
  variant_title: string;
  sku: string;
  image_url: string | null;
  inventory_quantity: number;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

// ============================================================

/**
 * Sanitize store URL to create a safe filename
 */
export function sanitizeStoreUrl(storeUrl: string | null | undefined): string {
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
export function getDataPath(): string {
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
export function getDatabasePath(storeUrl: string | null | undefined): string {
  const dataPath = getDataPath();
  const storeName = sanitizeStoreUrl(storeUrl);
  return path.join(dataPath, `inventory_${storeName}.db`);
}

/**
 * Initialize database connection and create tables.
 */
export function initDatabase(storeUrl: string | null = null, existingDb: Database | null = null): void {
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

  if (existingDb) {
    db = existingDb;
    console.log('Database initialized with provided instance (testing mode)');
    return;
  }

  const dbPath = getDatabasePath(storeUrl);
  console.log('Database path:', dbPath);
  
  db = new DatabaseConstructor(dbPath);
  
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
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get() as { sql?: string } | undefined;
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Orders table migration check:', msg);
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
  } catch { /* Column might already exist */ }
  
  try {
    db.exec(`ALTER TABLE tasks ADD COLUMN image_url TEXT DEFAULT NULL`);
  } catch { /* Column might already exist */ }
  
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
export function getAllTasks(): TaskRow[] {
  const stmt = db!.prepare(`
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
  
  return stmt.all() as TaskRow[];
}

/**
 * Get a single task by variant ID
 */
export function getTaskByVariantId(variantId: string): TaskRow | null {
  const stmt = db!.prepare(`
    SELECT 
      *,
      (total_quantity - made_quantity) as remaining_quantity
    FROM tasks 
    WHERE variant_id = ?
  `);
  
  return stmt.get(variantId) as TaskRow | null;
}

/**
 * Insert or update a task from Shopify data
 * If task exists, update total_quantity but preserve made_quantity
 */
export interface UpsertTaskInput {
  variantId: string;
  variantTitle: string;
  productTitle: string;
  sku?: string;
  imageUrl?: string | null;
  totalQuantity: number;
}

export function upsertTask(task: UpsertTaskInput): void {
  const { variantId, variantTitle, productTitle, sku, imageUrl, totalQuantity } = task;
  
  const stmt = db!.prepare(`
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
  
  stmt.run(variantId, variantTitle, productTitle, sku || '', imageUrl || null, totalQuantity);
  
  // Update status after upsert
  updateTaskStatus(variantId);
}

/**
 * Update made quantity (increment)
 */
export function updateMadeQuantity(variantId: string, quantity: number): void {
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
  
  const stmt = db!.prepare(`
    UPDATE tasks 
    SET made_quantity = made_quantity + ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  stmt.run(quantity, variantId);
  
  // Update status based on new quantity
  updateTaskStatus(variantId);
}

/**
 * Mark task as complete (set made = total)
 */
export function markTaskComplete(variantId: string): void {
  const stmt = db!.prepare(`
    UPDATE tasks 
    SET made_quantity = total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  stmt.run(variantId);
  
  updateTaskStatus(variantId);
}

/**
 * Reset task progress (set made back to 0)
 */
export function resetTask(variantId: string): void {
  const stmt = db!.prepare(`
    UPDATE tasks 
    SET made_quantity = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  stmt.run(variantId);
  
  updateTaskStatus(variantId);
}

/**
 * Update task status based on quantities
 */
function updateTaskStatus(variantId: string): void {
  const stmt = db!.prepare(`
    UPDATE tasks
    SET status = CASE
      WHEN made_quantity = 0 THEN 'pending'
      WHEN made_quantity >= total_quantity THEN 'completed'
      ELSE 'in_progress'
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  stmt.run(variantId);
}

/**
 * Clear all tasks (for testing or reset)
 */
function clearAllTasks(): void {
  const stmt = db!.prepare('DELETE FROM tasks');
  stmt.run();
}

/**
 * Log sync operation to history
 */
export function logSync(stats: LogSyncInput): void {
  const { ordersFetched, variantsUpdated, status, errorMessage } = stats;
  
  const stmt = db!.prepare(`
    INSERT INTO sync_history (orders_fetched, variants_updated, status, error_message)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(ordersFetched || 0, variantsUpdated || 0, status || null, errorMessage || null);
}

/**
 * Get sync history
 */
function getSyncHistory(limit: number = 10): SyncHistoryRow[] {
  const stmt = db!.prepare(`
    SELECT * FROM sync_history
    ORDER BY synced_at DESC
    LIMIT ?
  `);
  
  return stmt.all(limit) as SyncHistoryRow[];
}

/**
 * Get the current store URL for the database
 */
function getCurrentStoreUrl(): string | null {
  return currentStoreUrl;
}

/**
 * Check if database is initialized
 */
function isDatabaseReady(): boolean {
  return db !== null;
}

// ========== ORDER FUNCTIONS ==========

export interface UpsertOrderInput {
  orderId: string;
  orderName: string;
  orderDate: string;
  totalItems: number;
}

/**
 * Upsert an order from Shopify data
 */
export function upsertOrder(order: UpsertOrderInput): void {
  const { orderId, orderName, orderDate, totalItems } = order;
  
  const stmt = db!.prepare(`
    INSERT INTO orders (order_id, order_name, order_date, total_items, last_synced_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(order_id) DO UPDATE SET
      order_name = excluded.order_name,
      order_date = excluded.order_date,
      total_items = excluded.total_items,
      last_synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(orderId, orderName, orderDate, totalItems);
}

export interface UpsertOrderLineItemInput {
  orderId: string;
  lineItemId: string;
  variantId: string;
  variantTitle: string;
  productTitle: string;
  sku?: string;
  imageUrl?: string | null;
  quantity: number;
  fulfilledQuantity?: number; // for Shopify-fulfilled reconciliation (two-way sync)
}

/**
 * Upsert an order line item
 * Supports optional fulfilledQuantity for two-way sync (Shopify fulfillment reconciliation)
 */
export function upsertOrderLineItem(lineItem: UpsertOrderLineItemInput): void {
  const { 
    orderId, 
    lineItemId, 
    variantId, 
    variantTitle, 
    productTitle, 
    sku, 
    imageUrl, 
    quantity,
    fulfilledQuantity = 0
  } = lineItem;
  
  const stmt = db!.prepare(`
    INSERT INTO order_line_items (order_id, line_item_id, variant_id, variant_title, product_title, sku, image_url, quantity, fulfilled_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(line_item_id) DO UPDATE SET
      quantity = excluded.quantity,
      fulfilled_quantity = CASE 
        WHEN excluded.fulfilled_quantity > 0 THEN excluded.fulfilled_quantity 
        ELSE order_line_items.fulfilled_quantity 
      END,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    orderId, 
    lineItemId, 
    variantId, 
    variantTitle, 
    productTitle, 
    sku || '', 
    imageUrl || null, 
    quantity,
    fulfilledQuantity || 0
  );
}

/**
 * Get all orders with their progress
 */
export function getAllOrders(includeArchived: boolean = false): OrderRow[] {
  const whereClause = includeArchived ? '' : "WHERE o.status != 'archived'";
  const stmt = db!.prepare(`
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
  
  return stmt.all() as OrderRow[];
}

/**
 * Get only archived orders
 */
function getArchivedOrders(): OrderRow[] {
  const stmt = db!.prepare(`
    SELECT 
      o.*,
      (o.total_items - o.fulfilled_items) as remaining_items
    FROM orders o
    WHERE o.status = 'archived'
    ORDER BY o.order_date ASC
  `);
  
  return stmt.all() as OrderRow[];
}

/**
 * Get order line items for a specific order
 */
function getOrderLineItems(orderId: string): OrderLineItemRow[] {
  const stmt = db!.prepare(`
    SELECT 
      *,
      (quantity - fulfilled_quantity) as remaining_quantity
    FROM order_line_items
    WHERE order_id = ?
    ORDER BY product_title ASC, variant_title ASC
  `);
  
  return stmt.all(orderId) as OrderLineItemRow[];
}

/**
 * Get orders with their line items (for UI display)
 */
interface OrderWithLineItems extends OrderRow {
  lineItems: OrderLineItemRow[];
}

export function getOrdersWithLineItems(includeArchived: boolean = false): OrderWithLineItems[] {
  const orders = getAllOrders(includeArchived);
  
  return orders.map(order => ({
    ...order,
    lineItems: getOrderLineItems(order.order_id)
  }));
}

/**
 * Get archived orders with their line items
 */
export function getArchivedOrdersWithLineItems(): OrderWithLineItems[] {
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
export interface AllocationResult {
  allocations: Allocation[];
  newlyFulfilledOrders: OrderRow[];
}

export function allocateMadeQuantityToOrders(variantId: string, quantity: number): AllocationResult {
  // Get orders that are NOT yet fulfilled and NOT archived (to check which become fulfilled after)
  const ordersBeforeStmt = db!.prepare(`
    SELECT order_id FROM orders WHERE status != 'fulfilled' AND status != 'archived'
  `);
  const beforeRows = ordersBeforeStmt.all() as Array<{ order_id: string }>;
  const notFulfilledBefore = new Set(beforeRows.map(r => r.order_id));
  
  // Get all unfulfilled line items for this variant, ordered by order date (oldest first)
  // Exclude archived orders from allocation
  const stmt = db!.prepare(`
    SELECT oli.*, o.order_date, o.order_id as parent_order_id
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.order_id
    WHERE oli.variant_id = ?
      AND oli.fulfilled_quantity < oli.quantity
      AND o.status != 'archived'
    ORDER BY o.order_date ASC, oli.id ASC
  `);
  
  const lineItems = stmt.all(variantId) as Array<OrderLineItemRow & { order_date: string }>;
  
  let remainingToAllocate = quantity;
  const allocations: Allocation[] = [];
  const affectedOrderIds = new Set<string>();
  
  for (const item of lineItems) {
    if (remainingToAllocate <= 0) break;
    
    const willFulfill = computeAllocationStepImpl(item.quantity, item.fulfilled_quantity, remainingToAllocate);
    
    if (willFulfill > 0) {
      const updateLineItem = db!.prepare(`
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
  const newlyFulfilledOrders: OrderRow[] = [];
  if (affectedOrderIds.size > 0) {
    const placeholders = Array.from(affectedOrderIds).map(() => '?').join(',');
    const fulfilledOrdersStmt = db!.prepare(`
      SELECT * FROM orders 
      WHERE order_id IN (${placeholders})
        AND status = 'fulfilled'
    `);
    const fulfilledOrders = fulfilledOrdersStmt.all(...affectedOrderIds) as OrderRow[];
    
    for (const order of fulfilledOrders) {
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
function deallocateQuantityFromOrders(variantId: string, quantity: number): void {
  const stmt = db!.prepare(`
    SELECT oli.*, o.order_date
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.order_id
    WHERE oli.variant_id = ?
      AND oli.fulfilled_quantity > 0
    ORDER BY o.order_date DESC, oli.id DESC
  `);
  
  const lineItems = stmt.all(variantId) as Array<OrderLineItemRow & { order_date: string }>;
  
  let remainingToDeallocate = quantity;
  
  for (const item of lineItems) {
    if (remainingToDeallocate <= 0) break;
    
    const canDeallocate = item.fulfilled_quantity;
    const willDeallocate = Math.min(canDeallocate, remainingToDeallocate);
    
    if (willDeallocate > 0) {
      const updateLineItem = db!.prepare(`
        UPDATE order_line_items 
        SET fulfilled_quantity = fulfilled_quantity - ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE line_item_id = ?
      `);
      updateLineItem.run(willDeallocate, item.line_item_id);
      
      remainingToDeallocate -= willDeallocate;
    }
  }
  
  updateAllOrderStatuses();
}

/**
 * Reset all fulfilled quantities for a variant in order line items
 */
export function resetVariantInOrders(variantId: string): void {
  const stmt = db!.prepare(`
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
export function updateAllOrderStatuses(): void {
  db!.exec(`
    UPDATE orders
    SET fulfilled_items = (
      SELECT COALESCE(SUM(fulfilled_quantity), 0)
      FROM order_line_items
      WHERE order_line_items.order_id = orders.order_id
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE status != 'archived'
  `);
  
  db!.exec(`
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
export function clearOrdersWithoutProgress(): Set<string> {
  const ordersWithProgress = db!.prepare(`
    SELECT order_id FROM orders 
    WHERE status != 'archived' AND fulfilled_items > 0
  `).all() as Array<{ order_id: string }>;
  const progressOrderIds = new Set(ordersWithProgress.map(o => o.order_id));
  
  db!.exec(`
    DELETE FROM order_line_items 
    WHERE order_id IN (
      SELECT order_id FROM orders 
      WHERE status != 'archived' AND fulfilled_items = 0
    )
  `);
  
  db!.exec(`
    DELETE FROM orders 
    WHERE status != 'archived' AND fulfilled_items = 0
  `);
  
  return progressOrderIds;
}

/**
 * Get set of archived order IDs (to skip during sync)
 */
function getArchivedOrderIds(): Set<string> {
  const rows = db!.prepare(`SELECT order_id FROM orders WHERE status = 'archived'`).all() as Array<{ order_id: string }>;
  return new Set(rows.map(r => r.order_id));
}

/**
 * Get set of order IDs that should be skipped during sync
 * (archived orders + orders with progress)
 */
export function getOrderIdsToSkipDuringSync(): Set<string> {
  const rows = db!.prepare(`
    SELECT order_id FROM orders 
    WHERE status IN ('archived', 'fulfilled') OR fulfilled_items > 0
  `).all() as Array<{ order_id: string }>;
  return new Set(rows.map(r => r.order_id));
}

interface VariantTotals {
  total: number;
  fulfilled: number;
}

/**
 * Recalculate task totals based only on non-archived orders in the database
 * This ensures archived order quantities don't get added back during sync
 */
export function recalculateTaskTotalsFromOrders(): void {
  const lineItemTotals = db!.prepare(`
    SELECT 
      oli.variant_id,
      SUM(oli.quantity) as total_qty,
      SUM(oli.fulfilled_quantity) as fulfilled_qty
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.order_id
    WHERE o.status NOT IN ('archived', 'fulfilled')
    GROUP BY oli.variant_id
  `).all() as Array<{ variant_id: string; total_qty: number; fulfilled_qty: number }>;
  
  const variantTotals = new Map<string, VariantTotals>();
  for (const item of lineItemTotals) {
    variantTotals.set(item.variant_id, {
      total: item.total_qty,
      fulfilled: item.fulfilled_qty
    });
  }
  
  const allTasks = db!.prepare('SELECT variant_id FROM tasks').all() as Array<{ variant_id: string }>;
  
  const updateTask = db!.prepare(`
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
      updateTask.run(0, 0, task.variant_id);
      updateTaskStatus(task.variant_id);
    }
  }
  
  db!.exec('DELETE FROM tasks WHERE total_quantity = 0');
  
  console.log('Recalculated task totals from non-archived orders');
}

export interface ArchiveResult {
  success: boolean;
  alreadyArchived?: boolean;
}

/**
 * Archive a single order - sets status to archived and deallocates quantities from variants
 * This subtracts fulfilled quantities from variant made_quantity and total_quantity
 */
export function archiveOrder(orderId: string): ArchiveResult {
  const order = db!.prepare('SELECT status FROM orders WHERE order_id = ?').get(orderId) as { status: string } | undefined;
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status === 'archived') {
    return { success: true, alreadyArchived: true };
  }
  
  const lineItems = db!.prepare(`
    SELECT variant_id, fulfilled_quantity, quantity
    FROM order_line_items
    WHERE order_id = ?
  `).all(orderId) as Array<{ variant_id: string; fulfilled_quantity: number; quantity: number }>;
  
  const updateMade = db!.prepare(`
    UPDATE tasks 
    SET made_quantity = MAX(0, made_quantity - ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE variant_id = ?
  `);
  
  const updateTotal = db!.prepare(`
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
  
  db!.prepare(`
    UPDATE orders 
    SET status = 'archived',
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `).run(orderId);
  
  db!.exec('DELETE FROM tasks WHERE total_quantity = 0');
  
  return { success: true };
}

export interface UnarchiveResult {
  success: boolean;
  notArchived?: boolean;
}

/**
 * Unarchive a single order - restores it from archived status
 * This adds back the quantities to variant made_quantity and total_quantity
 */
export function unarchiveOrder(orderId: string): UnarchiveResult {
  const order = db!.prepare('SELECT status FROM orders WHERE order_id = ?').get(orderId) as { status: string } | undefined;
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status !== 'archived') {
    return { success: true, notArchived: true };
  }
  
  const lineItems = db!.prepare(`
    SELECT variant_id, fulfilled_quantity, quantity, product_title, variant_title, sku, image_url
    FROM order_line_items
    WHERE order_id = ?
  `).all(orderId) as Array<{
    variant_id: string;
    fulfilled_quantity: number;
    quantity: number;
    product_title: string;
    variant_title: string;
    sku: string;
    image_url: string | null;
  }>;
  
  for (const item of lineItems) {
    const existingTask = getTaskByVariantId(item.variant_id);
    
    if (existingTask) {
      db!.prepare(`
        UPDATE tasks 
        SET total_quantity = total_quantity + ?,
            made_quantity = made_quantity + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE variant_id = ?
      `).run(item.quantity, item.fulfilled_quantity, item.variant_id);
    } else {
      db!.prepare(`
        INSERT INTO tasks (variant_id, variant_title, product_title, sku, image_url, total_quantity, made_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(item.variant_id, item.variant_title, item.product_title, item.sku, item.image_url, item.quantity, item.fulfilled_quantity);
    }
    
    updateTaskStatus(item.variant_id);
  }
  
  const orderData = db!.prepare('SELECT total_items, fulfilled_items FROM orders WHERE order_id = ?').get(orderId) as { total_items: number; fulfilled_items: number } | undefined;
  
  let newStatus: 'pending' | 'in_progress' | 'fulfilled' = 'pending';
  if (orderData) {
    if (orderData.fulfilled_items >= orderData.total_items) {
      newStatus = 'fulfilled';
    } else if (orderData.fulfilled_items > 0) {
      newStatus = 'in_progress';
    }
  }
  
  db!.prepare(`
    UPDATE orders 
    SET status = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ?
  `).run(newStatus, orderId);
  
  return { success: true };
}

export interface BatchArchiveResult {
  success: boolean;
  archivedCount: number;
}

export interface BatchUnarchiveResult {
  success: boolean;
  unarchivedCount: number;
}

export interface DeleteResult {
  success: boolean;
  deletedCount: number;
}

/**
 * Archive all fulfilled orders
 */
export function archiveAllFulfilledOrders(): BatchArchiveResult {
  const fulfilledOrders = db!.prepare(`
    SELECT order_id FROM orders WHERE status = 'fulfilled'
  `).all() as Array<{ order_id: string }>;
  
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
export function unarchiveAllOrders(): BatchUnarchiveResult {
  const archivedOrders = db!.prepare(`
    SELECT order_id FROM orders WHERE status = 'archived'
  `).all() as Array<{ order_id: string }>;
  
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
function deleteArchivedOrders(): DeleteResult {
  db!.prepare(`DELETE FROM order_line_items WHERE order_id IN (SELECT order_id FROM orders WHERE status = 'archived')`).run();
  const orderResult = db!.prepare(`DELETE FROM orders WHERE status = 'archived'`).run();
  
  return { success: true, deletedCount: orderResult.changes };
}

export interface InventoryInput {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
  imageUrl?: string | null;
  inventoryQuantity?: number;
}

/**
 * Upsert inventory data for a variant
 */
function upsertInventory(data: InventoryInput): void {
  const stmt = db!.prepare(`
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
export function bulkUpsertInventory(inventoryItems: InventoryInput[]): void {
  const upsertStmt = db!.prepare(`
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
  
  const insertMany = db!.transaction((items: InventoryInput[]) => {
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

export interface InventoryQueryOptions {
  outOfStockOnly?: boolean;
  search?: string;
}

export interface InventoryStats {
  total_variants: number;
  out_of_stock_count: number;
  in_stock_count: number;
  total_inventory: number;
}

/**
 * Get all inventory data, optionally filtered
 */
export function getAllInventory(options: InventoryQueryOptions = {}): Array<InventoryRow & { is_out_of_stock: number }> {
  const { outOfStockOnly = false, search = '' } = options;
  
  let query = `
    SELECT 
      *,
      CASE WHEN inventory_quantity <= 0 THEN 1 ELSE 0 END as is_out_of_stock
    FROM inventory
    WHERE 1=1
  `;
  
  const params: Record<string, string> = {};
  
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
  
  const stmt = db!.prepare(query);
  return stmt.all(params) as Array<InventoryRow & { is_out_of_stock: number }>;
}

/**
 * Get inventory summary stats
 */
export function getInventoryStats(): InventoryStats {
  const stats = db!.prepare(`
    SELECT 
      COUNT(*) as total_variants,
      SUM(CASE WHEN inventory_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
      SUM(CASE WHEN inventory_quantity > 0 THEN 1 ELSE 0 END) as in_stock_count,
      SUM(inventory_quantity) as total_inventory
    FROM inventory
  `).get() as InventoryStats;
  
  return stats;
}

/**
 * Clear all inventory data
 */
function clearAllInventory(): void {
  db!.prepare('DELETE FROM inventory').run();
  console.log('All inventory data cleared');
}

// ============================================================
// PURE BUSINESS LOGIC HELPERS (extracted for testability)
// These contain no DB access and can be unit tested in isolation.
// ============================================================

/**
 * Pure function: Determine task status from made vs total quantities.
 * Single source of truth for the state machine:
 *   pending → in_progress → completed
 */
export function calculateTaskStatusImpl(madeQuantity: number | string, totalQuantity: number | string): 'pending' | 'in_progress' | 'completed' {
  const made = Number(madeQuantity) || 0;
  const total = Number(totalQuantity) || 0;

  if (total <= 0) return 'pending';
  if (made <= 0) return 'pending';
  if (made >= total) return 'completed';
  return 'in_progress';
}

/**
 * Pure function: Determine order status from fulfilled vs total items.
 * Matches the UI and DB state machine for orders.
 */
export function calculateOrderStatusImpl(fulfilledItems: number | string, totalItems: number | string): 'pending' | 'in_progress' | 'fulfilled' {
  const fulfilled = Number(fulfilledItems) || 0;
  const total = Number(totalItems) || 0;

  if (total <= 0) return 'pending';
  if (fulfilled <= 0) return 'pending';
  if (fulfilled >= total) return 'fulfilled';
  return 'in_progress';
}

// Public wrappers (for symmetry with shopify-api pattern and future internal use)
export function calculateTaskStatus(madeQuantity: number | string, totalQuantity: number | string): 'pending' | 'in_progress' | 'completed' {
  return calculateTaskStatusImpl(madeQuantity, totalQuantity);
}

export function calculateOrderStatus(fulfilledItems: number | string, totalItems: number | string): 'pending' | 'in_progress' | 'fulfilled' {
  return calculateOrderStatusImpl(fulfilledItems, totalItems);
}

/**
 * Pure helper: Compute how much of a single order line item we can/should allocate
 * given current fulfilled state and how much we still want to allocate.
 * Returns the amount that will actually be fulfilled in this step (never negative, never exceeds remaining need or remaining capacity).
 */
export function computeAllocationStepImpl(
  lineItemQuantity: number | string,
  lineItemFulfilled: number | string,
  remainingToAllocate: number | string
): number {
  const qty = Number(lineItemQuantity) || 0;
  const already = Number(lineItemFulfilled) || 0;
  const remaining = Math.max(0, Number(remainingToAllocate) || 0);

  const canFulfill = Math.max(0, qty - already);
  return Math.min(canFulfill, remaining);
}

export function computeAllocationStep(
  lineItemQuantity: number | string,
  lineItemFulfilled: number | string,
  remainingToAllocate: number | string
): number {
  return computeAllocationStepImpl(lineItemQuantity, lineItemFulfilled, remainingToAllocate);
}

module.exports = {
  // Exported helpers for testing / reuse
  sanitizeStoreUrl,
  getDataPath,
  getDatabasePath,

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
  clearAllInventory,
  // Pure business logic helpers (exported for unit testing + reuse in test helper)
  calculateTaskStatus,
  calculateOrderStatus,
  computeAllocationStep
};
