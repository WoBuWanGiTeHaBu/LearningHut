<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'
import { store } from '../store'
import type { SearchResultItem } from '../../../shared/types'
import Icon from './Icon.vue'

const q = ref('')
const hits = ref<SearchResultItem[]>([])
const loading = ref(false)
const router = useRouter()
const inp = ref<HTMLInputElement>()

const KIND_LABEL: Record<string, string> = {
  record: '学习记录', reflection: '感想', note: '便签', material: '资料',
  project: '项目', goal: '目标', event: '大事记', route: '路线', wishlist: '想学'
}

let timer: any
watch(q, v => {
  clearTimeout(timer)
  if (!v.trim()) { hits.value = []; return }
  loading.value = true
  timer = setTimeout(async () => {
    try { hits.value = await api.search(v) } catch { hits.value = [] }
    loading.value = false
  }, 180)
})

function go(h: SearchResultItem) {
  router.push(h.route || '/')
  close()
}
function close() {
  store.searchOpen = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onMounted(() => inp.value?.focus())
</script>

<template>
  <div class="overlay" @mousedown.self="close">
    <div class="panel">
      <div class="bar">
        <Icon name="search" :size="16" />
        <input ref="inp" v-model="q" placeholder="搜索记录、感想、目标、资料……"
          @keydown="onKey" />
      </div>
      <div class="results">
        <div v-if="!q.trim()" class="hint">输入关键词开始搜索（支持 1~2 字的模糊匹配与长词全文匹配）</div>
        <div v-else-if="loading && !hits.length" class="hint">搜索中…</div>
        <div v-else-if="!hits.length" class="hint">没有找到「{{ q }}」相关的内容</div>
        <button v-for="h in hits" :key="h.kind + h.ref_id" class="hit" @click="go(h)">
          <span class="kind">{{ KIND_LABEL[h.kind] || h.kind }}</span>
          <span class="main">
            <span class="t">{{ h.title }}</span>
            <span class="snip" v-if="h.snippet">{{ h.snippet }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  margin-top: -12vh;
  width: min(620px, calc(100vw - 100px));
  background: var(--card);
  border-radius: 16px;
  box-shadow: var(--shadow-2);
  overflow: hidden;
  animation: popIn .2s cubic-bezier(.22, 1, .36, 1);
}
.bar {
  display: flex; align-items: center; gap: 10px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
}
.bar input { flex: 1; border: none; outline: none; font-size: 15px; background: transparent; color: var(--ink); }
.results { max-height: 46vh; overflow-y: auto; padding: 8px; }
.hint { text-align: center; color: var(--ink-3); font-size: 13px; padding: 26px 0; }
.hit {
  display: flex; align-items: center; gap: 12px;
  width: 100%; text-align: left;
  border: none; background: transparent;
  padding: 9px 12px; border-radius: 10px;
  cursor: pointer;
}
.hit:hover { background: var(--tint); }
.kind {
  flex: none; font-size: 11px;
  background: color-mix(in srgb, var(--hl) 45%, transparent);
  color: var(--ink-2);
  padding: 1px 8px; border-radius: 999px;
}
.main { min-width: 0; display: flex; flex-direction: column; }
.t { font-size: 13.5px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.snip { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
