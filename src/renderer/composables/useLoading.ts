/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Focused loading state composable for individual components or sections.
 */
import { ref } from 'vue';

export function useLoading(initialLoading = false, initialMessage: string | null = null) {
  const isLoading = ref(initialLoading);
  const loadingMessage = ref<string | null>(initialMessage);

  function startLoading(message: string | null = null) {
    isLoading.value = true;
    if (message !== null) loadingMessage.value = message;
  }

  function stopLoading() {
    isLoading.value = false;
    loadingMessage.value = null;
  }

  function setLoading(loading: boolean, message: string | null = null) {
    isLoading.value = loading;
    loadingMessage.value = message;
  }

  return {
    isLoading,
    loadingMessage,
    startLoading,
    stopLoading,
    setLoading,
  };
}
