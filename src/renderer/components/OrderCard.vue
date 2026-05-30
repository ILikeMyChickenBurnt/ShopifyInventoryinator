<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Composite for the Orders view.
 */

import ProgressBar from './ProgressBar.vue';
import StatusBadge from './StatusBadge.vue';
import BaseButton from './BaseButton.vue';
import type { Order } from '../types';

const props = defineProps<{
  order: Order;
  busyAction?: 'archive' | 'unarchive' | null;
}>();

const emit = defineEmits<{
  (e: 'archive', orderId: string): void;
  (e: 'unarchive', orderId: string): void;
  (e: 'open-shopify', url: string): void;
  (e: 'copy-link', url: string): void;
}>();

function archive() {
  if (props.order.status === 'fulfilled') {
    emit('archive', props.order.order_id);
  }
}

function unarchive() {
  emit('unarchive', props.order.order_id);
}
</script>

<template>
  <div :class="['order-card', order.status]">
    <div class="order-header">
      <div class="order-info">
        <span class="order-name">{{ order.order_name }}</span>
        <span class="order-date">{{ order.order_date }}</span>
      </div>

      <div class="order-header-actions">
        <BaseButton
          v-if="order.shopifyAdminUrl"
          variant="sm"
          @click="$emit('copy-link', order.shopifyAdminUrl)"
        >
          📋
        </BaseButton>
        <BaseButton
          v-if="order.shopifyAdminUrl"
          variant="sm"
          @click="$emit('open-shopify', order.shopifyAdminUrl)"
        >
          🔗
        </BaseButton>

        <BaseButton
          v-if="order.status === 'archived'"
          variant="secondary"
          :loading="busyAction === 'unarchive'"
          :disabled="Boolean(busyAction)"
          @click="unarchive"
        >
          ↩️ Restore
        </BaseButton>
        <BaseButton
          v-else
          variant="secondary"
          :loading="busyAction === 'archive'"
          :disabled="Boolean(busyAction) || order.status !== 'fulfilled'"
          @click="archive"
        >
          📁 Archive
        </BaseButton>

        <StatusBadge :status="order.status" />
      </div>
    </div>

    <div class="order-progress">
      <ProgressBar
        :made="order.fulfilled_items"
        :total="order.total_items"
        label="left"
      />
    </div>

    <div class="order-line-items">
      <div
        v-for="item in order.lineItems.slice(0, 3)"
        :key="item.line_item_id"
        :class="['line-item', { fulfilled: item.fulfilled_quantity >= item.quantity }]"
      >
        <div class="line-item-image">
          <img
            v-if="item.image_url"
            :src="item.image_url"
            :alt="item.product_title"
            loading="lazy"
          />
          <div v-else class="no-image-small">📦</div>
        </div>
        <div class="line-item-info">
          <span class="line-item-title">{{ item.product_title }}</span>
          <span v-if="item.variant_title" class="line-item-variant">{{ item.variant_title }}</span>
        </div>
        <div class="line-item-progress">
          <span :class="['line-item-qty', { complete: item.fulfilled_quantity >= item.quantity }]">
            {{ item.fulfilled_quantity }}/{{ item.quantity }}
          </span>
          <span v-if="item.fulfilled_quantity >= item.quantity" class="check-mark">✓</span>
        </div>
      </div>
      <div v-if="order.lineItems.length > 3" class="more-items">
        +{{ order.lineItems.length - 3 }} more items
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-card {
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 1rem;
  border-left: 5px solid #e5e7eb;
}

.order-card.fulfilled { border-left-color: #10b981; }
.order-card.archived { border-left-color: #9ca3af; opacity: 0.85; }

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.order-info {
  display: flex;
  flex-direction: column;
}

.order-name {
  font-weight: 600;
  color: #1f2937;
}

.order-date {
  font-size: 0.8rem;
  color: #6b7280;
}

.order-header-actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}

.order-progress {
  margin-bottom: 1rem;
}

.order-line-items {
  border-top: 1px solid #f3f4f6;
  padding-top: 0.75rem;
}

.line-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0;
  font-size: 0.9rem;
}

.line-item.fulfilled {
  opacity: 0.75;
}

.line-item-image {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: #f3f4f6;
}

.line-item-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image-small {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: #9ca3af;
}

.line-item-info {
  flex: 1;
  min-width: 0;
}

.line-item-title {
  display: block;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.line-item-variant {
  font-size: 0.75rem;
  color: #9ca3af;
}

.line-item-progress {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #6b7280;
}

.line-item-qty.complete {
  color: #059669;
  font-weight: 600;
}

.more-items {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
}
</style>
