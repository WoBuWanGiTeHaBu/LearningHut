<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import HeatMap from '../components/HeatMap.vue'
import StickyWall from '../components/StickyWall.vue'
import RecordModal from '../components/RecordModal.vue'
import type { StudyRecord } from '../../../shared/types'
import { useRoute } from 'vue-router'

const recent = ref<StudyRecord[]>([])
const goals = ref<any[]>([])
const thatDay = ref<{ records: StudyRecord[]; reflections: any[] } | null>(null)
const showRecord = ref(false)
const profile = ref<{ nickname?: string }>({})
const route = useRoute()

onMounted(async () => {
  await reload()
  if (route.query.new) showRecord.value = true
  profile.value = (await api.settings.get('profile')) || {}
})
watch(() => store.domain, reload)

async function reload() {
  recent.value = await api.records.recent(10, store.domain)
  const tree = flatten(await api.goals.tree(store.domain))
  goals.value = tree.filter(g => g.status === 'active').slice(0, 7)
  const td = await api.reflections.thatDay()
  thatDay.value = td
}

function flatten(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flatten(n.children, acc) }
  return acc
}

function goalPct(g: any): number {
  if (!g.target_total) return 0
  return Math.min(100, Math.round((Number(g.rec_qty || 0) / g.target_total) * 100))
}

function greet() {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}
const today = new Date()
const dateStr = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日 · ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][today.getDay()]}`
const hasThatDay = computed(() => !!thatDay.value && (thatDay.value.records.length > 0 || thatDay.value.reflections.length > 0))
const durText = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? m % 60 + 'm' : ''}` : `${m}m`
</script>

<template>
  <div class="page dash">
    <div class="page-head">
      <h1>{{ greet() }}{{ profile.nickname ? '，' + profile.nickname : '' }}</h1>
      <span class="sub">{{ dateStr }}</span>
      <span class="spacer"></span>
      <button class="btn primary" @click="showRecord = true">写学习记录</button>
    </div>

    <div class="grid">
      <section class="card pad span12 heat-card">
        <div class="card-title">这一年的学习足迹</div>
        <HeatMap :domain="store.domain" />
      </section>

      <section class="card pad span4 goals-card">
        <div class="card-title">进行中的目标</div>
        <div v-if="!goals.length" class="empty">
          <div class="leaf-mark">❧</div>
          还没有目标，去「目标」页种一个吧
        </div>
        <router-link v-for="g in goals" :key="g.id" to="/goals" class="g-row">
          <span class="g-dot"></span>
          <span class="g-title">{{ g.title }}</span>
          <span class="g-qty" v-if="g.target_total > 0">{{ Math.min(g.rec_qty || 0, g.target_total) }}/{{ g.target_total }}{{ g.target_unit }}</span>
          <span class="g-pct" v-else>{{ g.rec_count ? g.rec_count + '次' : '' }}</span>
          <div class="g-mini" v-if="g.target_total > 0"><i :style="{ width: goalPct(g) + '%' }"></i></div>
        </router-link>
      </section>

      <section class="card pad span4 recent-card">
        <div class="card-title">
          最近的记录
          <router-link to="/records" class="more">全部 ›</router-link>
        </div>
        <div v-if="!recent.length" class="empty">
          <div class="leaf-mark">✎</div>
          第一条记录从这里开始
        </div>
        <div v-for="r in recent" :key="r.id" class="row-item r-row">
          <span class="r-date">{{ r.date.slice(5) }}</span>
          <span class="r-content">{{ r.content || '（只记了时间）' }}</span>
          <span class="chip" v-if="r.duration_min">{{ durText(r.duration_min) }}</span>
        </div>
      </section>

      <section class="card pad span4 paper-stars td-card">
        <div class="card-title">那年今日</div>
        <template v-if="hasThatDay">
          <div v-for="r in thatDay!.records.slice(0, 5)" :key="'r' + r.id" class="row-item">
            <span class="r-date">{{ r.date.slice(0, 4) }}</span>
            <span class="r-content">{{ r.content || '（只记了时间）' }}</span>
          </div>
          <div v-for="x in thatDay!.reflections.slice(0, 3)" :key="'x' + x.id" class="row-item">
            <span class="r-date">{{ x.date.slice(0, 4) }}</span>
            <span class="r-content refl-text">“{{ x.content }}”</span>
          </div>
        </template>
        <div v-else class="empty td-empty">
          <div class="leaf-mark">✦</div>
          去年的今天还没有留下痕迹<br />记录得久了，这里会亮起来
        </div>
      </section>

      <section class="card wall-card span12">
        <StickyWall fill min-height="0px" :domain="store.domain" surface="dash" />
      </section>
    </div>

    <RecordModal v-if="showRecord" @close="showRecord = false" @saved="reload" />
  </div>
</template>

<style scoped>
.dash { display: flex; flex-direction: column; min-height: 100%; padding-bottom: 22px; }
.dash .grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: max-content;
  gap: 16px;
  /* 便签墙这一行：给足最小高度（随手记要够大有地方贴），够高时由 1fr 吃掉剩余空间把页面铺满 */
  grid-template-rows: max-content max-content minmax(360px, 1fr);
  /* 覆盖 .page > * { flex: none }：窗口够高就撑满，不够高时因为 shrink=0
     网格保持内容高度，溢出交给 .page 的 overflow-y 整页滚动 */
  flex: 1 0 auto;
  margin-top: 16px;
}
.span4 { grid-column: span 4; }
.span12 { grid-column: span 12; }
.dash .heat-card { padding: 14px 20px 12px; }
.goals-card, .recent-card, .td-card {
  min-height: 150px;
  max-height: 230px;
  overflow-y: auto;
  /* 内容超出时向下渐隐，避免最后一行被硬切 */
  -webkit-mask-image: linear-gradient(#000 calc(100% - 22px), transparent);
  mask-image: linear-gradient(#000 calc(100% - 22px), transparent);
}
/* 便签墙：卡片本身不设内边距上限，交给内部 StickyWall 拉伸填满 */
.dash .wall-card { padding: 13px 18px 15px; display: flex; flex-direction: column; }
.dash .wall-card > .wall-wrap { flex: 1; min-height: 360px; }
.more { margin-left: auto; font-size: 12px; color: var(--ink-3); text-decoration: none; font-weight: 400; }
.more:hover { color: var(--deep); }
/* 目标 */
.g-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 9px 4px;
  text-decoration: none;
  color: inherit;
  border-bottom: 1px dashed var(--line);
}
.g-row:last-child { border-bottom: none; }
.g-row:hover { background: var(--tint); border-radius: 8px; }
.g-dot { width: 8px; height: 8px; border-radius: 3px 2px 3px 2px; background: var(--grass); }
.g-title { font-size: 13.5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-qty { font-size: 11.5px; color: var(--deep); font-weight: 600; font-variant-numeric: tabular-nums; }
.g-pct { font-size: 11.5px; color: var(--ink-3); }
.g-mini { grid-column: 1 / -1; height: 4px; border-radius: 99px; background: var(--tint); overflow: hidden; margin: 2px 0 0 18px; }
.g-mini i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--grass), var(--leaf)); }
/* 记录 */
.r-row { align-items: flex-start; }
.r-date { font-size: 12px; color: var(--ink-3); flex: none; width: 46px; padding-top: 1px; font-variant-numeric: tabular-nums; }
.r-content {
  flex: 1; font-size: 13px; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.refl-text { color: var(--ink-2); font-family: "KaiTi", "STKaiti", inherit; }
.td-empty { padding: 30px 8px; }
.td-empty .leaf-mark { font-size: 20px; }
</style>
