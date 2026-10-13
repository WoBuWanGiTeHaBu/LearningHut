<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import Icon from './Icon.vue'

export interface ConfirmOpts {
  title?: string
  /** 主文案：说清「要做什么」 */
  message: string
  /** 补充说明：说清「影响范围」，比如「及其全部子目标」 */
  detail?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：用暖红强调，按钮实心 */
  danger?: boolean
}

const open = ref(false)
const o = ref<ConfirmOpts>({ message: '' })
const okBtn = ref<HTMLButtonElement>()
let resolver: ((v: boolean) => void) | null = null

const iconName = computed(() => (o.value.danger ? 'trash' : 'info'))

function ask(opts: ConfirmOpts): Promise<boolean> {
  o.value = {
    title: opts.title || (opts.danger ? '确认删除' : '确认操作'),
    confirmText: opts.confirmText || (opts.danger ? '删除' : '确定'),
    cancelText: opts.cancelText || '取消',
    ...opts
  }
  open.value = true
  // 焦点落在确认按钮上，回车就能确认
  nextTick(() => okBtn.value?.focus())
  return new Promise(res => { resolver = res })
}

function settle(v: boolean) {
  if (!open.value) return
  open.value = false
  resolver?.(v)
  resolver = null
}
const ok = () => settle(true)
const cancel = () => settle(false)

defineExpose({ ask })
</script>

<template>
  <div v-if="open" class="overlay" style="z-index: 300;" @mousedown.self="cancel">
    <div class="modal cf" :class="{ danger: o.danger }" @keydown.esc="cancel">
      <div class="cf-badge">
        <Icon :name="iconName" :size="20" />
      </div>
      <h3 class="cf-title">{{ o.title }}</h3>
      <p class="cf-msg">{{ o.message }}</p>
      <p class="cf-detail" v-if="o.detail">{{ o.detail }}</p>
      <div class="cf-foot">
        <button class="btn" @click="cancel">{{ o.cancelText }}</button>
        <button ref="okBtn" class="btn cf-ok" :class="o.danger ? 'danger-solid' : 'primary'" @click="ok">
          {{ o.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 比通用 Modal 更紧凑：一句话确认，不该占满整屏 */
.cf {
  width: min(408px, calc(100vw - 80px));
  padding: 28px 28px 20px;
  text-align: center;
  animation: popIn .2s ease;
}
.cf-badge {
  width: 46px; height: 46px; margin: 0 auto 14px;
  border-radius: 15px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--grass) 18%, transparent);
  color: var(--leaf);
}
.cf.danger .cf-badge {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
}
.cf-title { font-size: 16px; font-weight: 650; color: var(--ink); margin-bottom: 8px; letter-spacing: .01em; }
.cf-msg { font-size: 13.5px; color: var(--ink-2); line-height: 1.65; }
.cf-msg b { color: var(--ink); font-weight: 600; }
.cf-detail {
  margin-top: 9px;
  font-size: 12px; color: var(--ink-3); line-height: 1.6;
  background: var(--tint); border-radius: 9px; padding: 7px 12px;
}
.cf.danger .cf-detail { background: color-mix(in srgb, var(--danger) 8%, transparent); color: var(--err); }
.cf-foot { display: flex; gap: 10px; margin-top: 22px; }
.cf-foot .btn { flex: 1; justify-content: center; padding: 7px 14px; }
/* 危险按钮：实心陶红，只在确认框里出现，避免界面上到处都是红 */
.btn.danger-solid {
  background: var(--danger); border-color: var(--danger); color: var(--on-danger);
}
.btn.danger-solid:hover { background: color-mix(in srgb, var(--danger) 80%, var(--ink)); border-color: color-mix(in srgb, var(--danger) 80%, var(--ink)); color: var(--on-danger); }
.btn.danger-solid:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 28%, transparent); }
.cf-ok:focus-visible { outline: none; }
</style>
