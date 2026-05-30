/**
 * Feature Test: Task Lifecycle
 * 
 * Tests the complete lifecycle of tasks including creation,
 * progress updates, reset, and status transitions.
 */

const {
  initTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  upsertTask,
  getTaskByVariantId,
  getAllTasks,
  updateMadeQuantity,
  resetTask
} = require('../helpers/test-database');

describe('Feature: Task Lifecycle', () => {
  beforeAll(async () => {
    await initTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase();
  });

  beforeEach(() => {
    resetTestDatabase();
  });

  describe('Task creation', () => {
    test('upsertTask creates new task with correct defaults', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red / Medium',
        totalQuantity: 10,
        madeQuantity: 0
      });

      const task = getTaskByVariantId('variant-1');
      expect(task).toBeDefined();
      expect(task.variant_id).toBe('variant-1');
      expect(task.product_title).toBe('T-Shirt');
      expect(task.variant_title).toBe('Red / Medium');
      expect(task.total_quantity).toBe(10);
      expect(task.made_quantity).toBe(0);
      expect(task.status).toBe('pending');
    });

    test('upsertTask with custom status', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 5,
        status: 'in_progress'
      });

      const task = getTaskByVariantId('variant-1');
      expect(task.status).toBe('in_progress');
    });

    test('upsertTask updates existing task', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 5,
        madeQuantity: 0
      });

      // Update with same variant ID
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'Updated T-Shirt',
        variantTitle: 'Updated Red',
        totalQuantity: 10,
        madeQuantity: 0
      });

      const tasks = getAllTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].product_title).toBe('Updated T-Shirt');
      expect(tasks[0].total_quantity).toBe(10);
    });
  });

  describe('Progress updates', () => {
    test('updateMadeQuantity increases made count', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 0
      });

      const result = updateMadeQuantity('variant-1', 5);

      expect(result.previousMade).toBe(0);
      expect(result.newMade).toBe(5);
      expect(result.actualAdded).toBe(5);
      expect(result.newStatus).toBe('in_progress');

      const task = getTaskByVariantId('variant-1');
      expect(task.made_quantity).toBe(5);
      expect(task.status).toBe('in_progress');
    });

    test('updateMadeQuantity caps at total_quantity', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 8
      });

      const result = updateMadeQuantity('variant-1', 5); // Try to add 5, only 2 possible

      expect(result.previousMade).toBe(8);
      expect(result.newMade).toBe(10);
      expect(result.actualAdded).toBe(2);
      expect(result.newStatus).toBe('completed');

      const task = getTaskByVariantId('variant-1');
      expect(task.made_quantity).toBe(10);
    });

    test('updateMadeQuantity sets status to completed when done', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 0
      });

      updateMadeQuantity('variant-1', 10);

      const task = getTaskByVariantId('variant-1');
      expect(task.status).toBe('completed');
    });

    test('updateMadeQuantity throws for non-existent task', () => {
      expect(() => {
        updateMadeQuantity('non-existent', 5);
      }).toThrow('Task not found');
    });
  });

  describe('Task reset', () => {
    test('resetTask zeros made_quantity', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 7,
        status: 'in_progress'
      });

      resetTask('variant-1');

      const task = getTaskByVariantId('variant-1');
      expect(task.made_quantity).toBe(0);
      expect(task.status).toBe('pending');
    });

    test('resetTask on completed task', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 10,
        status: 'completed'
      });

      resetTask('variant-1');

      const task = getTaskByVariantId('variant-1');
      expect(task.made_quantity).toBe(0);
      expect(task.status).toBe('pending');
    });
  });

  describe('Status transitions', () => {
    test('pending → in_progress when first item made', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 0,
        status: 'pending'
      });

      updateMadeQuantity('variant-1', 1);

      expect(getTaskByVariantId('variant-1').status).toBe('in_progress');
    });

    test('in_progress → completed when all made', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 9,
        status: 'in_progress'
      });

      updateMadeQuantity('variant-1', 1);

      expect(getTaskByVariantId('variant-1').status).toBe('completed');
    });

    test('completed → pending when reset', () => {
      upsertTask({
        variantId: 'variant-1',
        productTitle: 'T-Shirt',
        variantTitle: 'Red',
        totalQuantity: 10,
        madeQuantity: 10,
        status: 'completed'
      });

      resetTask('variant-1');

      expect(getTaskByVariantId('variant-1').status).toBe('pending');
    });
  });

  describe('Task queries', () => {
    test('getAllTasks returns tasks sorted by status then product', () => {
      upsertTask({
        variantId: 'variant-3',
        productTitle: 'Zebra Print',
        variantTitle: 'XL',
        totalQuantity: 5,
        madeQuantity: 5,
        status: 'completed'
      });

      upsertTask({
        variantId: 'variant-1',
        productTitle: 'Apple Shirt',
        variantTitle: 'M',
        totalQuantity: 5,
        madeQuantity: 2,
        status: 'in_progress'
      });

      upsertTask({
        variantId: 'variant-2',
        productTitle: 'Banana Shirt',
        variantTitle: 'L',
        totalQuantity: 5,
        madeQuantity: 0,
        status: 'pending'
      });

      const tasks = getAllTasks();

      // Should be sorted: completed, in_progress, pending
      // Then by product_title alphabetically within status
      expect(tasks[0].status).toBe('completed');
      expect(tasks[1].status).toBe('in_progress');
      expect(tasks[2].status).toBe('pending');
    });

    test('getTaskByVariantId returns undefined for non-existent', () => {
      const task = getTaskByVariantId('non-existent');
      expect(task).toBeUndefined();
    });
  });
});
