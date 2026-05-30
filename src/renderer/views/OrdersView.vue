<script setup lang="ts">
/**
 * Production OrdersView (initial shell).
 *
 * This is the second production view shell being created during the bridge phase.
 */

import { computed } from 'vue';
import SearchBar from '../components/SearchBar.vue';
import FilterTabs from '../components/FilterTabs.vue';
import OrderCard from '../components/OrderCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { useOrderFilters } from '../composables/useOrderFilters';
import type { Order } from '../types';

const props = defineProps<{
  orders: Order[];
  archivedOrders?: Order[];
  loading?: boolean;
  errorMessage?: string | null;
  activeOrderAction?: { orderId: string; action: 'archive' | 'unarchive' } | null;
}>();

const emit = defineEmits<{
  (e: 'archive', orderId: string): void;
  (e: 'unarchive', orderId: string): void;
  (e: 'open-shopify', url: string): void;
  (e: 'copy-link', url: string): void;
  (e: 'retry'): void;
}>();

const allOrdersForFiltering = computed(() => {
  const active = props.orders || [];
  const archived = props.archivedOrders || [];
  return [...active, ...archived];
});

const {
  activeFilter,
  searchQuery,
  filteredOrders,
  filterTabs,
  setFilter,
  setSearch,
} = useOrderFilters({ orders: allOrdersForFiltering, initialFilter: 'active' });

function handleArchive(id: string) { emit('archive', id); }
function handleUnarchive(id: string) { emit('unarchive', id); }
function handleOpen(url: string) { emit('open-shopify', url); }
function handleCopy(url: string) { emit('copy-link', url); }
</script>

<template>
  <div class="orders-view">
    <SearchBar
      v-model="searchQuery"
      placeholder="Search by order number, product, or variant..."
      @search="setSearch"
    />

    <FilterTabs
      v-model="activeFilter"
      :tabs="filterTabs"
      @update:modelValue="setFilter"
    />

    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading orders...</p>
    </div>

    <EmptyState
      v-else-if="errorMessage && allOrdersForFiltering.length === 0"
      icon="⚠️"
      title="Could not load production orders"
      :description="errorMessage"
      action-label="Retry load"
      @action="emit('retry')"
    />

    <div v-else-if="filteredOrders.length > 0" class="orders-list">
      <OrderCard
        v-for="order in filteredOrders"
        :key="order.order_id"
        :order="order"
        :busy-action="props.activeOrderAction?.orderId === order.order_id ? props.activeOrderAction.action : null"
        @archive="handleArchive"
        @unarchive="handleUnarchive"
        @open-shopify="handleOpen"
        @copy-link="handleCopy"
      />
    </div>

    <EmptyState
      v-else
      :icon="searchQuery ? '🔎' : '📋'"
      :title="searchQuery ? 'No matching orders' : 'No orders loaded yet'"
      :description="searchQuery ? 'Try adjusting your search or status filter.' : 'Sync to load orders from Shopify.'"
    />
  </div>
</template>

<style scoped>
.orders-view {
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
