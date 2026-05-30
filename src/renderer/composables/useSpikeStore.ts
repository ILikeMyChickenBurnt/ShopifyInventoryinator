/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Lightweight shared store for global concerns in the renderer (last sync time, loading, actions).
 */
import { reactive, readonly } from 'vue';

interface SpikeStoreState {
  lastSyncTime: string | null;
  isSyncing: boolean;
  lastAction: string | null;
  isLoading: boolean;
}

const state = reactive<SpikeStoreState>({
  lastSyncTime: null,
  isSyncing: false,
  lastAction: null,
  isLoading: false,
});

export function useSpikeStore() {
  function setLastSyncTime(time: string) {
    state.lastSyncTime = time;
  }

  function setSyncing(value: boolean) {
    state.isSyncing = value;
  }

  function setLastAction(action: string) {
    state.lastAction = action;
  }

  function setLoading(value: boolean) {
    state.isLoading = value;
  }

  function recordSync() {
    state.lastSyncTime = new Date().toLocaleTimeString();
    state.lastAction = 'sync';
  }

  function recordAction(action: string) {
    state.lastAction = action;
  }

  return {
    state: readonly(state),
    setLastSyncTime,
    setSyncing,
    setLastAction,
    setLoading,
    recordSync,
    recordAction,
  };
}
