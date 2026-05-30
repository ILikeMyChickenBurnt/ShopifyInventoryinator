/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composable for task filtering + search state.
 */
import { ref, computed, type Ref } from 'vue';

type SearchableTask = {
  status: string;
  product_title?: string | null;
  variant_title?: string | null;
  sku?: string | null;
};

export interface UseTaskFiltersOptions<T extends SearchableTask> {
  tasks: Ref<T[]>;
  initialFilter?: 'all' | 'active' | 'completed';
}

export function useTaskFilters<T extends SearchableTask>(options: UseTaskFiltersOptions<T>) {
  const { tasks, initialFilter = 'active' } = options;

  const activeFilter = ref<'all' | 'active' | 'completed'>(initialFilter);
  const searchQuery = ref('');

  const filteredTasks = computed(() => {
    let result = tasks.value;

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      result = result.filter(t =>
        normalizeSearchValue(t.product_title).includes(q) ||
        normalizeSearchValue(t.variant_title).includes(q) ||
        normalizeSearchValue(t.sku).includes(q)
      );
    }

    if (activeFilter.value === 'active') {
      result = result.filter(t => t.status === 'pending' || t.status === 'in_progress');
    } else if (activeFilter.value === 'completed') {
      result = result.filter(t => t.status === 'completed');
    }

    return result;
  });

  const filterTabs = computed(() => [
    { key: 'all', label: 'All', count: tasks.value.length },
    { key: 'active', label: 'Active', count: tasks.value.filter(t => t.status === 'pending' || t.status === 'in_progress').length },
    { key: 'completed', label: 'Completed', count: tasks.value.filter(t => t.status === 'completed').length },
  ]);

  function setFilter(filter: 'all' | 'active' | 'completed') {
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
    filteredTasks,
    filterTabs,
    setFilter,
    setSearch,
    clearFilters,
  };
}

function normalizeSearchValue(value: string | null | undefined): string {
  return value?.toLowerCase() ?? '';
}
