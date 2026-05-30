<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Reusable, typed button component with multiple variants.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'ghost'
  | 'sm'
  | 'link';

export interface BaseButtonProps {
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const props = withDefaults(defineProps<BaseButtonProps>(), {
  variant: 'secondary',
  disabled: false,
  loading: false,
  type: 'button',
});

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();

function handleClick(event: MouseEvent) {
  if (!props.disabled && !props.loading) {
    emit('click', event);
  }
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'base-button',
      `variant-${variant}`,
      { loading, disabled: disabled || loading }
    ]"
    @click="handleClick"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.55rem 1.1rem;
  font-size: 0.95rem;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.base-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.variant-primary {
  background: #667eea;
  color: white;
}

.variant-primary:hover:not(:disabled) {
  background: #5a6fd6;
}

.variant-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.variant-secondary:hover:not(:disabled) {
  background: #e5e7eb;
}

.variant-success {
  background: #10b981;
  color: white;
}

.variant-success:hover:not(:disabled) {
  background: #059669;
}

.variant-danger {
  background: #ef4444;
  color: white;
}

.variant-danger:hover:not(:disabled) {
  background: #dc2626;
}

.variant-ghost {
  background: transparent;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.variant-ghost:hover:not(:disabled) {
  background: #f3f4f6;
}

.variant-sm {
  padding: 0.35rem 0.65rem;
  font-size: 0.85rem;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #e5e7eb;
}

.variant-sm:hover:not(:disabled) {
  background: #e5e7eb;
}

.variant-link {
  background: transparent;
  color: #667eea;
  padding: 0.25rem 0.5rem;
  font-size: 0.9rem;
}

.variant-link:hover:not(:disabled) {
  text-decoration: underline;
  background: transparent;
}

.spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
