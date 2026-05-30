<script setup lang="ts">
/**
 * Production VariantsView (initial shell).
 *
 * This is the first real production view shell being created during the bridge phase.
 * It currently uses the migrated production composables and components.
 *
 * Over time this will become the full production implementation.
 */

import { toRef } from 'vue';
import SearchBar from '../components/SearchBar.vue';
import FilterTabs from '../components/FilterTabs.vue';
import TaskCard from '../components/TaskCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { useDebouncedSearch } from '../composables/useDebouncedSearch';
import { useTaskFilters } from '../composables/useTaskFilters';
import type { Task } from '../types';

const props = defineProps<{
  tasks: Task[];
  loading?: boolean;
  errorMessage?: string | null;
  activeTaskAction?: { variantId: string; action: 'mark-made' | 'mark-complete' | 'reset' } | null;
}>();

const tasksRef = toRef(props, 'tasks');

const emit = defineEmits<{
  (e: 'mark-made', variantId: string, qty: number): void;
  (e: 'mark-complete', variantId: string): void;
  (e: 'reset', variantId: string): void;
  (e: 'retry'): void;
}>();

const { searchQuery } = useDebouncedSearch('', 300);
const {
  activeFilter,
  filteredTasks,
  filterTabs,
  setFilter,
  setSearch,
} = useTaskFilters({ tasks: tasksRef, initialFilter: 'active' });

function handleMarkMade(id: string, qty: number) {
  emit('mark-made', id, qty);
}

function handleComplete(id: string) {
  emit('mark-complete', id);
}

function handleReset(id: string) {
  emit('reset', id);
}
</script>

<template>
  <div class="variants-view">
    <SearchBar
      v-model="searchQuery"
      placeholder="Search by product, variant, or SKU..."
      @search="setSearch"
    />

    <FilterTabs
      v-model="activeFilter"
      :tabs="filterTabs"
      @update:modelValue="setFilter"
    />

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading tasks...</p>
    </div>

    <EmptyState
      v-else-if="errorMessage && tasks.length === 0"
      icon="⚠️"
      title="Could not load production tasks"
      :description="errorMessage"
      action-label="Retry load"
      @action="emit('retry')"
    />

    <div v-else-if="filteredTasks.length > 0" class="task-list">
      <TaskCard
        v-for="task in filteredTasks"
        :key="task.variant_id"
        :task="task"
        :busy-action="props.activeTaskAction?.variantId === task.variant_id ? props.activeTaskAction.action : null"
        @mark-made="handleMarkMade"
        @mark-complete="handleComplete"
        @reset="handleReset"
      />
    </div>

    <EmptyState
      v-else
      :icon="searchQuery ? '🔎' : '📭'"
      :title="searchQuery ? 'No matching tasks' : 'No tasks loaded yet'"
      :description="searchQuery ? 'Try a different product, variant, SKU, or filter.' : 'Run a sync to load task data from Shopify.'"
    />
  </div>
</template>

<style scoped>
.variants-view {
  max-width: 100%;
}

.loading-state {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 0.75rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
