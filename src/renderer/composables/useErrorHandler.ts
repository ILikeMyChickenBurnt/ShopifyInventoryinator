/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Simple error handling composable for consistent error capture and surfacing.
 */
import { ref } from 'vue';
import { useNotifications } from './useNotifications';

export interface ErrorHandlerOptions {
  showToast?: boolean;
  toastType?: 'error' | 'info';
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const { showToast = true, toastType = 'error' } = options;
  const { addToast } = useNotifications();

  const lastError = ref<unknown>(null);
  const lastErrorMessage = ref<string | null>(null);

  function handleError(error: unknown, customMessage?: string) {
    lastError.value = error;
    const message = customMessage || getErrorMessage(error);
    lastErrorMessage.value = message;

    if (showToast) {
      addToast(message, toastType);
    }

    console.error('[Renderer Error]', error);
  }

  function clearError() {
    lastError.value = null;
    lastErrorMessage.value = null;
  }

  return {
    lastError,
    lastErrorMessage,
    handleError,
    clearError,
  };
}

function getErrorMessage(error: unknown): string {
  if (!error) return 'An unknown error occurred';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || 'An unexpected error occurred';
  if (hasStringProperty(error, 'message')) {
    return error.message;
  }
  if (hasStringProperty(error, 'error')) {
    return error.error;
  }
  return 'An unexpected error occurred';
}

function hasStringProperty<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return typeof value === 'object' && value !== null && typeof (value as Record<K, unknown>)[key] === 'string';
}
