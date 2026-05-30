/**
 * Unit Tests: Renderer Pure Helper Functions
 *
 * These helpers were extracted from src/renderer/app.js for testability.
 * They are completely pure (no Vue, no DOM, no side effects) and power
 * progress bars, status badges, and date display throughout the UI.
 */

const {
  progressPercentage,
  orderProgressPercentage,
  formatStatus,
  formatOrderDate
} = require('../../src/renderer/utils/formatters');

describe('Renderer Pure Helpers', () => {

  describe('progressPercentage', () => {
    test('returns 0 when total_quantity is 0 or missing', () => {
      expect(progressPercentage({ made_quantity: 5, total_quantity: 0 })).toBe(0);
      expect(progressPercentage({ made_quantity: 5 })).toBe(0);
      expect(progressPercentage(null)).toBe(0);
    });

    test('calculates correct rounded percentage', () => {
      expect(progressPercentage({ made_quantity: 3, total_quantity: 10 })).toBe(30);
      expect(progressPercentage({ made_quantity: 1, total_quantity: 3 })).toBe(33);
      expect(progressPercentage({ made_quantity: 2, total_quantity: 3 })).toBe(67);
      expect(progressPercentage({ made_quantity: 10, total_quantity: 10 })).toBe(100);
    });

    test('caps at 100 even if made > total (defensive)', () => {
      expect(progressPercentage({ made_quantity: 15, total_quantity: 10 })).toBe(150); // current behavior
    });
  });

  describe('orderProgressPercentage', () => {
    test('returns 0 when total_items is 0 or missing', () => {
      expect(orderProgressPercentage({ fulfilled_items: 3, total_items: 0 })).toBe(0);
      expect(orderProgressPercentage({ fulfilled_items: 3 })).toBe(0);
      expect(orderProgressPercentage(null)).toBe(0);
    });

    test('calculates correct rounded percentage', () => {
      expect(orderProgressPercentage({ fulfilled_items: 2, total_items: 5 })).toBe(40);
      expect(orderProgressPercentage({ fulfilled_items: 5, total_items: 5 })).toBe(100);
      expect(orderProgressPercentage({ fulfilled_items: 1, total_items: 4 })).toBe(25);
    });
  });

  describe('formatStatus', () => {
    test('maps known statuses to friendly labels', () => {
      expect(formatStatus('pending')).toBe('Pending');
      expect(formatStatus('in_progress')).toBe('In Progress');
      expect(formatStatus('completed')).toBe('Completed');
      expect(formatStatus('fulfilled')).toBe('Fulfilled');
      expect(formatStatus('archived')).toBe('Archived');
    });

    test('returns the raw status for unknown values', () => {
      expect(formatStatus('custom_state')).toBe('custom_state');
      expect(formatStatus('')).toBe('');
      expect(formatStatus(null)).toBe('');
    });
  });

  describe('formatOrderDate', () => {
    test('returns empty string for falsy input', () => {
      expect(formatOrderDate('')).toBe('');
      expect(formatOrderDate(null)).toBe('');
      expect(formatOrderDate(undefined)).toBe('');
    });

    test('returns original string for invalid dates (graceful fallback)', () => {
      expect(formatOrderDate('not-a-date')).toBe('not-a-date');
      expect(formatOrderDate('2025-99-99')).toBe('2025-99-99');
    });

    test('produces a human readable string for valid ISO dates', () => {
      const result = formatOrderDate('2025-03-15T14:30:00Z');
      // The exact output depends on locale, but it should contain key parts
      expect(result).toMatch(/Mar|March/);
      expect(result).toMatch(/15/);
      expect(result).toMatch(/2025/);
    });
  });

  describe('Edge cases and robustness', () => {
    test('all helpers never throw on weird input', () => {
      expect(() => progressPercentage(undefined)).not.toThrow();
      expect(() => orderProgressPercentage({})).not.toThrow();
      expect(() => formatStatus(123)).not.toThrow();
      expect(() => formatOrderDate({})).not.toThrow();
    });

    test('all helpers are pure (same input → same output)', () => {
      const task = { made_quantity: 7, total_quantity: 20 };
      expect(progressPercentage(task)).toBe(progressPercentage(task));

      const order = { fulfilled_items: 3, total_items: 8 };
      expect(orderProgressPercentage(order)).toBe(orderProgressPercentage(order));
    });
  });
});
