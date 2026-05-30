/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composable for order filtering + search state.
 */
import { ref, computed, type Ref } from 'vue';

type SearchableOrderLineItem = {
  product_title?: string | null;
  variant_title?: string | null;
};

type SearchableOrder = {
  status: string;
  order_name?: string | null;
  lineItems?: SearchableOrderLineItem[];
};

export interface UseOrderFiltersOptions<T extends SearchableOrder> {
  orders: Ref<T[]>;
  initialFilter?: 'all' | 'active' | 'fulfilled' | 'archived';
}

export function useOrderFilters<T extends SearchableOrder>(options: UseOrderFiltersOptions<T>) {
  const { orders, initialFilter = 'active' } = options;

  const activeFilter = ref<'all' | 'active' | 'fulfilled' | 'archived'>(initialFilter);
  const searchQuery = ref('');

  const filteredOrders = computed(() => {
    let result = orders.value;

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(o =>
        normalizeSearchValue(o.order_name).includes(q) ||
        o.lineItems?.some((item) =>
          normalizeSearchValue(item.product_title).includes(q) ||
          normalizeSearchValue(item.variant_title).includes(q)
        )
      );
    }

    if (activeFilter.value === 'active') {
      result = result.filter(o => o.status === 'pending' || o.status === 'in_progress');
    } else if (activeFilter.value === 'fulfilled') {
      result = result.filter(o => o.status === 'fulfilled');
    } else if (activeFilter.value === 'archived') {
      result = result.filter(o => o.status === 'archived');
    }

    return result;
  });

  const filterTabs = computed(() => {
    const all = orders.value;
    return [
      { key: 'all', label: 'All', count: all.length },
      { key: 'active', label: 'Active', count: all.filter(o => o.status === 'pending' || o.status === 'in_progress').length },
      { key: 'fulfilled', label: 'Fulfilled', count: all.filter(o => o.status === 'fulfilled').length },
      { key: 'archived', label: 'Archived', count: all.filter(o => o.status === 'archived').length },
    ];
  });

  function setFilter(filter: 'all' | 'active' | 'fulfilled' | 'archived') {
    activeFilter.value = filter;
  }

  function setSearch(query: string) {
    searchQuery.value = query;
  }

  function clearFilters() {
    activeFilter.value = 'active';
    searchQuery.value = '';
  }

  return {
    activeFilter,
    searchQuery,
    filteredOrders,
    filterTabs,
    setFilter,
    setSearch,
    clearFilters,
  };
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value?.toLowerCase() ?? '';
}
