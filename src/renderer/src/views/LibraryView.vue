<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import type { Material, MaterialType, Goal } from '../../../shared/types'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import TagInput from '../components/TagInput.vue'
import Select from '../components/Select.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'

const TYPE_LABEL: Record<string, string> = { web: '网页', video: '视频', image: '图片', software: '软件', file: '文件' }

const TABS: { key: MaterialType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'web', label: '网页' },
  { key: 'video', label: '视频' },
  { key: 'image', label: '图片' },
  { key: 'software', label: '软件' },
  { key: 'file', label: '文件' }
]
const TYPE_ICON: Record<string, string> = { web: 'external', video: 'play', image: 'book', software: 'bottle', file: 'folder' }

const tab = ref<MaterialType | 'all'>('all')
const list = ref<Material[]>([])
const goals = ref<Goal[]>([])
const routes = ref<any[]>([])
const showForm = ref(false)
const editing = ref<Material | null>(null)
const form = ref<any>({})
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)

async function loadRefs() {
  const [gs, rs] = await Promise.all([
    api.goals.tree(store.domain),
    api.routes.tree(store.domain)
  ])
  goals.value = flatten(gs)
  routes.value = flatten(rs)
}

onMounted(async () => {
  await loadRefs()
  await load()
})

// 切换学习/爱好时，资料库与可关联的目标/路线一起刷新
watch(() => store.domain, async () => {
  await loadRefs()
  await load()
})

function flatten(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flatten(n.children, acc) }
  return acc
}

// 一份资料只能挂一个地方：目标 或 学习路线节点（二选一）
const linkOptions = computed(() => {
  const out: { value: string; label: string }[] = [{ value: 'none', label: '不关联' }]
  for (const g of goals.value) out.push({ value: 'g:' + g.id, label: '目标 · ' + g.title })
  for (const r of routes.value) out.push({ value: 'n:' + r.id, label: '路线 · ' + r.title })
  return out
})
function linkName(m: Material): string {
  if (m.goal_id != null) {
    const g = goals.value.find(x => x.id === m.goal_id)
    return '目标 · ' + (g?.title || ('#' + m.goal_id))
  }
  if (m.route_node_id != null) {
    const r = routes.value.find(x => x.id === m.route_node_id)
    return '路线 · ' + (r?.title || ('#' + m.route_node_id))
  }
  return ''
}

async function load() {
  list.value = await api.materials.list(tab.value === 'all' ? undefined : (tab.value as MaterialType), store.domain)
}

function openForm(m?: Material) {
  editing.value = m || null
  form.value = m
    ? { ...m, _link: m.goal_id != null ? 'g:' + m.goal_id : (m.route_node_id != null ? 'n:' + m.route_node_id : 'none') }
    : { type: tab.value === 'all' ? 'web' : tab.value, title: '', source: '', note: '', _link: 'none', tags: [], domain: store.domain }
  showForm.value = true
}

async function save() {
  if (!form.value.title.trim()) { err.value = '给这份资料起个名字吧'; return }
  err.value = ''
  const payload: any = { ...form.value }
  const link = String(payload._link || 'none')
  delete payload._link
  payload.goal_id = link.startsWith('g:') ? Number(link.slice(2)) : null
  payload.route_node_id = link.startsWith('n:') ? Number(link.slice(2)) : null
  if (editing.value) await api.materials.update(editing.value.id, payload)
  else await api.materials.create(payload)
  showForm.value = false
  await load()
}

// 从磁盘直接导入文件（复制进应用数据目录）
async function importFiles() {
  const created = await api.materials.importFile()
  if (created?.length) await load()
}
const err = ref('')

async function del(m: Material) {
  const ok = await confirmDlg.value?.ask({
    message: `删除资料「${m.title}」？`,
    detail: m.source && !/^https?:/.test(m.source)
      ? '只从资料库里移除这条记录，磁盘上的原文件不会被动。'
      : '删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.materials.remove(m.id)
  await load()
  toast('已删除资料')
}

async function pickPath() {
  if (form.value.type === 'software') {
    const p = await api.dialog.pickFile([{ name: '程序', ext: ['exe', 'lnk'] }, { name: '全部', ext: ['*'] }])
    if (p) { form.value.source = p; if (!form.value.title.trim()) form.value.title = p.split(/[\\/]/).pop() || '' }
  } else {
    const p = await api.dialog.pickFile()
    if (p) { form.value.source = p; if (!form.value.title.trim()) form.value.title = p.split(/[\\/]/).pop() || '' }
  }
}

const needPath = computed(() => ['software', 'file', 'image', 'video'].includes(form.value.type) && !/^https?:/.test(form.value.source || ''))
const pathHint = computed(() => form.value.type === 'software' ? '只记录不启动，打开时会跳到文件所在位置' : '')
</script>

<template>
  <div class="page lib-page">
    <div class="page-head">
      <h1>资料库</h1>
      <span class="sub">网页 / 视频 / 图片 / 软件 / 文件，五类收纳</span>
      <span class="spacer"></span>
      <button class="btn" @click="importFiles"><Icon name="folder" :size="14" /> 导入文件存进来</button>
      <button class="btn primary" @click="openForm()"><Icon name="plus" :size="14" /> 收一份资料</button>
    </div>

    <div class="tabs">
      <button v-for="t in TABS" :key="t.key" class="tb" :class="{ on: tab === t.key }"
        @click="tab = t.key; load()">{{ t.label }}</button>
    </div>

    <div class="grid">
      <div v-if="!list.length" class="empty card" style="grid-column: 1/-1; padding: 40px 0;">
        <div class="leaf-mark">❧</div>
        这一格还空着
      </div>
      <div v-for="m in list" :key="m.id" class="card hover m-card">
        <div class="m-head">
          <span class="m-ic"><Icon :name="TYPE_ICON[m.type] || 'book'" :size="15" /></span>
          <b class="m-title">{{ m.title }}</b>
          <span class="badge" style="font-size: 10px;">{{ m.type }}</span>
        </div>
        <p class="m-note" v-if="m.note">{{ m.note }}</p>
        <p class="m-src" :title="m.source">{{ m.source }}</p>
        <p class="m-link" v-if="linkName(m)"><Icon name="link" :size="11" /> {{ linkName(m) }}</p>
        <div class="chips" v-if="m.tags.length" style="margin-top: 8px;">
          <span v-for="t in m.tags" :key="t" class="chip">{{ t }}</span>
        </div>
        <div class="m-ops">
          <button class="btn sm primary" @click="api.materials.open(m.id)"><Icon name="external" :size="12" /> 打开</button>
          <span class="grow"></span>
          <button class="btn ghost sm" @click="openForm(m)"><Icon name="edit" :size="13" /></button>
          <button class="btn ghost sm" @click="del(m)"><Icon name="trash" :size="13" /></button>
        </div>
      </div>
    </div>

    <Modal v-if="showForm" :title="editing ? '编辑资料' : '收一份资料'" @close="showForm = false">
      <div class="row2">
        <div class="field">
          <label>类型</label>
          <Select v-model="form.type" :options="Object.keys(TYPE_LABEL).map(k => ({ value: k, label: TYPE_LABEL[k] }))" />
        </div>
        <div class="field" style="flex:1;">
          <label>名称</label>
          <input v-model="form.title" class="input" placeholder="这份资料叫什么" />
        </div>
      </div>
      <div class="field">
        <label>位置（网址或路径）</label>
        <div style="display:flex; gap:8px;">
          <input v-model="form.source" class="input" :placeholder="form.type === 'web' ? 'https://…' : '本地路径'" />
          <button v-if="needPath" class="btn" @click="pickPath">浏览…</button>
        </div>
        <span v-if="pathHint" class="hint">{{ pathHint }}</span>
      </div>
      <div class="field">
        <label>备注</label>
        <textarea v-model="form.note" class="textarea" rows="2"></textarea>
      </div>
      <div class="row2">
        <div class="field" style="flex:1.2;">
          <label>关联目标 / 学习路线</label>
          <Select v-model="form._link" :options="linkOptions" />
        </div>
        <div class="field" style="flex:1;">
          <label>标签</label>
          <TagInput v-model="form.tags" />
        </div>
      </div>
      <div class="err-hint" v-if="err">{{ err }}</div>
      <template #foot>
        <button class="btn" @click="showForm = false">取消</button>
        <button class="btn primary" @click="save">收好</button>
      </template>
    </Modal>

    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.lib-page { overflow: hidden; }
.lib-page .grid { flex: 1; min-height: 0; overflow-y: auto; align-content: start; padding-bottom: 4px; }
.tabs { display: flex; gap: 6px; margin-bottom: 16px; }
.tb {
  border: 1px solid var(--line-strong); background: var(--card);
  border-radius: 999px; padding: 5px 16px; font-size: 13px;
  cursor: pointer; color: var(--ink-2); transition: all .16s;
}
.tb:hover { border-color: var(--grass); color: var(--leaf); }
.tb.on { background: var(--deep); border-color: var(--deep); color: var(--on-deep); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.m-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
.m-head { display: flex; align-items: center; gap: 8px; }
.m-ic { color: var(--deep); display: flex; }
.m-title { flex: 1; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-note { font-size: 12.5px; color: var(--ink-2); }
.m-src { font-size: 11.5px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; }
.m-link {
  display: inline-flex; align-items: center; gap: 4px;
  align-self: flex-start;
  font-size: 10.5px; color: var(--lake);
  background: color-mix(in srgb, var(--lake) 9%, transparent);
  border-radius: 999px; padding: 1px 9px; margin-top: 4px;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.m-ops { display: flex; align-items: center; gap: 4px; margin-top: 8px; }
.grow { flex: 1; }
.row2 { display: flex; gap: 12px; }
.hint { font-size: 11.5px; color: var(--ink-3); }
.err-hint { color: var(--err); font-size: 12.5px; text-align: center; }
</style>
