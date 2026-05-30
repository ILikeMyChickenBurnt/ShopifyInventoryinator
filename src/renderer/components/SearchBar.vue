<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Reusable, debounced search input.
 */

import { ref, watch, onUnmounted } from 'vue';

export interface SearchBarProps {
  modelValue?: string;
  placeholder?: string;
  debounceMs?: number;
}

const props = withDefaults(defineProps<SearchBarProps>(), {
  modelValue: '',
  placeholder: 'Search...',
  debounceMs: 300,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'search', value: string): void;
  (e: 'clear'): void;
}>();

const localValue = ref(props.modelValue);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function handleInput() {
  emit('update:modelValue', localValue.value);

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit('search', localValue.value);
  }, props.debounceMs);
}

function clearSearch() {
  localValue.value = '';
  emit('update:modelValue', '');
  emit('search', '');
  emit('clear');
}

watch(() => props.modelValue, (newVal) => {
  localValue.value = newVal;
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});
</script>

<template>
  <div class="search-bar">
    <div class="search-input-wrapper">
      <span class="search-icon">🔍</span>
      <input
        v-model="localValue"
        type="text"
        :placeholder="placeholder"
        class="search-input"
        @input="handleInput"
      />
      <button
        v-if="localValue"
        class="search-clear"
        title="Clear search"
        @click="clearSearch"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-bar {
  max-width: 100%;
  margin-bottom: 1rem;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: #9ca3af;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.6rem 2.5rem;
  font-size: 0.95rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #667eea;
}

.search-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  font-size: 1.4rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.search-clear:hover {
  color: #6b7280;
}
</style>
