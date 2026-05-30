<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Reusable progress indicator with numbers + fill + remaining badge.
 */

import { computed } from 'vue';

export interface ProgressBarProps {
  made: number;
  total: number;
  label?: string;
  showPercentage?: boolean;
}

const props = withDefaults(defineProps<ProgressBarProps>(), {
  label: 'left',
  showPercentage: true,
});

function progressPercentageImpl(task: { made_quantity: number; total_quantity?: number | null }) {
  if (!task || !task.total_quantity) return 0;
  return Math.round((task.made_quantity / task.total_quantity) * 100);
}

const percentage = computed(() =>
  progressPercentageImpl({ made_quantity: props.made, total_quantity: props.total })
);

const remaining = computed(() => Math.max(0, props.total - props.made));
</script>

<template>
  <div class="progress-row">
    <div class="progress-numbers">
      <span class="made">{{ made }}</span>
      <span class="separator">/</span>
      <span class="total">{{ total }}</span>
    </div>

    <div class="progress-container">
      <div
        class="progress-fill"
        :style="{ width: percentage + '%' }"
      />
    </div>

    <div class="remaining-badge">
      <strong>{{ remaining }}</strong> {{ label }}
    </div>
  </div>
</template>

<style scoped>
.progress-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}

.progress-numbers {
  font-size: 0.9rem;
  color: #374151;
  white-space: nowrap;
  min-width: 60px;
}

.separator {
  color: #9ca3af;
  margin: 0 2px;
}

.progress-container {
  flex: 1;
  height: 20px;
  background: #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #5a6fd6 100%);
  transition: width 0.3s ease;
  border-radius: 10px;
}

.remaining-badge {
  background: #f3f4f6;
  color: #374151;
  font-size: 0.8rem;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  white-space: nowrap;
  min-width: 52px;
  text-align: center;
}

.made {
  font-weight: 600;
  color: #1f2937;
}
</style>
