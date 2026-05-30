<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Reusable filter button group with counts.
 */

export interface FilterTab {
  key: string;
  label: string;
  count: number;
}

export interface FilterTabsProps {
  modelValue: string;
  tabs: FilterTab[];
  activeClass?: string;
}

withDefaults(defineProps<FilterTabsProps>(), {
  activeClass: 'active',
});

const emit = defineEmits<{
  (e: 'update:modelValue', key: string): void;
}>();

function selectTab(key: string) {
  emit('update:modelValue', key);
}
</script>

<template>
  <div class="filters">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="['filter-btn', { [activeClass]: modelValue === tab.key }]"
      @click="selectTab(tab.key)"
    >
      {{ tab.label }} ({{ tab.count }})
    </button>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.filter-btn {
  padding: 0.5rem 1rem;
  border: 2px solid #e5e7eb;
  background: white;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  color: #374151;
}

.filter-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.filter-btn.active {
  background: #667eea;
  border-color: #667eea;
  color: white;
}
</style>
