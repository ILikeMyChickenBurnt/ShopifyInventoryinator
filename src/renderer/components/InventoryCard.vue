<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Simple card for the Inventory view.
 */

import BaseButton from './BaseButton.vue';
import type { InventoryItem } from '../types';

defineProps<{
  item: InventoryItem;
}>();

const emit = defineEmits<{
  (e: 'copy-link', item: InventoryItem): void;
}>();
</script>

<template>
  <div :class="['inventory-card', { 'out-of-stock': item.inventory_quantity <= 0 }]">
    <div class="inventory-card-image">
      <img
        v-if="item.image_url"
        :src="item.image_url"
        :alt="item.product_title"
        loading="lazy"
      />
      <div v-else class="no-image">📦</div>
    </div>

    <div class="inventory-card-info">
      <h3 class="inventory-product-title">{{ item.product_title }}</h3>
      <span v-if="item.variant_title" class="inventory-variant-title">{{ item.variant_title }}</span>
      <span v-if="item.sku" class="inventory-sku">SKU: {{ item.sku }}</span>
    </div>

    <div class="inventory-card-actions">
      <BaseButton
        variant="sm"
        @click="emit('copy-link', item)"
      >
        📋
      </BaseButton>
    </div>

    <div :class="['inventory-card-quantity', { zero: item.inventory_quantity <= 0 }]">
      <span class="quantity-value">{{ item.inventory_quantity }}</span>
      <span class="quantity-label">in stock</span>
    </div>
  </div>
</template>

<style scoped>
.inventory-card {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.inventory-card.out-of-stock {
  opacity: 0.7;
}

.inventory-card-image {
  width: 100%;
  height: 110px;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
}

.inventory-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 2rem;
  color: #9ca3af;
}

.inventory-card-info {
  flex: 1;
}

.inventory-product-title {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #1f2937;
  line-height: 1.2;
}

.inventory-variant-title,
.inventory-sku {
  display: block;
  font-size: 0.8rem;
  color: #6b7280;
}

.inventory-card-actions {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
}

.inventory-card-quantity {
  align-self: flex-end;
  background: #f3f4f6;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.inventory-card-quantity.zero {
  background: #fee2e2;
  color: #991b1b;
}

.quantity-value {
  font-weight: 600;
  color: #1f2937;
}

.inventory-card-quantity.zero .quantity-value {
  color: #991b1b;
}
</style>
