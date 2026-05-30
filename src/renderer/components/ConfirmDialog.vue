<script setup lang="ts">
/**
 * Production version - migrated from the Phase 3 spike prototype.
 * 
 * Reusable confirmation modal to replace native window.confirm().
 * Fully typed and accessible.
 */

import { ref, watch } from 'vue';
import BaseButton from './BaseButton.vue';

export interface ConfirmDialogProps {
  modelValue: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'warning';
}

const props = withDefaults(defineProps<ConfirmDialogProps>(), {
  title: 'Please confirm',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  variant: 'primary',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const isOpen = ref(props.modelValue);

function close() {
  emit('update:modelValue', false);
  emit('cancel');
}

function dismiss() {
  emit('update:modelValue', false);
}

function confirmAction() {
  emit('confirm');
  dismiss();
}

watch(() => props.modelValue, (val) => {
  isOpen.value = val;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="confirm-overlay" @click.self="close">
        <div class="confirm-dialog" role="dialog" aria-modal="true" :aria-labelledby="'confirm-title'">
          <div class="confirm-header">
            <h3 :id="'confirm-title'" class="confirm-title">{{ title }}</h3>
          </div>

          <div class="confirm-body">
            <p>{{ message }}</p>
          </div>

          <div class="confirm-actions">
            <BaseButton variant="secondary" @click="close">
              {{ cancelText }}
            </BaseButton>
            <BaseButton
              :variant="variant === 'danger' ? 'danger' : 'primary'"
              @click="confirmAction"
            >
              {{ confirmText }}
            </BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.confirm-dialog {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  margin: 1rem;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  overflow: hidden;
}

.confirm-header {
  padding: 1.25rem 1.5rem 0.75rem;
  border-bottom: 1px solid #e5e7eb;
}

.confirm-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
}

.confirm-body {
  padding: 1.25rem 1.5rem;
  color: #4b5563;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  background: #f9fafb;
  border-top: 1px solid #e5e7eb;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
