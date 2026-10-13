<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import RecordModal from '../components/RecordModal.vue'
import type { StudyRecord } from '../../../shared/types'
import Icon from '../components/Icon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'

const records = ref<StudyRecord[]>([])
const showNew = ref(false)
const editing = ref<StudyRecord | null>(null)
const month = ref(new Date().toISOString().slice(0, 7))
const qTag = ref('')
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const list = computed(() =>
  qTag.value ? records.value.filter(r => r.tags.includes(qTag.value)) : records.value
)
const monthTotal = computed(() => list.value.reduce((s, r) => s + (r.duration_min || 0), 0))

async function load() {
  const [y, m] = month.value.split('-').map(Number)
  const from = `${month.value}-01`
  const to = new Date(y, m, 0).toISOString().slice(0, 10)
  records.value = await api.records.list({ from, to }, store.domain)
}
onMounted(load)
watch(() => store.domain, load)

function prevMonth() {
  const [y, m] = month.value.split('-').map(Number)
  month.value = `${m === 1 ? y - 1 : y}-${m === 1 ? 12 : m - 1 < 10 ? '0' + (m - 1) : m - 1}`
  load()
}
function nextMonth() {
  const [y, m] = month.value.split('-').map(Number)
  month.value = `${m === 12 ? y + 1 : y}-${m === 12 ? '01' : m + 1 < 10 ? '0' + (m + 1) : m + 1}`
  load()
}

async function del(r: StudyRecord) {
  const ok = await confirmDlg.value?.ask({
    message: '删除这条学习记录？',
    detail: r.content
      ? `「${r.content.slice(0, 36)}${r.content.length > 36 ? '…' : ''}」${r.duration_min ? ` · ${r.duration_min} 分钟` : ''}`
      : `这条记录只记了时间${r.duration_min ? `（${r.duration_min} 分钟）` : ''}。`,
    danger: true
  })
  if (!ok) return
  await api.records.remove(r.id)
  await load()
  toast('已删除记录')
}

function edit(r: StudyRecord) { editing.value = r; showNew.value = true }
function newRecord() { editing.value = null; showNew.value = true }
</script>

<template>
  <div class="page records-page">
    <div class="page-head">
      <h1>学习记录</h1>
      <span class="sub">本月 {{ list.length }} 条 · 累计 {{ monthTotal }} 分钟</span>
      <span class="spacer"></span>
      <div class="month-nav">
        <button class="btn ghost sm" @click="prevMonth">‹</button>
        <input v-model="month" type="month" class="input month-pick" @change="load" />
        <button class="btn ghost sm" @click="nextMonth">›</button>
      </div>
      <button class="btn primary" @click="newRecord"><Icon name="plus" :size="14" /> 写记录</button>
    </div>

    <div class="tags" v-if="records.length">
      <button class="chip tag-f" :class="{ on: !qTag }" @click="qTag = ''">全部</button>
      <button v-for="t in [...new Set(records.flatMap(r => r.tags))]" :key="t"
        class="chip tag-f" :class="{ on: qTag === t }" @click="qTag = t">{{ t }}</button>
    </div>

    <div class="card paper-lines list-card" style="padding: 8px 18px;">
      <div v-if="!list.length" class="empty">
        <div class="leaf-mark">✎</div>
        这个月还没有记录
      </div>
      <div v-for="r in list" :key="r.id" class="row-item rec">
        <span class="date">{{ r.date }}</span>
        <span class="dur" v-if="r.duration_min">{{ r.duration_min }} 分钟</span>
        <div class="body">
          <p>{{ r.content }}</p>
          <div class="chips" v-if="r.tags.length">
            <span v-for="t in r.tags" :key="t" class="chip">{{ t }}</span>
          </div>
        </div>
        <div class="ops">
          <button class="btn ghost sm" title="编辑" @click="edit(r)"><Icon name="edit" :size="13" /></button>
          <button class="btn ghost sm" title="删除" @click="del(r)"><Icon name="trash" :size="13" /></button>
        </div>
      </div>
    </div>

    <RecordModal v-if="showNew" :record="editing" @close="showNew = false; editing = null" @saved="load" />
    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.records-page { overflow: hidden; }
.records-page .list-card { flex: 1; min-height: 0; overflow-y: auto; }
.records-page .tags { flex: none; }
.month-nav { display: flex; align-items: center; gap: 2px; }
.month-pick { width: 130px; padding: 4px 8px; font-size: 13px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.tag-f { cursor: pointer; border: 1px solid transparent; background: color-mix(in srgb, var(--hl) 35%, transparent); }
.tag-f.on { background: var(--deep); color: var(--on-deep); }
.rec { align-items: flex-start; padding: 12px 4px; }
.date { font-size: 12px; color: var(--ink-3); flex: none; width: 80px; padding-top: 2px; }
.dur { font-size: 12px; color: var(--leaf); flex: none; width: 62px; padding-top: 2px; }
.body { flex: 1; min-width: 0; }
.body p { font-size: 13.5px; margin-bottom: 4px; white-space: pre-wrap; }
/* 操作按钮常驻可见（原来悬停才出现，等于藏起来） */
.ops { display: flex; gap: 2px; flex: none; }
</style>
