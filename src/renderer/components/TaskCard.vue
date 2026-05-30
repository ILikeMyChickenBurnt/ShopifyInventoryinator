<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composite component for the Variants/Tasks view.
 */

import { ref } from 'vue';
import ProgressBar from './ProgressBar.vue';
import StatusBadge from './StatusBadge.vue';
import BaseButton from './BaseButton.vue';
import type { Task } from '../types';

const props = defineProps<{
  task: Task;
  busyAction?: 'mark-made' | 'mark-complete' | 'reset' | null;
}>();

const emit = defineEmits<{
  (e: 'mark-made', variantId: string, qty: number): void;
  (e: 'mark-complete', variantId: string): void;
  (e: 'reset', variantId: string): void;
}>();

const customQty = ref<number | null>(null);

function isBusy() {
  return Boolean(props.busyAction);
}

function quickAdd(amount: number) {
  if (props.task.remaining_quantity >= amount) {
    emit('mark-made', props.task.variant_id, amount);
  }
}

function markCustom() {
  if (customQty.value && customQty.value > 0) {
    emit('mark-made', props.task.variant_id, customQty.value);
    customQty.value = null;
  }
}

function completeAll() {
  emit('mark-complete', props.task.variant_id);
}

function resetTask() {
  emit('reset', props.task.variant_id);
}
</script>

<template>
  <div :class="['task-card', task.status]">
    <div v-if="busyAction" class="task-busy-indicator" aria-live="polite">
      {{ busyAction === 'mark-made' ? 'Recording progress...' : busyAction === 'mark-complete' ? 'Completing task...' : 'Resetting task...' }}
    </div>

    <div class="task-image">
      <img
        v-if="task.image_url"
        :src="task.image_url"
        :alt="task.product_title"
        loading="lazy"
      />
      <div v-else class="no-image">📦</div>
    </div>

    <div class="task-info">
      <h3 class="product-title">{{ task.product_title }}</h3>
      <p v-if="task.variant_title" class="variant-title">{{ task.variant_title }}</p>
      <p v-if="task.sku" class="sku">SKU: {{ task.sku }}</p>
    </div>

    <div class="task-progress">
      <ProgressBar
        :made="task.made_quantity"
        :total="task.total_quantity"
        label="left"
      />
    </div>

    <div class="task-actions">
      <div class="quick-actions">
        <BaseButton
          variant="sm"
          :disabled="isBusy() || task.remaining_quantity < 1"
          :loading="busyAction === 'mark-made'"
          @click="quickAdd(1)"
        >
          +1
        </BaseButton>
        <BaseButton
          variant="sm"
          :disabled="isBusy() || task.remaining_quantity < 5"
          :loading="false"
          @click="quickAdd(5)"
        >
          +5
        </BaseButton>
        <BaseButton
          variant="sm"
          :disabled="isBusy() || task.remaining_quantity < 10"
          :loading="false"
          @click="quickAdd(10)"
        >
          +10
        </BaseButton>
      </div>

      <div class="custom-action">
        <input
          v-model.number="customQty"
          type="number"
          min="1"
          :max="task.remaining_quantity"
          placeholder="Custom"
          class="qty-input"
          :disabled="isBusy()"
          @keyup.enter="markCustom"
        />
        <BaseButton
          variant="secondary"
          :disabled="isBusy() || !customQty || customQty < 1"
          :loading="busyAction === 'mark-made'"
          @click="markCustom"
        >
          Mark
        </BaseButton>
      </div>

      <div class="final-actions">
        <BaseButton
          variant="success"
          :disabled="isBusy() || task.remaining_quantity === 0"
          :loading="busyAction === 'mark-complete'"
          @click="completeAll"
        >
          ✓ Complete All
        </BaseButton>
        <BaseButton
          variant="danger"
          :disabled="isBusy() || task.made_quantity === 0"
          :loading="busyAction === 'reset'"
          @click="resetTask"
        >
          ↺ Reset
        </BaseButton>
      </div>
    </div>

    <StatusBadge :status="task.status" />
  </div>
</template>

<style scoped>
.task-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;
  border-left: 5px solid #e5e7eb;
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.task-busy-indicator {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 1;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.75rem;
  font-weight: 600;
}

.task-card.pending { border-left-color: #f59e0b; }
.task-card.in_progress { border-left-color: #3b82f6; }
.task-card.completed { border-left-color: #10b981; opacity: 0.9; }

.task-image {
  width: 70px;
  height: 70px;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
  grid-row: span 2;
}

.task-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 2rem;
  color: #9ca3af;
}

.task-info {
  min-width: 0;
}

.product-title {
  margin: 0 0 0.15rem;
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.2;
}

.variant-title,
.sku {
  margin: 0;
  font-size: 0.85rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-progress {
  grid-column: 2;
}

.task-actions {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.quick-actions {
  display: flex;
  gap: 0.35rem;
}

.custom-action {
  display: flex;
  gap: 0.35rem;
}

.qty-input {
  width: 80px;
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.final-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.status-badge {
  position: absolute;
  top: 1rem;
  right: 1rem;
}
</style>
