/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composable for debounced search input.
 * Returns both the immediate value and the debounced value.
 */
import { ref, watch, onUnmounted } from 'vue';

export function useDebouncedSearch(initialValue: string = '', debounceMs: number = 300) {
  const searchQuery = ref(initialValue);
  const debouncedSearch = ref(initialValue);

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watch(searchQuery, (newValue) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedSearch.value = newValue;
    }, debounceMs);
  });

  onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  function setSearch(value: string) {
    searchQuery.value = value;
  }

  function clearSearch() {
    searchQuery.value = '';
    debouncedSearch.value = '';
  }

  return {
    searchQuery,
    debouncedSearch,
    setSearch,
    clearSearch,
  };
}
