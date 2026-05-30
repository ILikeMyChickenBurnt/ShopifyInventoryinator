<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * The main three-view switcher (Variants / Orders / Inventory).
 */

export interface ViewOption {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

export interface ViewToggleProps {
  modelValue: string;
  views: ViewOption[];
}

defineProps<ViewToggleProps>();

const emit = defineEmits<{
  (e: 'update:modelValue', key: string): void;
}>();
</script>

<template>
  <div class="view-toggle">
    <button
      v-for="view in views"
      :key="view.key"
      :class="['view-btn', { active: modelValue === view.key }]"
      @click="emit('update:modelValue', view.key)"
    >
      <span v-if="view.icon">{{ view.icon }} </span>
      {{ view.label }}
      <span v-if="view.count !== undefined"> ({{ view.count }})</span>
    </button>
  </div>
</template>

<style scoped>
.view-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.view-btn {
  padding: 0.55rem 1.1rem;
  border: 2px solid #e5e7eb;
  background: white;
  border-radius: 8px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.view-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.view-btn.active {
  background: #667eea;
  border-color: #667eea;
  color: white;
}
</style>
