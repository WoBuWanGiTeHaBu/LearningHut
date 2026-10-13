<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: any
  options: { value: any; label: string }[]
  placeholder?: string
  width?: string
}>(), { placeholder: '请选择' })

const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>()

const open = ref(false)
const trigger = ref<HTMLElement>()
const pop = ref<HTMLElement>()
const popStyle = ref<Record<string, string>>({})
const flipUp = ref(false)

const current = computed(() => props.options.find(o => o.value === props.modelValue))

// 估算下拉里最长一条文字需要多宽，避免选项文字被省略号截掉
const estPopW = computed(() => {
  let max = 0
  for (const o of props.options) {
    // 中文按 13.5px 计，西文略窄，缩进空格按 8px 计
    const w = (o.label || '').split('').reduce((s, ch) => s + (ch === '　' ? 8 : ch.charCodeAt(0) > 255 ? 13.5 : 7.2), 0)
    if (w > max) max = w
  }
  return max + 30 // 左右内边距 + 滚动条
})

async function toggle() {
  if (open.value) { open.value = false; return }
  const r = trigger.value!.getBoundingClientRect()
  const estH = Math.min(props.options.length * 34 + 12, 264)
  flipUp.value = r.bottom + estH > innerHeight - 8 && r.top - estH > 8
  // 触发框宽度与"文本所需宽度"取大，最多不超过窗口宽 - 20
  const desired = Math.min(Math.max(r.width, 200, estPopW.value), innerWidth - 20)
  popStyle.value = {
    left: '', top: flipUp.value ? '' : (r.bottom + 6) + 'px',
    bottom: flipUp.value ? (innerHeight - r.top + 6) + 'px' : '',
    width: desired + 'px',
    maxWidth: (innerWidth - 20) + 'px'
  }
  open.value = true
  await nextTick()
  // 水平方向：优先左对齐触发框，越界则贴右边
  if (pop.value) {
    const pw = pop.value.offsetWidth
    let left = r.left
    if (left + pw > innerWidth - 10) left = Math.max(10, innerWidth - 10 - pw)
    popStyle.value = { ...popStyle.value, left: left + 'px' }
  }
  requestAnimationFrame(() => document.addEventListener('mousedown', onDoc, true))
}
function onDoc(e: MouseEvent) {
  const t = e.target as HTMLElement
  if (trigger.value?.contains(t) || t.closest?.('.sel-pop')) return
  open.value = false
}
function pick(v: any) {
  emit('update:modelValue', v)
  open.value = false
}
function onScrollClose() { open.value = false }
window.addEventListener('resize', onScrollClose)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc, true)
  window.removeEventListener('resize', onScrollClose)
})
</script>

<template>
  <span ref="trigger" class="sel" :class="{ on: open }" @click="toggle">
    <span class="sel-label" :class="{ ph: !current }">{{ current?.label || placeholder }}</span>
    <svg class="sel-arrow" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
  </span>
  <Teleport to="body">
    <div v-if="open" ref="pop" class="sel-pop" :style="popStyle">
      <button v-for="o in options" :key="String(o.value)" class="sel-opt"
        :class="{ sel: o.value === modelValue }" @click="pick(o.value)">{{ o.label }}</button>
      <div v-if="!options.length" class="sel-empty">没有可选项</div>
    </div>
  </Teleport>
</template>

<style scoped>
.sel {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-s);
  padding: 6px 11px;
  background: var(--card);
  font-size: 13.5px;
  color: var(--ink);
  cursor: pointer;
  transition: border-color .16s, box-shadow .16s;
  min-height: 33px;
  user-select: none;
  max-width: 100%;
}
.sel:hover { border-color: var(--grass); }
.sel.on { border-color: var(--grass); box-shadow: 0 0 0 3px color-mix(in srgb, var(--grass) 18%, transparent); }
.sel-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sel-label.ph { color: var(--ink-3); }
.sel-arrow { color: var(--ink-3); flex: none; transition: transform .16s; }
.sel.on .sel-arrow { transform: rotate(180deg); }
</style>

<style>
.sel-pop {
  position: fixed;
  z-index: 300;
  background: var(--card);
  border-radius: 10px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-2);
  padding: 5px;
  max-height: 264px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  animation: popIn .16s cubic-bezier(.22, 1, .36, 1);
}
.sel-opt {
  border: none; background: transparent; text-align: left;
  padding: 6px 11px; border-radius: 7px;
  font-size: 13.5px; color: var(--ink); cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: none;
}
.sel-opt:hover { background: var(--tint); }
.sel-opt.sel { background: color-mix(in srgb, var(--hl) 50%, transparent); font-weight: 600; }
.sel-empty { text-align: center; color: var(--ink-3); font-size: 12.5px; padding: 10px 0; }
</style>
