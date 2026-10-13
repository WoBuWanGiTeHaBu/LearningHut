<script setup lang="ts">
import { toasts } from '../toast'
import Icon from './Icon.vue'
</script>

<template>
  <div class="toast-host">
    <transition-group name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
        <span class="t-ic"><Icon :name="t.kind === 'err' ? 'alert' : 'check'" :size="13" /></span>
        <span class="t-text">{{ t.text }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: 30px;
  transform: translateX(-50%);
  z-index: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--card);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 8px 18px 8px 12px;
  box-shadow: var(--shadow-2);
  font-size: 13px;
  color: var(--ink-2);
  max-width: min(520px, calc(100vw - 80px));
}
.t-ic {
  flex: none;
  width: 21px; height: 21px;
  border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--grass) 20%, transparent);
  color: var(--leaf);
}
.toast.err .t-ic { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
.t-text { min-width: 0; }

.toast-enter-active, .toast-leave-active { transition: all .28s cubic-bezier(.22, 1, .36, 1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px) scale(.96); }
</style>
