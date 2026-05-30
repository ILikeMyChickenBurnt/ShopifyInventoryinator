/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composable for inventory filtering + search state.
 */
import { ref, computed, type Ref } from 'vue';

type SearchableInventoryItem = {
  inventory_quantity: number;
  image_url?: string | null;
  product_title?: string | null;
  variant_title?: string | null;
  sku?: string | null;
};

export interface UseInventoryFiltersOptions<T extends SearchableInventoryItem> {
  items: Ref<T[]>;
  initialFilter?: 'all' | 'out-of-stock' | 'no-image';
}

export function useInventoryFilters<T extends SearchableInventoryItem>(options: UseInventoryFiltersOptions<T>) {
  const { items, initialFilter = 'all' } = options;

  const activeFilter = ref<'all' | 'out-of-stock' | 'no-image'>(initialFilter);
  const searchQuery = ref('');

  const filteredItems = computed(() => {
    let result = items.value;

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(item =>
        normalizeSearchValue(item.product_title).includes(q) ||
        normalizeSearchValue(item.variant_title).includes(q) ||
        normalizeSearchValue(item.sku).includes(q)
      );
    }

    if (activeFilter.value === 'out-of-stock') {
      result = result.filter(item => item.inventory_quantity <= 0);
    } else if (activeFilter.value === 'no-image') {
      result = result.filter(item => !item.image_url);
    }

    return result;
  });

  const filterTabs = computed(() => [
    { key: 'all', label: 'All', count: items.value.length },
    { key: 'out-of-stock', label: 'Out of Stock', count: items.value.filter(i => i.inventory_quantity <= 0).length },
    { key: 'no-image', label: 'No Image', count: items.value.filter(i => !i.image_url).length },
  ]);

  function setFilter(filter: 'all' | 'out-of-stock' | 'no-image') {
    activeFilter.value = filter;
  }

  function setSearch(query: string) {
    searchQuery.value = query;
  }

  function clearFilters() {
    activeFilter.value = 'all';
    searchQuery.value = '';
  }

  return {
    activeFilter,
    searchQuery,
    filteredItems,
    filterTabs,
    setFilter,
    setSearch,
    clearFilters,
  };
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value?.toLowerCase() ?? '';
}
