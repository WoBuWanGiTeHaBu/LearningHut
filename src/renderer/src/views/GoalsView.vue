<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { api } from '../api'
import { store } from '../store'
import GoalNode from '../components/GoalNode.vue'
import InputDialog from '../components/InputDialog.vue'
import MaterialLinkPanel from '../components/MaterialLinkPanel.vue'
import Modal from '../components/Modal.vue'
import Select from '../components/Select.vue'
import Icon from '../components/Icon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'
import { useSplit } from '../useSplit'
import type { Goal, EventItem, StudyRecord, Reflection, GoalProgress, RecSummary } from '../../../shared/types'

// 左右分栏：默认 左 1 : 右 1.15（与最初版式一致），可拖拽调节并记住
const colsEl = ref<HTMLElement | null>(null)
const { dragging: splitDragging, onDown: onSplitDown, gridStyle: splitStyle } = useSplit('sh-split-goals', 0.465, colsEl)

const tree = ref<any[]>([])
const events = ref<EventItem[]>([])
const sel = ref<Goal | null>(null)
const expanded = ref<Set<number>>(new Set())
const showEventForm = ref(false)
const showDone = ref(false)
const filter = ref<'all' | 'active'>('all')
const evForm = ref({ date: new Date().toISOString().slice(0, 10), title: '', description: '' })
const editForm = ref<any>({ title: '', description: '', status: 'active', target_total: 0, target_unit: '', start_date: '', due_date: '' })
// 关联学习记录
const recData = ref<{ records: StudyRecord[]; reflections: Reflection[] }>({ records: [], reflections: [] })
const recSummary = ref<RecSummary | null>(null)
const recScope = ref<'all' | 'node'>('all')   // 含子目标 / 只看本层
const showRecDetail = ref(false)              // 摘要默认折叠，点「看具体」才展开明细
// 量化进度
const progList = ref<GoalProgress[]>([])
const showProg = ref(false)
const progSign = ref<'plus' | 'minus'>('plus')
const progCount = ref<number | ''>('')
const progDate = ref(new Date().toISOString().slice(0, 10))

const nameDlg = ref<InstanceType<typeof InputDialog> | null>(null)
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)
// 右侧「名称」输入框：从树里点「编辑」就聚焦到这里
const titleInput = ref<HTMLInputElement | null>(null)

async function load() {
  tree.value = await api.goals.tree(store.domain)
  if (sel.value) {
    const flat = flatten(tree.value)
    sel.value = flat.find((g: Goal) => g.id === sel.value!.id) || null
  }
  // 没选中时默认挑第一个进行中的目标，右侧详情不留空
  if (!sel.value && tree.value.length) {
    sel.value = flatten(tree.value).find((g: Goal) => g.status !== 'done') || null
  }
  if (sel.value) await pick(sel.value)
  else events.value = await api.goals.events(null)
}
onMounted(load)
watch(() => store.domain, load)

function flatten(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flatten(n.children, acc) }
  return acc
}

// 进行中的树 / 已完成列表
const activeTree = computed(() => {
  const walk = (list: any[]): any[] => list
    .filter(n => n.status !== 'done')
    .map(n => ({ ...n, children: walk(n.children || []) }))
  return walk(tree.value)
})
const doneList = computed(() => flatten(tree.value).filter(g => g.status === 'done'))

async function pick(g: Goal) {
  sel.value = g
  editForm.value = {
    title: g.title, description: g.description, status: g.status,
    target_total: g.target_total || 0, target_unit: g.target_unit || '',
    start_date: g.start_date || '', due_date: g.due_date || ''
  }
  showRecDetail.value = false
  recScope.value = 'all'
  events.value = await api.goals.events(g.id)
  await loadRecs()
  progList.value = g.target_total > 0 ? await api.goals.progressList(g.id) : []
}

// 学习记录：摘要 + 明细分开取（摘要轻、明细重，默认只看摘要）
async function loadRecs() {
  if (!sel.value) return
  const id = sel.value.id
  const only = recScope.value === 'node'
  const [d, s] = await Promise.all([
    showRecDetail.value ? api.records.forGoal(id, { only }) : Promise.resolve(null),
    api.records.summaryForGoal(id)
  ])
  if (d) recData.value = d
  recSummary.value = s
}
// 资料面板增删后只刷新树（角标 mat_count），不动右栏的选择状态
async function refreshTree() {
  tree.value = await api.goals.tree(store.domain)
  if (sel.value) {
    const flat = flatten(tree.value)
    sel.value = flat.find((g: Goal) => g.id === sel.value!.id) || null
  }
}
watch([recScope, showRecDetail], loadRecs)

function toggle(g: any) {
  const s = expanded.value
  s.has(g.id) ? s.delete(g.id) : s.add(g.id)
  expanded.value = new Set(s)
}

async function addGoal(parent: Goal | null) {
  const title = await nameDlg.value?.ask()
  if (!title?.trim()) return
  await api.goals.create({ title: title.trim(), parent_id: parent?.id ?? null, domain: store.domain })
  if (parent) expanded.value.add(parent.id)
  await load()
}

async function saveEdit() {
  if (!sel.value) return
  await api.goals.update(sel.value.id, { ...editForm.value })
  await load()
  toast('已保存修改')
}

// 勾选完成 / 取消完成
async function check(g: Goal) {
  await api.goals.update(g.id, { status: g.status === 'done' ? 'active' : 'done' })
  await load()
}

// 选中一个目标，并把焦点送到右侧「名称」框——这就是树里「编辑」按钮的去处
async function editGoal(g: Goal) {
  await pick(g)
  await nextTick()
  const el = titleInput.value
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.focus()
    el.select()
  }
}

// 数一数连带删掉多少子目标，让确认框把影响说清楚
function countKids(g: any): number {
  let n = 0
  const walk = (x: any) => { for (const c of x.children || []) { n++; walk(c) } }
  walk(g)
  return n
}

async function delGoal(g: Goal) {
  const kids = countKids(g)
  const ok = await confirmDlg.value?.ask({
    message: `删除目标「${g.title}」？`,
    detail: kids
      ? `连它下面的 ${kids} 个子目标一起删除，量化进度一并清掉（学习记录会保留，只是不再关联它）。删除后无法恢复。`
      : '量化进度会一并清掉，学习记录会保留。删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.goals.remove(g.id)
  sel.value = null
  await load()
  toast('已删除目标')
}

// ---------- 大事记 ----------
// 表单既用于新增也用于编辑：editingEvent 非空就是编辑态
const editingEvent = ref<number | null>(null)

function openEventForm(ev?: EventItem) {
  if (ev) {
    editingEvent.value = ev.id
    evForm.value = { date: ev.date, title: ev.title, description: ev.description || '' }
  } else {
    editingEvent.value = null
    evForm.value = { date: new Date().toISOString().slice(0, 10), title: '', description: '' }
  }
  showEventForm.value = true
}

async function saveEvent() {
  if (!evForm.value.title.trim()) return
  if (editingEvent.value) {
    await api.goals.updateEvent(editingEvent.value, { ...evForm.value })
  } else {
    await api.goals.addEvent({ ...evForm.value, goal_id: sel.value?.id ?? null })
  }
  const wasEdit = !!editingEvent.value
  evForm.value = { date: new Date().toISOString().slice(0, 10), title: '', description: '' }
  editingEvent.value = null
  showEventForm.value = false
  await load()
  toast(wasEdit ? '已保存修改' : '已记下这个时刻')
}

async function delEvent(ev: EventItem) {
  const ok = await confirmDlg.value?.ask({
    message: `删除大事记「${ev.title}」？`,
    detail: ev.date ? `${ev.date}${ev.description ? ' · ' + ev.description : ''}` : '',
    danger: true
  })
  if (!ok) return
  await api.goals.removeEvent(ev.id)
  await load()
  toast('已删除')
}

// ---------- 量化进度 ----------
const curQty = computed(() => Math.max(0, Math.round(sel.value?.rec_qty || 0)))
const qtyPct = computed(() => {
  const t = sel.value?.target_total || 0
  if (!t) return 0
  return Math.min(100, Math.round((curQty.value / t) * 100))
})
const previewTotal = computed(() => {
  const n = Number(progCount.value) || 0
  return progSign.value === 'plus' ? curQty.value + n : Math.max(0, curQty.value - n)
})
function openProg() {
  progSign.value = 'plus'
  progCount.value = ''
  progDate.value = new Date().toISOString().slice(0, 10)
  showProg.value = true
}
async function saveProg() {
  if (!sel.value) return
  const n = Number(progCount.value) || 0
  if (!n) return
  await api.goals.addProgress(sel.value.id, {
    date: progDate.value,
    delta: progSign.value === 'plus' ? n : -n
  })
  showProg.value = false
  await load()
}
async function delProg(p: GoalProgress) {
  if (!sel.value) return
  const ok = await confirmDlg.value?.ask({
    message: '撤销这条进度记录？',
    detail: `${p.date} · ${p.delta > 0 ? '+' : ''}${p.delta}${sel.value.target_unit || ''}`,
    confirmText: '撤销',
    danger: true
  })
  if (!ok) return
  await api.goals.removeProgress(p.id, sel.value.id)
  await load()
  toast('已撤销这条进度')
}

const statusOptions = [
  { value: 'active', label: '进行中' },
  { value: 'paused', label: '暂停' },
  { value: 'done', label: '完成' },
  { value: 'abandoned', label: '放弃' }
]
const totalMin = computed(() => recScope.value === 'node'
  ? (recSummary.value?.own_minutes || 0)
  : (recSummary.value?.minutes || 0))
// 展示口径跟着「含子目标 / 只看本层」走，数字和按钮上的角标一致
const shownCount = computed(() => recScope.value === 'node'
  ? (recSummary.value?.own_count || 0)
  : (recSummary.value?.count || 0))
const shownRefl = computed(() => recSummary.value?.refl || 0)
const durText = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + m % 60 + 'm' : ''}` : `${m}min`

// ---------- 时间量化提醒 ----------
function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dayDiff(a: string, b: string): number {
  const A = new Date(a + 'T00:00:00'), B = new Date(b + 'T00:00:00')
  if (isNaN(A.getTime()) || isNaN(B.getTime())) return 0
  return Math.round((B.getTime() - A.getTime()) / 86400000)
}
const timeInfo = computed(() => {
  const g = sel.value
  if (!g) return null
  const start = g.start_date || '', due = g.due_date || ''
  if (!start && !due) return null
  const today = todayLocal()
  const elapsed = start ? dayDiff(start, today) : null             // 已过天数
  const total = start && due ? Math.max(1, dayDiff(start, due)) : null
  const left = due ? dayDiff(today, due) : null                    // 剩余天数（负 = 超期）
  const timePct = (total != null && elapsed != null)
    ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
    : null
  return { start, due, today, elapsed, total, left, timePct }
})
// 把「时间推进」和「量化完成度」摆在一起，说清是快了还是慢了
const timeNotes = computed<{ tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[]>(() => {
  const g = sel.value, t = timeInfo.value
  if (!g || !t) return []
  const out: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = []
  const done = g.status === 'done'
  const unit = g.target_unit || ''
  const hasQty = g.target_total > 0
  const qtyPct = hasQty ? Math.min(100, Math.round((Math.max(0, Number(g.rec_qty || 0)) / g.target_total) * 100)) : null

  if (t.elapsed != null) out.push({ tone: 'info', text: `已开始 ${Math.max(0, t.elapsed)} 天` })
  if (t.left != null) {
    if (done) out.push({ tone: 'ok', text: t.left >= 0 ? `在目标时间前完成，还剩 ${t.left} 天余量` : `比目标时间晚了 ${-t.left} 天完成` })
    else if (t.left > 0) out.push({ tone: (t.timePct ?? 0) > 80 ? 'warn' : 'info', text: `距目标时间还有 ${t.left} 天` })
    else if (t.left === 0) out.push({ tone: 'warn', text: '今天就是目标时间' })
    else out.push({ tone: 'bad', text: `已超期 ${-t.left} 天` })
  }
  if (hasQty && qtyPct != null && t.timePct != null && !done) {
    const gap = qtyPct - t.timePct
    if (gap >= 8) {
      out.push({ tone: 'ok', text: `进度比时间快约 ${gap}%，保持这个节奏` })
    } else if (gap <= -8) {
      const remainQty = Math.max(0, g.target_total - Number(g.rec_qty || 0))
      const perDay = (t.left != null && t.left > 0) ? Math.ceil(remainQty / t.left) : null
      out.push({ tone: 'bad', text: perDay ? `进度落后约 ${-gap}%，按剩余时间每天还需完成 ${perDay}${unit}` : `进度落后约 ${-gap}%` })
    } else {
      out.push({ tone: 'info', text: '进度与时间基本同步' })
    }
  }
  if (hasQty && !done && !t.due && t.elapsed != null && t.elapsed > 0) {
    const avg = Math.round((Number(g.rec_qty || 0) / t.elapsed) * 10) / 10
    const remain = Math.max(0, g.target_total - Number(g.rec_qty || 0))
    if (avg > 0) out.push({ tone: 'info', text: `日均 ${avg}${unit}，按这个速度还需约 ${Math.ceil(remain / avg)} 天` })
    else out.push({ tone: 'warn', text: '开始有一阵了，还没有量化进度 —— 记一笔进度吧' })
  }
  return out
})
const timePctShown = computed(() => timeInfo.value?.timePct ?? null)
const qtyPctShown = computed(() => {
  const g = sel.value
  if (!g || !(g.target_total > 0)) return null
  return Math.min(100, Math.round((Math.max(0, Number(g.rec_qty || 0)) / g.target_total) * 100))
})
</script>

<template>
  <div class="page goals-page">
    <div class="page-head">
      <h1>目标</h1>
      <span class="sub">{{ store.domain === 'study' ? '学习' : '爱好' }}目标 · 打勾即完成，量化进度直接在这里记</span>
      <span class="spacer"></span>
      <div class="f-chips" v-if="tree.length">
        <button class="chip f-chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button class="chip f-chip" :class="{ on: filter === 'active' }" @click="filter = 'active'">进行中</button>
      </div>
      <button class="btn primary" @click="addGoal(null)"><Icon name="plus" :size="14" /> 新目标</button>
    </div>

    <div class="cols" ref="colsEl" :class="{ dragging: splitDragging }" :style="splitStyle">
      <!-- 左：树（满高，内部滚动） -->
      <section class="card tree-card paper-grid">
        <div v-if="!tree.length" class="empty">
          <div class="leaf-mark">❧</div>
          还没有目标<br />目标可以一层层展开子目标
        </div>
        <GoalNode v-for="g in (filter === 'all' ? tree : activeTree)" :key="g.id" :g="g" :depth="0"
          :expanded="expanded" :sel="sel"
          @toggle="toggle" @pick="pick" @add="addGoal" @del="delGoal" @check="check" @edit="editGoal" />

        <!-- 已完成：可折叠分组，不干扰找进行中的目标 -->
        <div v-if="doneList.length && filter === 'all'" class="done-group">
          <button class="done-head" @click="showDone = !showDone">
            <span>已完成 {{ doneList.length }}</span>
            <span class="arr">{{ showDone ? '▾' : '▸' }}</span>
          </button>
          <template v-if="showDone">
            <div v-for="g in doneList" :key="g.id" class="done-item" :class="{ on: sel?.id === g.id }" @click="pick(g)">
              <span class="chk ok">✓</span>
              <span class="t">{{ g.title }}</span>
              <span class="d">{{ (g.created_at || '').slice(0, 10) }}</span>
            </div>
          </template>
        </div>
      </section>

      <!-- 中：拖拽条，调左右比例 -->
      <div class="splitter" title="拖动调整左右宽度" @pointerdown="onSplitDown"><i></i></div>

      <!-- 右：详情 + 量化 + 学习记录 + 大事记 -->
      <section class="right-col">
        <div class="card pad detail" v-if="sel">
          <div class="d-head">
            <h2>{{ sel.title }}</h2>
            <span class="badge" :class="sel.status">{{ { active: '进行中', paused: '暂停', done: '完成', abandoned: '放弃' }[sel.status] }}</span>
          </div>

          <!-- 量化进度面板 -->
          <div class="pp" v-if="sel.target_total > 0">
            <div class="pp-top">
              <div class="pp-num">
                <b>{{ curQty }}</b><span class="pp-total">/ {{ sel.target_total }}{{ sel.target_unit }}</span>
              </div>
              <div class="pp-pct">{{ qtyPct }}%</div>
            </div>
            <div class="progress big"><i :style="{ width: qtyPct + '%' }"></i></div>
            <div class="pp-act">
              <button class="btn primary sm" @click="openProg"><Icon name="plus" :size="12" /> 记一笔进度</button>
              <span class="pp-left">还剩 {{ Math.max(0, sel.target_total - curQty) }}{{ sel.target_unit }}</span>
            </div>
            <div class="pp-list" v-if="progList.length">
              <div v-for="p in progList.slice(0, 6)" :key="p.id" class="pp-row">
                <span class="pp-date">{{ p.date }}</span>
                <span class="pp-delta" :class="{ minus: p.delta < 0 }">{{ p.delta > 0 ? '+' : '' }}{{ p.delta }}{{ sel.target_unit }}</span>
                <button class="btn ghost sm" title="删除这条" @click="delProg(p)"><Icon name="trash" :size="12" /></button>
              </div>
            </div>
          </div>

          <!-- 时间与节奏：起始 / 目标时间 + 时间量化提醒 -->
          <div class="tp" v-if="timeInfo">
            <div class="tp-head">
              <span class="tp-title">时间与节奏</span>
              <span class="tp-range">{{ timeInfo.start || '未设起始' }} → {{ timeInfo.due || '未设目标时间' }}</span>
            </div>
            <div class="tp-bars">
              <div class="tp-bar">
                <span class="tp-lb">时间</span>
                <div class="progress"><i class="t" :style="{ width: (timePctShown ?? 0) + '%' }"></i></div>
                <span class="tp-num">{{ timePctShown != null ? timePctShown + '%' : '—' }}</span>
              </div>
              <div class="tp-bar" v-if="qtyPctShown != null">
                <span class="tp-lb">进度</span>
                <div class="progress"><i class="q" :style="{ width: qtyPctShown + '%' }"></i></div>
                <span class="tp-num">{{ qtyPctShown }}%</span>
              </div>
            </div>
            <div class="tp-notes">
              <span v-for="(n, i) in timeNotes" :key="i" class="tp-note" :class="n.tone">{{ n.text }}</span>
            </div>
          </div>
          <div class="tp-hint" v-else>
            <Icon name="calendar" :size="13" /> 设一个「起始时间」（可选再设「目标时间」），就能按时间盯进度、收量化提醒
          </div>

          <div class="edit-form">
            <div class="field">
              <label>名称</label>
              <input ref="titleInput" v-model="editForm.title" class="input" />
            </div>
            <div class="field">
              <label>说明</label>
              <textarea v-model="editForm.description" class="textarea" rows="2" placeholder="这个目标是什么、为什么想学…"></textarea>
            </div>
            <div class="row">
              <div class="field grow">
                <label>状态</label>
                <Select v-model="editForm.status" :options="statusOptions" />
              </div>
              <div class="field grow">
                <label>起始时间</label>
                <input v-model="editForm.start_date" type="date" class="input" />
              </div>
              <div class="field grow">
                <label>目标时间</label>
                <input v-model="editForm.due_date" type="date" class="input" />
              </div>
            </div>
            <div class="row">
              <div class="field" style="width: 120px;">
                <label>量化总量</label>
                <input v-model="editForm.target_total" type="number" min="0" class="input" placeholder="如 200" />
              </div>
              <div class="field" style="width: 96px;">
                <label>单位</label>
                <input v-model="editForm.target_unit" class="input" placeholder="p / 集" />
              </div>
              <div class="field grow date-quick">
                <button class="btn soft sm" @click="editForm.start_date = todayLocal()"><Icon name="calendar" :size="12" /> 起始设为今天</button>
                <button class="btn ghost sm" v-if="editForm.start_date || editForm.due_date"
                  @click="editForm.start_date = ''; editForm.due_date = ''">清空时间</button>
              </div>
            </div>
            <div class="hint" v-if="!(sel.target_total > 0)">
              填一个「量化总量」+ 单位（如 200 p），这个目标就能按进度推进了
            </div>
            <div class="edit-actions">
              <button class="btn primary sm" @click="saveEdit">保存修改</button>
              <button class="btn sm" @click="addGoal(sel)"><Icon name="plus" :size="12" /> 子目标</button>
              <span class="sp"></span>
              <button class="btn sm danger" @click="delGoal(sel)"><Icon name="trash" :size="12" /> 删除</button>
            </div>
          </div>
        </div>
        <div class="card pad" v-else>
          <div class="empty">从左边选一个目标，或新建一个</div>
        </div>

        <!-- 学习记录：默认只给摘要，点「看具体」才展开明细 -->
        <div class="card pad footprint" v-if="sel">
          <div class="fp-head">
            <div class="fp-title">学习足迹</div>
            <!-- 统计范围切换：独立的胶囊开关，不再挤在标题里 -->
            <div class="scope-seg" v-if="sel.children?.length">
              <button :class="{ on: recScope === 'all' }" @click="recScope = 'all'">
                含子目标
                <em v-if="recSummary?.count">{{ recSummary.count }}</em>
              </button>
              <button :class="{ on: recScope === 'node' }" @click="recScope = 'node'">
                只看本层
                <em v-if="recSummary?.own_count">{{ recSummary.own_count }}</em>
              </button>
            </div>
          </div>

          <div class="fp-stats">
            <div class="fp-stat">
              <b>{{ shownCount }}</b>
              <span>次学习</span>
            </div>
            <i class="fp-div"></i>
            <div class="fp-stat">
              <b>{{ durText(totalMin) }}</b>
              <span>累计时长</span>
            </div>
            <i class="fp-div"></i>
            <div class="fp-stat">
              <b>{{ shownRefl }}</b>
              <span>条感想</span>
            </div>
            <template v-if="sel.target_total > 0">
              <i class="fp-div"></i>
              <div class="fp-stat">
                <b>{{ curQty }}</b>
                <span>{{ sel.target_unit || '量化' }}完成</span>
              </div>
            </template>
          </div>

          <div class="fp-note" v-if="recScope === 'all' && sel.children?.length">
            含 {{ recSummary?.own_count || 0 }} 条记在本目标 + 所有子目标
          </div>

          <button class="fp-toggle" @click="showRecDetail = !showRecDetail">
            <span class="chev" :class="{ open: showRecDetail }">›</span>
            {{ showRecDetail ? '收起具体记录' : '看具体记录' }}
          </button>

          <div class="fp-detail" v-if="showRecDetail">
            <div v-for="r in recData.records.slice(0, 40)" :key="r.id" class="fp-row">
              <span class="fp-row-date">{{ r.date }}</span>
              <div class="fp-row-body">
                <p>{{ r.content || '（只记了时间）' }}<i v-if="r.duration_min"> · {{ durText(r.duration_min) }}</i></p>
              </div>
            </div>
            <p v-if="!recData.records.length" class="none">还没有学习记录关联到这个目标</p>
            <div v-for="rf in recData.reflections.slice(0, 8)" :key="'rf' + rf.id" class="fp-refl">「{{ rf.content }}」</div>
          </div>
        </div>

        <!-- 关联资料：和学习路线共用资料库，这里新增/关联都会写回资料库 -->
        <div class="card pad" v-if="sel">
          <MaterialLinkPanel :goal-id="sel.id" :domain="store.domain"
            :top-level="tree.some((g: any) => g.id === sel.id)" @changed="refreshTree" />
        </div>

        <!-- 大事记 -->
        <div class="card pad paper-diamond">
          <div class="card-title">大事记 {{ sel ? `· ${sel.title}` : '· 全部' }}</div>
          <div v-if="!events.length && !showEventForm" class="empty" style="padding: 18px 0;">还没有记下重要时刻</div>
          <div v-for="ev in events" :key="ev.id" class="row-item">
            <span class="ev-date">{{ ev.date }}</span>
            <div class="ev-body">
              <b>{{ ev.title }}</b>
              <p v-if="ev.description">{{ ev.description }}</p>
            </div>
            <span class="ev-ops">
              <button title="编辑" @click="openEventForm(ev)"><Icon name="edit" :size="12" /></button>
              <button class="del" title="删除" @click="delEvent(ev)"><Icon name="trash" :size="12" /></button>
            </span>
          </div>
          <div v-if="showEventForm" class="ev-form">
            <input v-model="evForm.date" type="date" class="input" />
            <input v-model="evForm.title" class="input" placeholder="时刻名称，如：完成第一章" />
            <input v-model="evForm.description" class="input" placeholder="备注（可选）" />
            <div style="display: flex; gap: 8px;">
              <button class="btn primary sm" @click="saveEvent">{{ editingEvent ? '保存修改' : '记下' }}</button>
              <button class="btn sm" @click="showEventForm = false; editingEvent = null">取消</button>
            </div>
          </div>
          <button v-else class="btn soft sm" style="margin-top: 10px;" @click="openEventForm()">
            <Icon name="plus" :size="12" /> 记一个时刻
          </button>
        </div>
      </section>
    </div>

    <InputDialog ref="nameDlg" title="目标名称" placeholder="如：学会 Vue 3" />
    <ConfirmDialog ref="confirmDlg" />

    <!-- 记一笔进度 -->
    <Modal v-if="showProg" title="记一笔进度" @close="showProg = false">
      <div class="pf">
        <div class="pf-cur">
          当前进度 <b>{{ curQty }}</b> / {{ sel?.target_total }}{{ sel?.target_unit }}
        </div>
        <div class="row">
          <div class="field grow">
            <label>日期</label>
            <input v-model="progDate" type="date" class="input" />
          </div>
          <div class="field grow">
            <label>增减</label>
            <div class="seg">
              <button :class="{ on: progSign === 'plus' }" @click="progSign = 'plus'">＋ 增加</button>
              <button :class="{ on: progSign === 'minus' }" @click="progSign = 'minus'">－ 回退</button>
            </div>
          </div>
        </div>
        <div class="field">
          <label>数量（{{ sel?.target_unit || '份' }}）</label>
          <input v-model="progCount" type="number" min="0" class="input" placeholder="如 3" />
        </div>
        <div class="pf-preview">
          记下后：{{ curQty }} → <b>{{ previewTotal }}</b> {{ sel?.target_unit }}
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="showProg = false">取消</button>
        <button class="btn primary" @click="saveProg">记下</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.goals-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; padding-bottom: 16px; }
.page-head { flex: none; }
.goals-page .cols { flex: 1; min-height: 0; display: grid; align-items: stretch; } /* 比例由拖拽分栏控制 */
.goals-page .cols.dragging { user-select: none; }
.goals-page .splitter { cursor: col-resize; position: relative; touch-action: none; }
.goals-page .splitter i {
  position: absolute; top: 4px; bottom: 4px; left: 6px; width: 2px;
  border-radius: 2px; background: transparent; transition: background .15s;
}
.goals-page .splitter:hover i, .goals-page .cols.dragging .splitter i {
  background: color-mix(in srgb, var(--grass) 55%, transparent);
}
.tree-card { padding: 12px 12px 16px; overflow-y: auto; }
.right-col { overflow-y: auto; display: flex; flex-direction: column; gap: 16px; min-width: 0; padding-right: 2px; }
.f-chips { display: flex; gap: 4px; }
.f-chip { cursor: pointer; }
.f-chip.on { background: var(--deep); color: var(--on-deep); border-color: var(--deep); }
.done-group { margin-top: 12px; border-top: 1px dashed var(--line-strong); padding-top: 8px; }
.done-head {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  border: none; background: color-mix(in srgb, var(--deep) 7%, transparent); color: var(--deep);
  font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 8px; cursor: pointer;
}
.done-item {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 12px; border-radius: 8px; cursor: pointer; font-size: 13px;
}
.done-item:hover, .done-item.on { background: var(--tint); }
.chk { flex: none; width: 15px; height: 15px; border-radius: 50%; background: var(--deep); color: var(--on-deep); display: inline-flex; align-items: center; justify-content: center; font-size: 9px; }
.done-item .t { flex: 1; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.done-item .d { font-size: 11px; color: var(--ink-3); }
.detail { background: var(--card); }
.d-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.d-head h2 { font-size: 20px; font-weight: 650; letter-spacing: .01em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 量化面板 */
.pp {
  background: linear-gradient(160deg, color-mix(in srgb, var(--hl) 28%, transparent), color-mix(in srgb, var(--grass) 12%, transparent));
  border: 1px solid color-mix(in srgb, var(--grass) 30%, transparent);
  border-radius: 12px;
  padding: 13px 15px;
  margin-bottom: 16px;
}
.pp-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.pp-num b { font-size: 28px; font-weight: 700; color: var(--deep); line-height: 1.1; font-variant-numeric: tabular-nums; }
.pp-total { font-size: 14px; color: var(--ink-2); margin-left: 4px; }
.pp-pct { font-size: 18px; font-weight: 700; color: var(--deep); }
.progress.big { height: 10px; background: color-mix(in srgb, var(--card) 70%, transparent); }
.pp-act { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.pp-left { font-size: 12px; color: var(--ink-2); }
.pp-list { margin-top: 10px; border-top: 1px dashed color-mix(in srgb, var(--grass) 40%, transparent); padding-top: 6px; }
.pp-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.pp-date { font-size: 12px; color: var(--ink-3); width: 82px; flex: none; }
.pp-delta { font-size: 12.5px; color: var(--deep); font-weight: 600; flex: 1; }
.pp-delta.minus { color: var(--danger); }
.edit-form { display: flex; flex-direction: column; gap: 12px; }
.edit-actions { display: flex; align-items: center; gap: 8px; }
.edit-actions .sp { flex: 1; }
.row { display: flex; gap: 10px; }
.grow { flex: 1; }
.hint { font-size: 12px; color: var(--deep); background: color-mix(in srgb, var(--hl) 30%, transparent); border-radius: 8px; padding: 6px 10px; }
.stat-row { display: flex; gap: 18px; font-size: 13px; color: var(--ink-2); margin-bottom: 6px; }
.stat-row b { color: var(--deep); font-size: 15px; }

/* ---------- 时间与节奏 ---------- */
.tp {
  background: linear-gradient(160deg, color-mix(in srgb, var(--lake) 10%, transparent), color-mix(in srgb, var(--hl) 22%, transparent));
  border: 1px solid color-mix(in srgb, var(--lake) 26%, transparent);
  border-radius: 12px;
  padding: 12px 15px;
  margin-bottom: 16px;
}
.tp-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 9px; }
.tp-title { font-size: 13px; font-weight: 650; color: var(--ink); }
.tp-range { font-size: 11.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.tp-bars { display: flex; flex-direction: column; gap: 7px; }
.tp-bar { display: flex; align-items: center; gap: 9px; }
.tp-lb { font-size: 11.5px; color: var(--ink-3); flex: none; width: 30px; }
.tp-bar .progress { flex: 1; height: 7px; background: color-mix(in srgb, var(--card) 75%, transparent); }
.tp-bar .progress i.t { background: linear-gradient(90deg, var(--lake), color-mix(in srgb, var(--lake) 55%, var(--grass))); }
.tp-bar .progress i.q { background: linear-gradient(90deg, var(--grass), var(--leaf)); }
.tp-num { font-size: 11.5px; color: var(--ink-2); flex: none; width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
.tp-notes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.tp-note {
  font-size: 11.5px; line-height: 1.5;
  border-radius: 999px; padding: 2px 10px;
  background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink-2);
}
.tp-note.ok { background: color-mix(in srgb, var(--grass) 22%, transparent); color: var(--deep); }
.tp-note.warn { background: color-mix(in srgb, var(--hl) 75%, transparent); color: var(--ink); border: 1px solid color-mix(in srgb, var(--grass) 45%, transparent); }
.tp-note.bad { background: color-mix(in srgb, var(--err) 16%, transparent); color: var(--err); border: 1px solid color-mix(in srgb, var(--err) 40%, transparent); }
.tp-hint {
  display: flex; align-items: center; gap: 7px;
  font-size: 12px; color: var(--ink-3);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  border-radius: 9px; padding: 8px 12px; margin-bottom: 16px;
}
.date-quick { display: flex; align-items: flex-end; gap: 8px; }

/* ---------- 学习足迹 ---------- */
.footprint { display: flex; flex-direction: column; }
.fp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.fp-title { font-size: 14px; font-weight: 620; color: var(--ink); }

/* 范围切换：独立胶囊，尺寸正常，不做缩放 */
.scope-seg {
  margin-left: auto;
  display: inline-flex;
  background: var(--tint);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px;
}
.scope-seg button {
  display: inline-flex; align-items: center; gap: 5px;
  border: none; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--ink-3);
  padding: 4px 12px; border-radius: 999px;
  transition: background .16s, color .16s;
}
.scope-seg button:hover { color: var(--ink-2); }
.scope-seg button.on { background: var(--deep); color: var(--on-deep); font-weight: 600; }
.scope-seg button em {
  font-style: normal; font-size: 10.5px;
  background: color-mix(in srgb, var(--ink) 10%, transparent); border-radius: 999px;
  padding: 0 6px; line-height: 15px; min-width: 15px; text-align: center;
}
.scope-seg button.on em { background: color-mix(in srgb, var(--on-deep) 28%, transparent); }

/* 统计条：一条横线分隔的数字组，比之前的格子更清爽 */
.fp-stats {
  display: flex; align-items: center; gap: 4px;
  background: linear-gradient(120deg, color-mix(in srgb, var(--hl) 30%, transparent), color-mix(in srgb, var(--grass) 10%, transparent));
  border: 1px solid color-mix(in srgb, var(--grass) 26%, transparent);
  border-radius: 12px;
  padding: 14px 8px;
}
.fp-stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; }
.fp-stat b {
  font-size: 21px; line-height: 1.05; color: var(--deep); font-weight: 680;
  font-variant-numeric: tabular-nums; letter-spacing: -.01em;
}
.fp-stat span { font-size: 11px; color: var(--ink-3); white-space: nowrap; }
.fp-div { width: 1px; height: 26px; background: color-mix(in srgb, var(--deep) 16%, transparent); flex: none; }

.fp-note { font-size: 11.5px; color: var(--ink-3); margin-top: 9px; line-height: 1.5; }

/* 展开明细：一个轻量的文字按钮 + 旋转箭头 */
.fp-toggle {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 12px;
  border: none; background: none; cursor: pointer;
  font-size: 12.5px; color: var(--leaf); padding: 0;
}
.fp-toggle:hover { color: var(--deep); text-decoration: underline; }
.fp-toggle .chev { font-size: 15px; line-height: 1; transition: transform .18s; display: inline-block; }
.fp-toggle .chev.open { transform: rotate(90deg); }

.fp-detail { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
.fp-row { display: flex; align-items: flex-start; gap: 10px; padding: 7px 2px; border-bottom: 1px dashed var(--line); }
.fp-row:last-of-type { border-bottom: none; }
.fp-row-date { font-size: 12px; color: var(--ink-3); flex: none; width: 80px; padding-top: 1px; font-variant-numeric: tabular-nums; }
.fp-row-body { flex: 1; min-width: 0; }
.fp-row-body p { font-size: 13px; color: var(--ink-2); }
.fp-row-body i { font-style: normal; color: var(--ink-3); font-size: 12px; }
.fp-refl {
  font-size: 12.5px; color: var(--lake); font-family: "KaiTi", "STKaiti", inherit;
  margin-top: 6px; line-height: 1.6;
}

.rc { font-size: 13px; }
.rc i { font-style: normal; color: var(--ink-3); font-size: 12px; }
.none { font-size: 12.5px; color: var(--ink-3); }
.refl-line { font-size: 12.5px; color: var(--lake); font-family: "KaiTi", "STKaiti", inherit; margin-top: 4px; }
.ev-date { font-size: 12px; color: var(--ink-3); flex: none; width: 82px; }
.ev-body { flex: 1; min-width: 0; }
.ev-body p { font-size: 12.5px; color: var(--ink-2); }
.ev-form { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
/* 大事记的操作按钮：常驻可见 */
.ev-ops { display: flex; gap: 1px; flex: none; }
.ev-ops button {
  border: none; background: none; color: var(--ink-3);
  cursor: pointer; padding: 3px; border-radius: 6px; line-height: 0;
  transition: background .15s, color .15s;
}
.ev-ops button:hover { color: var(--deep); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.ev-ops button.del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
/* 进度弹窗 */
.pf { display: flex; flex-direction: column; gap: 14px; }
.pf-cur { font-size: 13px; color: var(--ink-2); }
.pf-cur b { color: var(--deep); font-size: 16px; }
.seg { display: flex; border: 1px solid var(--line-strong); border-radius: var(--radius-s); overflow: hidden; }
.seg button {
  flex: 1; border: none; background: var(--card); padding: 7px 0;
  font-size: 13px; color: var(--ink-2); cursor: pointer; transition: all .16s;
}
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--deep); color: var(--on-deep); font-weight: 600; }
.pf-preview { font-size: 13px; color: var(--ink-2); background: var(--tint); border-radius: 8px; padding: 8px 12px; }
.pf-preview b { color: var(--deep); font-size: 15px; }
</style>
