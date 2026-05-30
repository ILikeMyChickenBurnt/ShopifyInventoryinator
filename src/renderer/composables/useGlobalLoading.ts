/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Simple global loading state for coordinating loading indicators across the app.
 */
import { ref } from 'vue';

const globalLoading = ref(false);
const loadingMessage = ref<string | null>(null);

export function useGlobalLoading() {
  function setGlobalLoading(isLoading: boolean, message: string | null = null) {
    globalLoading.value = isLoading;
    loadingMessage.value = message;
  }

  function clearGlobalLoading() {
    globalLoading.value = false;
    loadingMessage.value = null;
  }

  return {
    globalLoading,
    loadingMessage,
    setGlobalLoading,
    clearGlobalLoading,
  };
}
