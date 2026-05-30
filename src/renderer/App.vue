<script setup lang="ts">
/**
 * Production root App.vue for the new modern renderer.
 *
 * This is the primary application shell for the modern renderer.
 */

import { computed, ref, onMounted } from 'vue';
import { useNotifications } from './composables/useNotifications';
import { useSpikeStore } from './composables/useSpikeStore';
import { useLoading } from './composables/useLoading';
import type { InventoryItem, OperationResult, Order, OrderRow, Task, TaskRow } from './types';

// Production components
import ViewToggle from './components/ViewToggle.vue';
import BaseButton from './components/BaseButton.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';

// Production views
import VariantsView from './views/VariantsView.vue';
import OrdersView from './views/OrdersView.vue';
import InventoryView from './views/InventoryView.vue';

const { toasts, addToast, removeToast } = useNotifications();
const { state: spikeStoreState, recordAction } = useSpikeStore();

// Loading state for production data
const { isLoading: isLoadingProductionData, startLoading, stopLoading } = useLoading();
const { isLoading: isRefreshingInventory, startLoading: startInventoryRefresh, stopLoading: stopInventoryRefresh } = useLoading();

// Production view switching
const currentProductionView = ref<'variants' | 'orders' | 'inventory'>('variants');

const productionViews = [
  { key: 'variants', label: 'Variants', icon: '📦' },
  { key: 'orders', label: 'Orders', icon: '📋' },
  { key: 'inventory', label: 'Inventory', icon: '📊' },
];

// Real data for production views
const productionTasks = ref<Task[]>([]);
const productionOrders = ref<Order[]>([]);
const productionInventory = ref<InventoryItem[]>([]);
const loadErrorMessage = ref<string | null>(null);
const activeTaskAction = ref<{ variantId: string; action: 'mark-made' | 'mark-complete' | 'reset' } | null>(null);
const activeOrderAction = ref<{ orderId: string; action: PendingOrderAction } | null>(null);

type PendingOrderAction = 'archive' | 'unarchive';
const confirmArchiveOpen = ref(false);
const pendingOrderAction = ref<{ orderId: string; action: PendingOrderAction } | null>(null);

type ReadResult<T> = OperationResult<T>;

function mapTaskRow(task: TaskRow): Task {
  return {
    variant_id: task.variant_id,
    product_title: task.product_title,
    variant_title: task.variant_title,
    sku: task.sku,
    image_url: task.image_url,
    made_quantity: task.made_quantity,
    total_quantity: task.total_quantity,
    remaining_quantity: task.remaining_quantity,
    status: task.status,
  };
}

function mapOrderRow(order: OrderRow): Order {
  return {
    order_id: order.order_id,
    order_name: order.order_name,
    order_date: order.order_date,
    status: order.status,
    fulfilled_items: order.fulfilled_items,
    total_items: order.total_items,
    remaining_items: order.remaining_items,
    shopifyAdminUrl: order.shopifyAdminUrl,
    lineItems: Array.isArray(order.lineItems) ? order.lineItems : [],
  };
}

const pendingOrder = computed(() => {
  if (!pendingOrderAction.value) {
    return null;
  }

  return productionOrders.value.find((order) => order.order_id === pendingOrderAction.value?.orderId) ?? null;
});

const confirmDialogTitle = computed(() => {
  if (pendingOrderAction.value?.action === 'unarchive') {
    return 'Restore archived order?';
  }

  return 'Archive fulfilled order?';
});

const confirmDialogMessage = computed(() => {
  const orderLabel = pendingOrder.value?.order_name || 'this order';

  if (pendingOrderAction.value?.action === 'unarchive') {
    return `${orderLabel} will return to the active orders list.`;
  }

  return `${orderLabel} will be moved out of the active orders list. You can restore it later if needed.`;
});

const confirmButtonLabel = computed(() => pendingOrderAction.value?.action === 'unarchive' ? 'Restore order' : 'Archive order');

function unwrapResultData<T>(result: ReadResult<T>, fallbackMessage: string): T {
  if (!result.success || result.data === undefined) {
    throw new Error(result.error || fallbackMessage);
  }

  return result.data;
}

async function loadProductionData() {
  startLoading('Loading data from Shopify...');
  loadErrorMessage.value = null;
  try {
    const [tasksResult, ordersResult, inventoryResult] = await Promise.all([
      window.api.getTasks(),
      window.api.getOrders(),
      window.api.getInventory()
    ]);

    const tasks = unwrapResultData(tasksResult, 'Failed to load tasks');
    const orders = unwrapResultData(ordersResult, 'Failed to load orders');
    const inventoryPayload = unwrapResultData(inventoryResult, 'Failed to load inventory');

    productionTasks.value = tasks.map(mapTaskRow);
    productionOrders.value = orders.map(mapOrderRow);

    productionInventory.value = Array.isArray(inventoryPayload.inventory) ? inventoryPayload.inventory : [];
  } catch (error) {
    console.error('Failed to load production data', error);
    loadErrorMessage.value = 'The production renderer could not load Shopify data. Try refreshing again.';
    addToast('Failed to load data from Shopify', 'error');
  } finally {
    stopLoading();
  }
}

async function handleProductionMarkMade(variantId: string, qty: number) {
  activeTaskAction.value = { variantId, action: 'mark-made' };
  try {
    await window.api.markMade(variantId, qty);
    addToast(`+${qty} recorded`, 'success', 2000);
    await loadProductionData(); // refresh
  } catch {
    addToast('Failed to record made quantity', 'error');
  } finally {
    activeTaskAction.value = null;
  }
}

async function handleProductionComplete(variantId: string) {
  activeTaskAction.value = { variantId, action: 'mark-complete' };
  try {
    await window.api.markComplete(variantId);
    addToast('Task completed', 'success');
    await loadProductionData();
  } catch {
    addToast('Failed to complete task', 'error');
  } finally {
    activeTaskAction.value = null;
  }
}

async function handleProductionReset(variantId: string) {
  activeTaskAction.value = { variantId, action: 'reset' };
  try {
    await window.api.resetTask(variantId);
    addToast('Task reset', 'info');
    await loadProductionData();
  } catch {
    addToast('Failed to reset task', 'error');
  } finally {
    activeTaskAction.value = null;
  }
}

async function archiveOrder(orderId: string) {
  activeOrderAction.value = { orderId, action: 'archive' };
  try {
    await window.api.archiveOrder(orderId);
    addToast('Order archived', 'success');
    await loadProductionData();
  } catch {
    addToast('Failed to archive order', 'error');
  } finally {
    activeOrderAction.value = null;
  }
}

async function unarchiveOrder(orderId: string) {
  activeOrderAction.value = { orderId, action: 'unarchive' };
  try {
    await window.api.unarchiveOrder(orderId);
    addToast('Order restored', 'success');
    await loadProductionData();
  } catch {
    addToast('Failed to restore order', 'error');
  } finally {
    activeOrderAction.value = null;
  }
}

async function handleProductionInventoryRefresh() {
  startInventoryRefresh('Refreshing inventory...');
  try {
    const freshResult = await window.api.getInventory();
    const freshPayload = unwrapResultData(freshResult, 'Failed to load inventory');
    productionInventory.value = Array.isArray(freshPayload.inventory) ? freshPayload.inventory : [];
    addToast('Inventory refreshed', 'success');
  } catch {
    addToast('Failed to refresh inventory', 'error');
  } finally {
    stopInventoryRefresh();
  }
}

async function handleGlobalRefresh() {
  if (isLoadingProductionData.value) {
    return;
  }

  addToast('Refreshing all data...', 'info', 1500);
  await loadProductionData();

  if (!loadErrorMessage.value) {
    addToast('All views refreshed', 'success');
  }
}

function retryProductionLoad() {
  void handleGlobalRefresh();
}

function promptOrderAction(orderId: string, action: PendingOrderAction) {
  pendingOrderAction.value = { orderId, action };
  confirmArchiveOpen.value = true;
}

function resetPendingOrderAction() {
  confirmArchiveOpen.value = false;
  pendingOrderAction.value = null;
}

async function confirmPendingOrderAction() {
  const nextAction = pendingOrderAction.value;

  if (!nextAction) {
    return;
  }

  if (nextAction.action === 'archive') {
    await archiveOrder(nextAction.orderId);
  } else {
    await unarchiveOrder(nextAction.orderId);
  }

  resetPendingOrderAction();
}

onMounted(() => {
  void loadProductionData();
  recordAction('production-renderer-mounted');
});
</script>

<template>
  <div class="production-bridge">
    <!-- Production header -->
    <header class="production-header">
      <div class="header-left">
        <strong>Production Renderer</strong>
        <span v-if="spikeStoreState.lastSyncTime" class="last-sync">
          Last sync: {{ spikeStoreState.lastSyncTime }}
        </span>
      </div>
      <div class="header-right">
        <BaseButton
          variant="secondary"
          :loading="isLoadingProductionData"
          :disabled="isLoadingProductionData"
          @click="handleGlobalRefresh"
        >
          {{ isLoadingProductionData ? 'Refreshing...' : '↻ Refresh All' }}
        </BaseButton>
      </div>
    </header>

    <div v-if="loadErrorMessage" class="shell-error-banner" role="alert">
      <strong>Production data load failed.</strong>
      <span>{{ loadErrorMessage }}</span>
    </div>

    <!-- Production ViewToggle -->
    <ViewToggle
      v-model="currentProductionView"
      :views="productionViews"
    />

    <!-- Active Production View -->
    <div class="production-content">
      <section v-show="currentProductionView === 'variants'">
        <VariantsView
          :tasks="productionTasks"
          :loading="isLoadingProductionData"
          :error-message="loadErrorMessage"
          :active-task-action="activeTaskAction"
          @retry="retryProductionLoad"
          @mark-made="handleProductionMarkMade"
          @mark-complete="handleProductionComplete"
          @reset="handleProductionReset"
        />
      </section>

      <section v-show="currentProductionView === 'orders'">
        <OrdersView
          :orders="productionOrders"
          :loading="isLoadingProductionData"
          :error-message="loadErrorMessage"
          :active-order-action="activeOrderAction"
          @retry="retryProductionLoad"
          @archive="promptOrderAction($event, 'archive')"
          @unarchive="promptOrderAction($event, 'unarchive')"
        />
      </section>

      <section v-show="currentProductionView === 'inventory'">
        <InventoryView
          :items="productionInventory"
          :loading="isLoadingProductionData || isRefreshingInventory"
          :refreshing="isRefreshingInventory"
          :error-message="loadErrorMessage"
          @retry="retryProductionLoad"
          @refresh="handleProductionInventoryRefresh"
        />
      </section>
    </div>

    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast">
        <button
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', `toast-${toast.type}`]"
          type="button"
          @click="removeToast(toast.id)"
        >
          <span class="toast-message">{{ toast.message }}</span>
          <span class="toast-close" aria-hidden="true">×</span>
        </button>
      </TransitionGroup>
    </div>

    <ConfirmDialog
      v-model="confirmArchiveOpen"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      :confirm-text="confirmButtonLabel"
      cancel-text="Keep current state"
      :variant="pendingOrderAction?.action === 'archive' ? 'danger' : 'primary'"
      @confirm="confirmPendingOrderAction"
      @cancel="resetPendingOrderAction"
    />
  </div>
</template>

<style scoped>
.production-bridge {
  max-width: 100%;
}

.production-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.header-left strong {
  font-size: 1.1rem;
}

.last-sync {
  font-size: 0.8rem;
  color: #6b7280;
}

.production-content {
  min-height: 400px;
}

.shell-error-banner {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #991b1b;
}

.toast-stack {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 11000;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: min(26rem, calc(100vw - 2rem));
}

.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  border: 1px solid transparent;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
  background: white;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
}

.toast-success {
  border-color: #a7f3d0;
  background: #ecfdf5;
}

.toast-error {
  border-color: #fecaca;
  background: #fef2f2;
}

.toast-info {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.toast-message {
  font: inherit;
}

.toast-close {
  font-size: 1.1rem;
  line-height: 1;
  opacity: 0.55;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.toast-move {
  transition: transform 0.2s ease;
}
</style>

