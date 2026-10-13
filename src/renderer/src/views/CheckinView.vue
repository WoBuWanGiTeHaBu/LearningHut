<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import type { CheckinGoal, CheckinLog, CheckinStats } from '../../../shared/types'
import Icon from '../components/Icon.vue'
import InputDialog from '../components/InputDialog.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'

const goals = ref<CheckinGoal[]>([])
const stats = ref<Record<number, CheckinStats>>({})
const openId = ref<number | null>(null)
const logs = ref<CheckinLog[]>([])           // 当前展开目标的日志
const viewMonth = ref(monthKey(new Date()))  // 'YYYY-MM'
const nameDlg = ref<InstanceType<typeof InputDialog> | null>(null)
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const domainLabel = computed(() => (store.domain === 'study' ? '学习' : '爱好'))
const todayStr = () => new Date().toISOString().slice(0, 10)
const logSet = computed(() => new Set(logs.value.map(l => l.date)))
const logNote = computed(() => {
  const m: Record<string, string> = {}
  for (const l of logs.value) m[l.date] = l.note
  return m
})

onMounted(load)
watch(() => store.domain, load)

async function load() {
  goals.value = await api.checkin.goals(store.domain)
  if (openId.value && !goals.value.find(g => g.id === openId.value)) openId.value = null
  const map: Record<number, CheckinStats> = {}
  await Promise.all(goals.value.map(async g => { map[g.id] = await api.checkin.stats(g.id) }))
  stats.value = map
  if (openId.value) logs.value = await api.checkin.logs(openId.value)
}

async function addGoal() {
  const title = await nameDlg.value?.ask()
  if (!title?.trim()) return
  await api.checkin.create({ title: title.trim(), domain: store.domain })
  await load()
  toast('已添加这个习惯')
}

async function removeGoal(g: CheckinGoal) {
  const ok = await confirmDlg.value?.ask({
    message: `删除习惯「${g.title}」？`,
    detail: '该习惯的全部打卡记录也会一起清空，删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.checkin.remove(g.id)
  if (openId.value === g.id) openId.value = null
  await load()
  toast('已删除习惯')
}

async function toggleOpen(g: CheckinGoal) {
  if (openId.value === g.id) { openId.value = null; return }
  openId.value = g.id
  viewMonth.value = monthKey(new Date())
  logs.value = await api.checkin.logs(g.id)
}

async function toggleDate(g: CheckinGoal, date: string) {
  const wasChecked = logSet.value.has(date)
  const res = await api.checkin.toggle(g.id, date)
  // 同步本地日志 + 统计
  if (res.checked) {
    logs.value = [...logs.value.filter(l => l.date !== date), { id: -Date.now(), goal_id: g.id, date, note: '', created_at: '' }]
      .sort((a, b) => a.date < b.date ? 1 : -1)
  } else {
    logs.value = logs.value.filter(l => l.date !== date)
  }
  stats.value = { ...stats.value, [g.id]: await api.checkin.stats(g.id) }
  if (wasChecked) toast(`取消了 ${date} 的打卡`)
  else if (date === todayStr()) toast('今日已打卡 ✓')
}

function checkedToday(g: CheckinGoal): boolean {
  return logSet.value.has(todayStr())
}

// ---- 月历 ----
const WK = ['日', '一', '二', '三', '四', '五', '六']
const monthCells = computed(() => {
  const [y, m] = viewMonth.value.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: { date: string; day: number; future: boolean; inMonth: boolean }[] = []
  // 上个月的补位
  for (let i = 0; i < startPad; i++) {
    const d = new Date(y, m - 1, 1 - (startPad - i))
    cells.push({ date: iso(d), day: d.getDate(), future: false, inMonth: false })
  }
  const today = new Date()
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(y, m - 1, d)
    cells.push({ date: iso(dt), day: d, future: dt > today, inMonth: true })
  }
  // 末尾补到 6 行
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ date: '', day: 0, future: false, inMonth: false })
  return cells
})
function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function shiftMonth(delta: number) {
  const [y, m] = viewMonth.value.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  viewMonth.value = monthKey(d)
}
const monthLabel = computed(() => {
  const [y, m] = viewMonth.value.split('-').map(Number)
  return `${y} 年 ${m} 月`
})
</script>

<template>
  <div class="page checkin-page">
    <div class="page-head">
      <h1>打卡</h1>
      <span class="sub">坚持一件事，比多做几件更重要 · 当前：{{ domainLabel }}</span>
      <span class="spacer"></span>
      <button class="btn primary" @click="addGoal"><Icon name="plus" :size="14" /> 新习惯</button>
    </div>

    <div class="card pad list-card">
      <div v-if="!goals.length" class="empty">
        <div class="leaf-mark">✓</div>
        还没有打卡习惯<br />把想每天坚持的小事记下来，点一下就算今天做到了
      </div>

      <div v-for="g in goals" :key="g.id" class="ci" :class="{ open: openId === g.id }">
        <div class="ci-main">
          <button class="ci-check" :class="{ done: checkedToday(g) }" :title="checkedToday(g) ? '今天已打卡，点一下取消' : '今天打卡'"
            @click="toggleDate(g, todayStr())">
            <Icon :name="checkedToday(g) ? 'check' : 'plus'" :size="15" />
          </button>
          <div class="ci-body" @click="toggleOpen(g)">
            <b class="ci-title">{{ g.title }}</b>
            <p v-if="g.note" class="ci-note">{{ g.note }}</p>
          </div>
          <div class="ci-stats" @click="toggleOpen(g)">
            <span class="ci-streak" :title="'连续打卡天数'">🔥 {{ stats[g.id]?.streak || 0 }}</span>
            <span class="ci-total">累计 {{ stats[g.id]?.total || 0 }} 天</span>
          </div>
          <button class="ci-del" title="删除习惯" @click="removeGoal(g)"><Icon name="trash" :size="13" /></button>
        </div>

        <div v-if="openId === g.id" class="ci-detail">
          <div class="cal">
            <div class="cal-head">
              <button class="cal-nav" @click="shiftMonth(-1)">‹</button>
              <span class="cal-title">{{ monthLabel }}</span>
              <button class="cal-nav" @click="shiftMonth(1)">›</button>
            </div>
            <div class="cal-grid">
              <span v-for="w in WK" :key="w" class="cal-wk">{{ w }}</span>
              <button v-for="(c, i) in monthCells" :key="i" class="cal-cell"
                :class="{ off: !c.inMonth, future: c.future, hit: c.date && logSet.has(c.date) }"
                :disabled="!c.date || c.future"
                @click="c.date && toggleDate(g, c.date)">
                <span v-if="c.date">{{ c.day }}</span>
              </button>
            </div>
            <div class="cal-legend"><i class="dot"></i> 已打卡</div>
          </div>

          <div class="logs">
            <div class="logs-title">打卡记录（{{ logs.length }} 天）</div>
            <div v-if="!logs.length" class="logs-none">这个月还没打过卡，点上面的日期补上</div>
            <div v-for="l in logs.slice().reverse().slice(0, 12)" :key="l.id" class="log-row">
              <span class="log-date">{{ l.date }}</span>
              <span class="log-note" v-if="l.note">{{ l.note }}</span>
              <span class="log-note dim" v-else>已打卡</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <InputDialog ref="nameDlg" title="习惯名称" placeholder="如：每天喝水 8 杯 / 晨跑 20 分钟" />
    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.checkin-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.checkin-page .list-card { flex: 1; min-height: 0; overflow-y: auto; }

.ci { border: 1px solid var(--line); border-radius: 14px; background: var(--card); margin-bottom: 12px; overflow: hidden; transition: box-shadow .18s, border-color .18s; }
.ci.open { border-color: color-mix(in srgb, var(--grass) 45%, transparent); box-shadow: 0 6px 20px color-mix(in srgb, var(--ink) 8%, transparent); }
.ci-main { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
.ci-check {
  flex: none; width: 38px; height: 38px; border-radius: 12px;
  border: 2px solid color-mix(in srgb, var(--grass) 55%, transparent);
  background: color-mix(in srgb, var(--grass) 14%, transparent); color: var(--deep);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  transition: all .16s;
}
.ci-check:hover { transform: scale(1.06); }
.ci-check.done { background: var(--deep); border-color: var(--deep); color: var(--on-deep); }
.ci-body { flex: 1; min-width: 0; cursor: pointer; }
.ci-title { font-size: 15px; font-weight: 620; color: var(--ink); }
.ci-note { font-size: 12.5px; color: var(--ink-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ci-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; cursor: pointer; flex: none; }
.ci-streak { font-size: 15px; font-weight: 650; color: var(--deep); font-variant-numeric: tabular-nums; }
.ci-total { font-size: 11.5px; color: var(--ink-3); }
.ci-del { flex: none; border: none; background: none; color: var(--ink-3); cursor: pointer; padding: 6px; border-radius: 8px; line-height: 0; }
.ci-del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }

.ci-detail { border-top: 1px dashed var(--line); padding: 16px; display: grid; grid-template-columns: auto 1fr; gap: 20px; align-items: start; }
@media (max-width: 720px) { .ci-detail { grid-template-columns: 1fr; } }

/* 月历 */
.cal { flex: none; }
.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cal-title { font-size: 13.5px; font-weight: 600; color: var(--ink); }
.cal-nav { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--ink-2); cursor: pointer; font-size: 14px; }
.cal-nav:hover { border-color: var(--grass); color: var(--leaf); }
.cal-grid { display: grid; grid-template-columns: repeat(7, 30px); gap: 4px; }
.cal-wk { font-size: 10.5px; color: var(--ink-3); text-align: center; padding-bottom: 2px; }
.cal-cell {
  height: 30px; border-radius: 8px; border: 1px solid transparent; background: var(--tint);
  color: var(--ink-2); font-size: 12px; cursor: pointer; transition: all .14s; display: flex; align-items: center; justify-content: center;
}
.cal-cell:hover:not(:disabled) { transform: scale(1.08); }
.cal-cell.off { color: var(--ink-3); opacity: .5; }
.cal-cell.future { cursor: default; opacity: .35; }
.cal-cell.hit { background: linear-gradient(160deg, var(--grass), var(--leaf)); color: #fff; border-color: transparent; font-weight: 600; }
.cal-legend { margin-top: 8px; font-size: 11px; color: var(--ink-3); display: flex; align-items: center; gap: 5px; }
.cal-legend .dot { width: 11px; height: 11px; border-radius: 4px; background: linear-gradient(160deg, var(--grass), var(--leaf)); display: inline-block; }

/* 打卡日志 */
.logs { min-width: 0; }
.logs-title { font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 10px; }
.logs-none { font-size: 12.5px; color: var(--ink-3); }
.log-row { display: flex; align-items: center; gap: 10px; padding: 6px 2px; border-bottom: 1px dashed var(--line); }
.log-row:last-child { border-bottom: none; }
.log-date { font-size: 12.5px; color: var(--ink-3); flex: none; width: 92px; font-variant-numeric: tabular-nums; }
.log-note { font-size: 13px; color: var(--ink-2); }
.log-note.dim { color: var(--ink-3); }
</style>
