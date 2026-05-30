/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composable for handling sync + refresh flows.
 */
import { ref } from 'vue';
import { useSpikeStore } from './useSpikeStore';
import type { InventoryPayload, OrderRow, SyncResult, TaskRow } from '../types';

type RefreshTask = TaskRow;
type RefreshOrder = OrderRow;
type RefreshInventory = InventoryPayload['inventory'];
type RefreshSuccess = { success: true };
type RefreshFailure = { success: false; error: unknown };

export function useSync() {
  const { state: spikeStoreState, recordSync, recordAction, setSyncing, setLoading } = useSpikeStore();

  const syncLoading = ref(false);
  const lastSyncResult = ref<string>('');

  async function performSyncAndRefresh(
    onSyncSuccess?: (result: SyncResult) => Promise<void> | void,
    onRefreshData?: () => Promise<void> | void
  ): Promise<SyncResult> {
    try {
      syncLoading.value = true;
      setSyncing(true);
      lastSyncResult.value = '';

      const result = await window.api.syncFromShopify();

      if (result.success) {
        lastSyncResult.value = result.data.message;
        recordSync();

        if (onSyncSuccess) {
          await onSyncSuccess(result);
        }

        if (onRefreshData) {
          await onRefreshData();
        }

        lastSyncResult.value += ' — Views updated with live data';
      } else {
        lastSyncResult.value = 'Error: ' + (result.error || 'Unknown error');
      }

      return result;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      lastSyncResult.value = 'Failed: ' + message;
      console.error('Sync failed', e);
      return { success: false, error: message };
    } finally {
      syncLoading.value = false;
      setSyncing(false);
    }
  }

  async function refreshAllData(
    fetchTasks: () => Promise<RefreshTask[]>,
    fetchOrders: () => Promise<RefreshOrder[]>,
    fetchInventory: () => Promise<RefreshInventory>,
    setters: {
      setTasks: (data: RefreshTask[]) => void;
      setOrders: (data: RefreshOrder[]) => void;
      setInventory: (data: RefreshInventory) => void;
    }
  ): Promise<RefreshSuccess | RefreshFailure> {
    try {
      setLoading(true);
      recordAction('global-refresh');

      const [tasks, orders, inventory] = await Promise.all([
        fetchTasks(),
        fetchOrders(),
        fetchInventory()
      ]);

      setters.setTasks(tasks);
      setters.setOrders(orders);
      setters.setInventory(inventory);

      recordAction('global-refresh-complete');
      return { success: true };
    } catch (error) {
      console.error('Global data refresh failed', error);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  }

  return {
    syncLoading,
    lastSyncResult,
    performSyncAndRefresh,
    refreshAllData,
    spikeStoreState,
  };
}
