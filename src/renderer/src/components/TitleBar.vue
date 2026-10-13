<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'
import { store } from '../store'

// 窗控按钮由应用自绘（不再让系统画 caption overlay）：
// 系统画的那一条永远压在网页之上，弹窗遮罩盖不到右上角，配色也要额外同步。
const isMax = ref(false)
let off: (() => void) | null = null

onMounted(async () => {
  try { isMax.value = await window.api.win.isMaximized() } catch { /* 忽略 */ }
  try { off = window.api.win.onMaxChanged((v: boolean) => { isMax.value = v }) } catch { /* 忽略 */ }
})
onUnmounted(() => { try { off?.() } catch { /* 忽略 */ } })

const minimize = () => window.api.win.minimize()
function toggleMax() {
  window.api.win.toggleMaximize().then((v) => { isMax.value = v }).catch(() => { /* 忽略 */ })
}
const close = () => window.api.win.close()
</script>

<template>
  <header class="titlebar">
    <div class="brand">
      <Icon name="leaf" :size="16" class="brand-ic" />
      <span>Study Helper</span>
    </div>
    <button class="search-btn" @click="store.searchOpen = true">
      <Icon name="search" :size="14" />
      <span>搜索</span>
      <kbd>Ctrl K</kbd>
    </button>
    <div class="winbtns">
      <button class="wb" title="最小化" @click="minimize"><Icon name="min" :size="16" /></button>
      <button class="wb" :title="isMax ? '还原' : '最大化'" @click="toggleMax">
        <Icon :name="isMax ? 'restore' : 'max'" :size="15" />
      </button>
      <button class="wb close" title="关闭" @click="close"><Icon name="close" :size="15" /></button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  padding-left: 14px;
  position: relative;
  z-index: 10;
}
.brand {
  display: flex; align-items: center; gap: 7px;
  font-size: 13px; font-weight: 600; color: var(--ink-2);
  letter-spacing: .05em;
}
.brand-ic { color: var(--leaf); }
.search-btn {
  -webkit-app-region: no-drag;
  margin-left: 26px;
  display: flex; align-items: center; gap: 7px;
  border: 1px solid var(--line-strong);
  background: var(--card);
  color: var(--ink-3);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all .18s;
}
.search-btn:hover { border-color: var(--grass); color: var(--leaf); }
.search-btn kbd {
  font-family: inherit; font-size: 10px;
  background: var(--tint); border-radius: 4px; padding: 0 5px;
  color: var(--ink-3);
}
/* 窗控三件套：贴住标题栏右端，和系统标题栏一样是整块热区 */
.winbtns {
  margin-left: auto;
  height: 100%;
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
}
.wb {
  width: 46px;
  display: grid; place-items: center;
  border: 0; padding: 0;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  transition: background-color .15s, color .15s;
}
.wb:hover { background: var(--tint); color: var(--ink); }
.wb:active { background: var(--line); }
.wb.close:hover { background: var(--danger); color: var(--on-danger); }
</style>
