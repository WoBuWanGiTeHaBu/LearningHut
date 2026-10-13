<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import type { ReportSummary } from '../../../shared/types'
import Icon from '../components/Icon.vue'

const range = ref<'week' | 'month' | 'year'>('month')
// 导出/统计的范围：全部 / 学习 / 爱好（默认跟随全局切换，可单独改）
const domainSel = ref<'all' | 'study' | 'hobby'>(store.domain)
const summary = ref<ReportSummary | null>(null)
const exported = ref('')

function bounds(r: 'week' | 'month' | 'year'): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().slice(0, 10)
  if (r === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { from: d.toISOString().slice(0, 10), to }
  }
  if (r === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())
    return { from: d.toISOString().slice(0, 10), to }
  }
  return { from: `${now.getFullYear()}-01-01`, to }
}

async function load() {
  const b = bounds(range.value)
  summary.value = await api.reports.summary(b.from, b.to, domainSel.value === 'all' ? undefined : domainSel.value)
}
onMounted(load)
watch(() => domainSel.value, load)

async function doExport(kind: 'json' | 'csv' | 'md') {
  const p = await api.reports.export(kind, domainSel.value === 'all' ? undefined : domainSel.value)
  if (p) { exported.value = '已导出到 ' + p; setTimeout(() => (exported.value = ''), 6000) }
}
async function backup() {
  const p = await api.dialog.backupNow()
  if (p) { exported.value = '已备份到 ' + p; setTimeout(() => (exported.value = ''), 6000) }
}

const maxMinutes = computed(() => Math.max(1, ...(summary.value?.by_day.map(d => d.minutes) || [])))
const maxGoalMinutes = computed(() => Math.max(1, ...(summary.value?.by_goal.map(g => g.minutes) || [])))
const hours = computed(() => Math.floor((summary.value?.total_minutes || 0) / 60))
const mins = computed(() => (summary.value?.total_minutes || 0) % 60)
const avgMin = computed(() => {
  const days = summary.value?.by_day.length || 0
  if (!days) return 0
  return Math.round((summary.value?.total_minutes || 0) / days)
})
const summaryLine = computed(() => {
  if (!summary.value) return ''
  const s = summary.value
  if (!s.total_count) return '这段时间还没有学习记录'
  return `这段时间里，你一共学习了 ${s.total_count} 次，累计 ${hours.value} 小时 ${mins.value} 分。`
})
// 只在柱子多时抽样显示横轴标签
const showLabel = (i: number, n: number) => n <= 16 || i % Math.ceil(n / 12) === 0

const LABEL = { week: '最近 7 天', month: '最近 3 个月', year: '今年' } as const
</script>

<template>
  <div class="page rp">
    <div class="page-head">
      <h1>报表与导出</h1>
      <span class="sub">抽屉里的牛皮纸档案袋</span>
      <span class="spacer"></span>
      <div class="domains">
        <button class="btn sm" :class="domainSel === 'all' ? 'primary' : ''" @click="domainSel = 'all'">全部</button>
        <button class="btn sm" :class="domainSel === 'study' ? 'primary' : ''" @click="domainSel = 'study'">学习</button>
        <button class="btn sm" :class="domainSel === 'hobby' ? 'primary' : ''" @click="domainSel = 'hobby'">爱好</button>
      </div>
      <div class="ranges">
        <button v-for="(l, k) in LABEL" :key="k" class="btn sm" :class="range === k ? 'primary' : ''"
          @click="range = k as any; load()">{{ l }}</button>
      </div>
    </div>

    <div class="rgrid" v-if="summary">
      <section class="card pad span12 quote paper-lines">
        <p>“{{ summaryLine }}”</p>
      </section>

      <section class="card pad stat span4">
        <span class="s-num">{{ summary.total_count }}</span>
        <span class="s-label">记录条数</span>
      </section>
      <section class="card pad stat span4">
        <span class="s-num">{{ hours }}<small>h</small>{{ mins }}<small>min</small></span>
        <span class="s-label">累计时长</span>
      </section>
      <section class="card pad stat span4">
        <span class="s-num">{{ avgMin }}<small>min</small></span>
        <span class="s-label">平均每天</span>
      </section>

      <section class="card pad span12 chart-card">
        <div class="card-title">每日时长</div>
        <div v-if="!summary.by_day.length" class="empty" style="padding: 26px 0;">这段时间没有记录</div>
        <div v-else class="bars">
          <div v-for="(d, i) in summary.by_day" :key="d.date" class="bar-wrap"
            :title="`${d.date} · ${d.count} 条 · ${d.minutes} 分钟`">
            <div class="bar-col">
              <i :style="{ height: Math.max(4, d.minutes / maxMinutes * 100) + '%' }"></i>
            </div>
            <span class="bar-x">{{ showLabel(i, summary.by_day.length) ? d.date.slice(5) : '' }}</span>
          </div>
        </div>
      </section>

      <section class="card pad span7">
        <div class="card-title">按目标分布</div>
        <div v-if="!summary.by_goal.length" class="empty" style="padding: 20px 0;">这段时间没有记录</div>
        <div v-for="g in summary.by_goal" :key="g.goal_id ?? 'none'" class="g-bar">
          <span class="g-name">{{ g.title }}</span>
          <div class="progress"><i :style="{ width: (g.minutes / maxGoalMinutes * 100) + '%' }"></i></div>
          <span class="g-num">{{ g.count }} 条 · {{ g.minutes }}′</span>
        </div>
      </section>

      <section class="card pad span5 export-card">
        <div class="card-title">导出与备份</div>
        <p class="ex-tip">数据永远在自己的电脑上，随时可以带走。</p>
        <div class="ex-col">
          <button class="btn" @click="doExport('json')"><Icon name="drawer" :size="14" /> 全部数据 JSON</button>
          <button class="btn" @click="doExport('csv')"><Icon name="drawer" :size="14" /> 学习记录 CSV</button>
          <button class="btn" @click="doExport('md')"><Icon name="drawer" :size="14" /> 报表 Markdown</button>
          <button class="btn soft" @click="backup"><Icon name="folder" :size="14" /> 立即备份数据库</button>
        </div>
        <p v-if="exported" class="saved">{{ exported }}</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.rp { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.domains { display: flex; gap: 4px; margin-right: 6px; }
.ranges { display: flex; gap: 6px; }
.rp .rgrid {
  flex: 1; min-height: 0; overflow-y: auto;
  display: grid; grid-template-columns: repeat(12, 1fr);
  /* 前三行按内容，图表行吃掉剩余高度，最后一行按内容收尾 —— 页面正好铺到底 */
  grid-template-rows: max-content max-content minmax(200px, 1fr) max-content;
  gap: 14px; padding-bottom: 4px;
}
.span4 { grid-column: span 4; }
.span5 { grid-column: span 5; }
.span7 { grid-column: span 7; }
.span12 { grid-column: span 12; }
.quote { padding: 14px 20px; }
.quote p { font-size: 14px; color: var(--ink-2); font-family: "KaiTi", "STKaiti", inherit; letter-spacing: .02em; }
.stat { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
.s-num { font-size: 30px; font-weight: 700; color: var(--deep); line-height: 1.2; font-variant-numeric: tabular-nums; }
.s-num small { font-size: 14px; font-weight: 500; color: var(--ink-3); margin: 0 3px 0 1px; }
.s-label { font-size: 12.5px; color: var(--ink-3); }
.chart-card { display: flex; flex-direction: column; }
.bars { display: flex; align-items: flex-end; gap: 4px; flex: 1; min-height: 140px; padding-top: 6px; }
/* 数据少时柱子不会拉成一整块 */
.bar-wrap { flex: 1 1 0; min-width: 6px; max-width: 44px; height: 100%; display: flex; flex-direction: column; }
.bar-col { flex: 1; display: flex; align-items: flex-end; }
.bar-col i {
  display: block; width: 100%; border-radius: 5px 5px 2px 2px;
  background: linear-gradient(180deg, var(--grass), var(--leaf));
  min-height: 4px;
  transition: filter .15s;
}
.bar-wrap:hover .bar-col i { filter: brightness(1.08) saturate(1.1); }
.bar-x { font-size: 10px; color: var(--ink-3); text-align: center; height: 14px; margin-top: 4px; white-space: nowrap; }
.g-bar { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
.g-name { width: 130px; font-size: 13px; flex: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.g-bar .progress { flex: 1; }
.g-num { font-size: 12px; color: var(--ink-3); flex: none; width: 92px; text-align: right; font-variant-numeric: tabular-nums; }
.export-card { display: flex; flex-direction: column; }
.ex-tip { font-size: 12.5px; color: var(--ink-3); margin-bottom: 12px; }
.ex-col { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
.ex-col .btn { justify-content: flex-start; }
.saved { margin-top: 10px; font-size: 12.5px; color: var(--leaf); word-break: break-all; }
</style>
