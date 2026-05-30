/**
 * Unit Tests: Database Pure Business Logic Helpers
 *
 * These functions were extracted from database.js for testability,
 * readability, and to eliminate duplicated status calculation logic
 * (previously repeated in ternaries, CASE statements, and the test helper).
 *
 * They are completely pure (no DB, no side effects) and form the
 * single source of truth for task and order state machines.
 */

const {
  calculateTaskStatus,
  calculateOrderStatus
} = require('../../src/main/database');

describe('Database Pure Helpers', () => {

  describe('calculateTaskStatus', () => {
    test('returns pending when total is 0 or negative', () => {
      expect(calculateTaskStatus(0, 0)).toBe('pending');
      expect(calculateTaskStatus(5, 0)).toBe('pending');
      expect(calculateTaskStatus(0, -10)).toBe('pending');
    });

    test('returns pending when made is 0 or negative (with positive total)', () => {
      expect(calculateTaskStatus(0, 10)).toBe('pending');
      expect(calculateTaskStatus(-3, 10)).toBe('pending');
    });

    test('returns in_progress when 0 < made < total', () => {
      expect(calculateTaskStatus(1, 10)).toBe('in_progress');
      expect(calculateTaskStatus(5, 10)).toBe('in_progress');
      expect(calculateTaskStatus(9, 10)).toBe('in_progress');
    });

    test('returns completed when made >= total (positive)', () => {
      expect(calculateTaskStatus(10, 10)).toBe('completed');
      expect(calculateTaskStatus(15, 10)).toBe('completed');
    });

    test('handles string inputs defensively (coerces to numbers)', () => {
      expect(calculateTaskStatus('3', '10')).toBe('in_progress');
      expect(calculateTaskStatus('10', '10')).toBe('completed');
      expect(calculateTaskStatus('', '5')).toBe('pending');
    });

    test('handles null/undefined defensively', () => {
      expect(calculateTaskStatus(null, 10)).toBe('pending');
      expect(calculateTaskStatus(5, null)).toBe('pending');
      expect(calculateTaskStatus(undefined, undefined)).toBe('pending');
    });
  });

  describe('calculateOrderStatus', () => {
    test('returns pending when total is 0 or negative', () => {
      expect(calculateOrderStatus(0, 0)).toBe('pending');
      expect(calculateOrderStatus(5, 0)).toBe('pending');
    });

    test('returns pending when fulfilled is 0 or negative (with positive total)', () => {
      expect(calculateOrderStatus(0, 5)).toBe('pending');
      expect(calculateOrderStatus(-2, 5)).toBe('pending');
    });

    test('returns in_progress when 0 < fulfilled < total', () => {
      expect(calculateOrderStatus(1, 5)).toBe('in_progress');
      expect(calculateOrderStatus(2, 5)).toBe('in_progress');
      expect(calculateOrderStatus(4, 5)).toBe('in_progress');
    });

    test('returns fulfilled when fulfilled >= total', () => {
      expect(calculateOrderStatus(5, 5)).toBe('fulfilled');
      expect(calculateOrderStatus(8, 5)).toBe('fulfilled');
    });

    test('handles string and null inputs defensively', () => {
      expect(calculateOrderStatus('2', '6')).toBe('in_progress');
      expect(calculateOrderStatus('6', '6')).toBe('fulfilled');
      expect(calculateOrderStatus(null, 3)).toBe('pending');
      expect(calculateOrderStatus(1, undefined)).toBe('pending');
    });
  });

  describe('Parity and consistency', () => {
    test('both functions use the same state machine rules for their domains', () => {
      // The rules are intentionally parallel:
      // 0 or negative total → pending
      // 0 progress → pending
      // partial progress → in_progress / in_progress
      // full or over → completed / fulfilled

      const cases = [
        { made: 0, total: 10, task: 'pending', order: 'pending' },
        { made: 3, total: 10, task: 'in_progress', order: 'in_progress' },
        { made: 10, total: 10, task: 'completed', order: 'fulfilled' },
        { made: 12, total: 10, task: 'completed', order: 'fulfilled' },
      ];

      for (const c of cases) {
        expect(calculateTaskStatus(c.made, c.total)).toBe(c.task);
        expect(calculateOrderStatus(c.made, c.total)).toBe(c.order);
      }
    });
  });

  describe('computeAllocationStep', () => {
    test('returns how much can be allocated in a normal partial case', () => {
      const {
        computeAllocationStep: calcAlloc
      } = require('../../src/main/database');

      // Line item needs 5 more, we have 3 remaining to give
      expect(calcAlloc(10, 5, 3)).toBe(3);
    });

    test('caps at the line item remaining need', () => {
      const { computeAllocationStep: calcAlloc } = require('../../src/main/database');
      expect(calcAlloc(10, 8, 5)).toBe(2); // only 2 left on the line
    });

    test('returns 0 when line item is already fully fulfilled', () => {
      const { computeAllocationStep: calcAlloc } = require('../../src/main/database');
      expect(calcAlloc(10, 10, 5)).toBe(0);
      expect(calcAlloc(10, 12, 5)).toBe(0);
    });

    test('returns 0 when nothing left to allocate', () => {
      const { computeAllocationStep: calcAlloc } = require('../../src/main/database');
      expect(calcAlloc(10, 3, 0)).toBe(0);
      expect(calcAlloc(10, 3, -2)).toBe(0);
    });

    test('handles bad inputs defensively', () => {
      const { computeAllocationStep: calcAlloc } = require('../../src/main/database');
      expect(calcAlloc(null, 3, 5)).toBe(0);
      expect(calcAlloc(10, undefined, 5)).toBe(5);
      expect(calcAlloc('8', '3', '4')).toBe(4);
    });
  });
});
