/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Simple notification / toast system.
 */
import { ref, type Ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const toasts: Ref<Toast[]> = ref([]);
let nextId = 1;

export function useNotifications() {
  function addToast(message: string, type: 'success' | 'error' | 'info' = 'info', timeoutMs = 3000) {
    const id = nextId++;
    const toast: Toast = { id, message, type };
    toasts.value.push(toast);

    if (timeoutMs > 0) {
      setTimeout(() => {
        removeToast(id);
      }, timeoutMs);
    }

    return id;
  }

  function removeToast(id: number) {
    const index = toasts.value.findIndex(t => t.id === id);
    if (index !== -1) {
      toasts.value.splice(index, 1);
    }
  }

  function clearAll() {
    toasts.value = [];
  }

  return {
    toasts,
    addToast,
    removeToast,
    clearAll,
  };
}
