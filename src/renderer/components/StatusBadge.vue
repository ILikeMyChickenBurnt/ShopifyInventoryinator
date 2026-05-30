<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Displays human-friendly status with appropriate color.
 */

import { computed } from 'vue';

export type Status = string;

export interface StatusBadgeProps {
  status: Status;
}

const props = defineProps<StatusBadgeProps>();

const displayStatus = computed(() => {
  const map: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    fulfilled: 'Fulfilled',
    archived: 'Archived',
  };
  return map[props.status] || props.status;
});
</script>

<template>
  <div :class="['status-badge', status]">
    {{ displayStatus }}
  </div>
</template>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 9999px;
  text-transform: capitalize;
  white-space: nowrap;
}

.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.in_progress {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge.completed,
.status-badge.fulfilled {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.archived {
  background: #e5e7eb;
  color: #374151;
}
</style>
