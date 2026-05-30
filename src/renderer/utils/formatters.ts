/**
 * Pure renderer formatting & calculation helpers.
 *
 * These were originally extracted from src/renderer/app.js for testability
 * (see testing culture in CLAUDE.md and TESTING_PATTERNS.md).
 *
 * They contain **no** Vue reactivity, no DOM access, and no side effects.
 * They are now fully typed and live in TypeScript as the first deliverable
 * of the renderer modernization effort (Phase 1).
 */

export interface ProgressTask {
  made_quantity: number;
  total_quantity?: number | null;
}

export interface ProgressOrder {
  fulfilled_items: number;
  total_items?: number | null;
}

/**
 * Calculate progress percentage for a task/variant (0-100+).
 * Defensive against missing or zero totals.
 */
export function progressPercentageImpl(task: ProgressTask | null | undefined): number {
  if (!task || !task.total_quantity) return 0;
  const pct = Math.round((task.made_quantity / task.total_quantity) * 100);
  // Preserve the (slightly odd) existing behavior of allowing >100 when made > total
  return pct;
}

/**
 * Calculate progress percentage for an order.
 */
export function orderProgressPercentageImpl(order: ProgressOrder | null | undefined): number {
  if (!order || !order.total_items) return 0;
  return Math.round((order.fulfilled_items / order.total_items) * 100);
}

/**
 * Human-friendly status labels used in badges and UI.
 */
export function formatStatusImpl(status: string | null | undefined): string {
  if (!status) return '';

  const statusMap: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    fulfilled: 'Fulfilled',
    archived: 'Archived',
  };

  return statusMap[status] || status;
}

/**
 * Format an order date for display in the UI.
 */
export function formatOrderDateImpl(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr; // fallback for bad input

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Backwards-compatible named exports (used by the still-running global Vue app)
// These thin wrappers let us migrate callers gradually without breaking the UI.
// ---------------------------------------------------------------------------

export function progressPercentage(task: ProgressTask | null | undefined): number {
  return progressPercentageImpl(task);
}

export function orderProgressPercentage(order: ProgressOrder | null | undefined): number {
  return orderProgressPercentageImpl(order);
}

export function formatStatus(status: string | null | undefined): string {
  return formatStatusImpl(status);
}

export function formatOrderDate(dateStr: string | null | undefined): string {
  return formatOrderDateImpl(dateStr);
}

// Default export for any existing `require()` patterns in tests
export default {
  progressPercentage: progressPercentageImpl,
  orderProgressPercentage: orderProgressPercentageImpl,
  formatStatus: formatStatusImpl,
  formatOrderDate: formatOrderDateImpl,
};
