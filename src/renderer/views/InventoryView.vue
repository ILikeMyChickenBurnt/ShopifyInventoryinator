<script setup lang="ts">
/**
 * Production InventoryView (initial shell).
 *
 * This is the third production view shell being created during the bridge phase.
 */

import { toRef } from 'vue';
import SearchBar from '../components/SearchBar.vue';
import FilterTabs from '../components/FilterTabs.vue';
import InventoryCard from '../components/InventoryCard.vue';
import EmptyState from '../components/EmptyState.vue';
import BaseButton from '../components/BaseButton.vue';
import { useInventoryFilters } from '../composables/useInventoryFilters';
import type { InventoryItem } from '../types';

const props = defineProps<{
  items: InventoryItem[];
  loading?: boolean;
  refreshing?: boolean;
  errorMessage?: string | null;
}>();

const itemsRef = toRef(props, 'items');

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'copy-link', item: InventoryItem): void;
  (e: 'retry'): void;
}>();

const {
  activeFilter,
  searchQuery,
  filteredItems,
  filterTabs,
  setFilter,
  setSearch,
} = useInventoryFilters({ items: itemsRef, initialFilter: 'all' });
</script>

<template>
  <div class="inventory-view">
    <div class="inventory-toolbar">
      <SearchBar
        v-model="searchQuery"
        placeholder="Search by product, variant, or SKU..."
        @search="setSearch"
      />
      <BaseButton variant="secondary" :loading="refreshing" :disabled="loading" @click="emit('refresh')">
        {{ refreshing ? 'Refreshing...' : '↻ Refresh' }}
      </BaseButton>
    </div>

    <FilterTabs
      v-model="activeFilter"
      :tabs="filterTabs"
      @update:modelValue="setFilter"
    />

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading inventory...</p>
    </div>

    <EmptyState
      v-else-if="errorMessage && items.length === 0"
      icon="⚠️"
      title="Could not load production inventory"
      :description="errorMessage"
      action-label="Retry load"
      @action="emit('retry')"
    />

    <div v-else-if="filteredItems.length > 0" class="inventory-grid">
      <InventoryCard
        v-for="item in filteredItems"
        :key="item.variant_id"
        :item="item"
        @copy-link="$emit('copy-link', $event)"
      />
    </div>

    <EmptyState
      v-else
      :icon="searchQuery ? '🔎' : '📊'"
      :title="searchQuery ? 'No matching inventory items' : 'No inventory loaded yet'"
      :description="searchQuery ? 'Try a different product, variant, SKU, or stock filter.' : 'Sync to load inventory from Shopify.'"
    />
  </div>
</template>

<style scoped>
.inventory-view {
  max-width: 100%;
}

.inventory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
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
