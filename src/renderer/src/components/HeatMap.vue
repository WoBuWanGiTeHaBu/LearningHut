<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import type { DayStat, StudyRecord } from '../../../shared/types'

const props = defineProps<{ domain?: 'study' | 'hobby' }>()
const stats = ref<DayStat[]>([])
const map = ref<Map<string, DayStat>>(new Map())
const selected = ref<DayStat | null>(null)
const dayRecords = ref<StudyRecord[]>([])

// 色阶跟着主题走（浅色主题是绿→深绿，格雷系是暗灰→粉）
const COLOR = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)', 'var(--heat-5)']

// 近 53 周：从上周日开始对齐
const weeks = computed(() => {
  const out: { date: string; level: number; future: boolean }[][] = []
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 364)
  start.setDate(start.getDate() - start.getDay()) // 对齐到周日
  const d = new Date(start)
  while (d <= today || d.getDay() !== 0) {
    const week: { date: string; level: number; future: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      const iso = fmt(d)
      const st = map.value.get(iso)
      const future = d > today
      week.push({ date: iso, level: levelOf(st), future })
      d.setDate(d.getDate() + 1)
    }
    out.push(week)
    if (d > today && d.getDay() === 0 && out.length > 53) break
  }
  return out
})

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function levelOf(st?: DayStat) {
  if (!st || !st.count) return 0
  const m = st.minutes
  if (m >= 240) return 5
  if (m >= 120) return 4
  if (m >= 60) return 3
  if (m >= 30) return 2
  return 1
}

async function pick(cell: { date: string; future: boolean }) {
  if (cell.future) return
  selected.value = map.value.get(cell.date) || { date: cell.date, count: 0, minutes: 0 }
  dayRecords.value = await api.records.day(cell.date)
}

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const monthMarks = computed(() => {
  const marks: { i: number; label: string }[] = []
  let last = -1
  weeks.value.forEach((w, i) => {
    const m = Number(w[0].date.slice(5, 7)) - 1
    if (m !== last && w.some(c => !c.future)) { marks.push({ i, label: MONTHS[m] }); last = m }
  })
  return marks
})

// 小计：有记录的天数 / 累计时长 / 当前连续天数
const totalDays = computed(() => stats.value.filter(s => s.count > 0).length)
const totalHours = computed(() => {
  const m = stats.value.reduce((a, s) => a + (s.minutes || 0), 0)
  return m >= 60 ? (m / 60).toFixed(m >= 600 ? 0 : 1) : String(m)
})
const totalUnit = computed(() => (stats.value.reduce((a, s) => a + (s.minutes || 0), 0) >= 60 ? '小时累计' : '分钟累计'))
const streak = computed(() => {
  const has = map.value
  const d = new Date()
  // 今天没记就从昨天往回数，仍算「保持中」
  if (!has.get(fmt(d))?.count) d.setDate(d.getDate() - 1)
  let n = 0
  while (has.get(fmt(d))?.count) { n++; d.setDate(d.getDate() - 1) }
  return n
})

onMounted(async () => {
  stats.value = await api.heatmap(props.domain)
  map.value = new Map(stats.value.map(s => [s.date, s]))
})
watch(() => props.domain, async () => {
  stats.value = await api.heatmap(props.domain)
  map.value = new Map(stats.value.map(s => [s.date, s]))
  selected.value = null
})
</script>

<template>
  <div class="hm-root">
    <div class="hm-scroll">
      <div class="hm">
        <div class="months">
          <span v-for="m in monthMarks" :key="m.i + m.label" class="mlabel" :style="{ gridColumn: m.i + 1 }">{{ m.label }}</span>
        </div>
        <div class="grid-wrap">
          <div class="week-col" v-for="(w, wi) in weeks" :key="wi">
            <button v-for="c in w" :key="c.date" class="cell" :class="{ future: c.future }"
              :style="{ background: COLOR[c.level] }"
              :title="`${c.date} · ${map.get(c.date)?.count || 0} 次 / ${map.get(c.date)?.minutes || 0} 分钟`"
              @click="pick(c)"></button>
          </div>
        </div>
      </div>
    </div>

    <div class="hm-foot">
      <div class="legend">
        <span>少</span>
        <i v-for="c in COLOR" :key="c" :style="{ background: c }"></i>
        <span>多</span>
      </div>
      <div class="hm-side">
        <span class="hs"><b>{{ totalDays }}</b> 天有记录</span>
        <i class="hs-sep"></i>
        <span class="hs"><b>{{ totalHours }}</b> {{ totalUnit }}</span>
        <i class="hs-sep"></i>
        <span class="hs"><b>{{ streak }}</b> 天连续学习</span>
      </div>
    </div>

    <div v-if="selected" class="day-detail">
      <div class="dd-head">
        <b>{{ selected.date }}</b>
        <span class="sub">{{ selected.count }} 次学习 · {{ selected.minutes }} 分钟</span>
        <button class="btn ghost sm" @click="selected = null">收起</button>
      </div>
      <div v-if="!dayRecords.length" class="empty" style="padding: 12px 0;">这一天没有记录</div>
      <div v-for="r in dayRecords" :key="r.id" class="row-item">
        <span class="chip">{{ r.duration_min }} 分钟</span>
        <span class="rc">{{ r.content }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hm-root { display: flex; flex-direction: column; }
.hm-scroll { overflow-x: auto; }
.hm { min-width: 700px; }
.months { display: grid; grid-template-columns: repeat(53, 15px); gap: 3px; margin-bottom: 3px; font-size: 10px; color: var(--ink-3); height: 13px; }
.mlabel { grid-row: 1; white-space: nowrap; }
.grid-wrap { display: flex; gap: 3px; }
.week-col { display: flex; flex-direction: column; gap: 3px; }
.cell {
  width: 15px; height: 15px; border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--ink) 6%, transparent);
  cursor: pointer; padding: 0;
  transition: transform .12s;
}
.cell:hover { transform: scale(1.25); }
.cell.future { opacity: .25; cursor: default; }

/* 页脚一行：左边色阶图例，右边足迹小计 */
.hm-foot { display: flex; align-items: center; gap: 12px; margin-top: 7px; }
.legend { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-3); }
.legend i { width: 12px; height: 12px; border-radius: 3px; }
.hm-side {
  margin-left: auto;
  display: flex; align-items: center; gap: 10px;
  font-size: 11.5px; color: var(--ink-3); white-space: nowrap;
}
.hs b {
  font-size: 14px; font-weight: 650; color: var(--deep);
  font-variant-numeric: tabular-nums; margin-right: 1px;
}
.hs-sep { width: 1px; height: 11px; background: var(--line); }

.day-detail { margin-top: 14px; background: var(--tint); border-radius: 10px; padding: 12px 16px; }
.dd-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.dd-head .sub { color: var(--ink-3); font-size: 12px; flex: 1; }
.rc { font-size: 13px; }
</style>
