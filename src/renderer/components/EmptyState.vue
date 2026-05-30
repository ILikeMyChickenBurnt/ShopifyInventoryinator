<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Reusable empty state component.
 */

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
}

defineProps<EmptyStateProps>();

const emit = defineEmits<{
  (e: 'action'): void;
}>();
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">{{ icon || '📭' }}</div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <BaseButton
      v-if="actionLabel"
      variant="primary"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </BaseButton>
  </div>
</template>

<script lang="ts">
import BaseButton from './BaseButton.vue';
</script>

<style scoped>
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  opacity: 0.7;
}

.empty-title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: #374151;
}

.empty-description {
  margin: 0 0 1.25rem;
  font-size: 0.95rem;
  max-width: 320px;
  margin-left: auto;
  margin-right: auto;
}
</style>
