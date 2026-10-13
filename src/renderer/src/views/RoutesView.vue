<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { api } from '../api'
import RouteNode from '../components/RouteNode.vue'
import InputDialog from '../components/InputDialog.vue'
import MaterialLinkPanel from '../components/MaterialLinkPanel.vue'
import Icon from '../components/Icon.vue'
import RecordModal from '../components/RecordModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'
import { store } from '../store'
import { useSplit } from '../useSplit'
import type { StudyRecord, Reflection, RecSummary } from '../../../shared/types'

// 左右分栏：默认 左 1.15 : 右 1（与最初版式一致），可拖拽调节并记住
const colsEl = ref<HTMLElement | null>(null)
const { dragging: splitDragging, onDown: onSplitDown, gridStyle: splitStyle } = useSplit('sh-split-routes', 0.535, colsEl)

const tree = ref<any[]>([])
const expanded = ref<Set<number>>(new Set())
// 只在「首次载入本域」时自动展开两层；之后的增删改都保留用户手动折叠的状态
const expandedInited = ref(false)
const activeRoot = ref<number | null>(null)   // 左上角切换的领域（顶层路线）
const selNode = ref<any | null>(null)          // 右栏聚焦的节点
const scope = ref<'node' | 'all'>('all')       // 右栏记录范围：这个点 / 整条路线
const STATUS: Record<string, string> = { todo: '未开始', doing: '进行中', paused: '暂停', done: '完成', abandoned: '放弃' }

const nameDlg = ref<InstanceType<typeof InputDialog> | null>(null)
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)
// 右栏数据
const recData = ref<{ records: StudyRecord[]; reflections: Reflection[] }>({ records: [], reflections: [] })
const summary = ref<RecSummary | null>(null)
const showNewRecord = ref(false)

const root = computed(() => tree.value.find(r => r.id === activeRoot.value) || tree.value[0] || null)

async function load() {
  tree.value = await api.routes.tree(store.domain)
  if (!activeRoot.value || !tree.value.some(r => r.id === activeRoot.value)) {
    activeRoot.value = tree.value[0]?.id ?? null
  }
  if (!expandedInited.value) {
    // 首次：均匀展开两层，让竖着的路线一开始就有内容
    const s = new Set(expanded.value)
    for (const r of tree.value) {
      s.add(r.id)
      for (const c of r.children || []) s.add(c.id)
    }
    expanded.value = s
    expandedInited.value = true
  } else {
    // 之后：只保留仍然存在的节点，绝不因为一次刷新就把折叠的又摊开
    const alive = new Set(flatten(tree.value).map(n => n.id))
    expanded.value = new Set([...expanded.value].filter(id => alive.has(id)))
  }
  syncSel()
}
onMounted(load)
// 切换学习/爱好：学习路线也跟着换域，重置当前领域后重新拉取（新域允许再自动展开一次）
watch(() => store.domain, () => {
  activeRoot.value = null
  selNode.value = null
  tree.value = []
  expanded.value = new Set()
  expandedInited.value = false
  load()
})

// 领域切换 / 树变化后：把右栏聚焦重置到根节点
function syncSel() {
  const r = root.value
  if (!r) { selNode.value = null; return }
  if (!selNode.value || !nodeInRoot(selNode.value.id)) selNode.value = r
  loadRight()
}
function nodeInRoot(id: number): boolean {
  const r = root.value
  if (!r) return false
  let found = false
  const walk = (n: any) => { if (n.id === id) found = true; for (const k of n.children || []) walk(k) }
  walk(r)
  return found
}

watch(activeRoot, () => { selNode.value = null; syncSel() })
watch([selNode, scope], () => loadRight())

async function loadRight() {
  const n = selNode.value
  if (!n) { recData.value = { records: [], reflections: [] }; summary.value = null; return }
  const only = scope.value === 'node'
  const [d, s] = await Promise.all([
    api.records.forNode(n.id, { only }),
    api.records.summaryForNode(n.id)
  ])
  recData.value = d
  summary.value = s
}

function flatten(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flatten(n.children, acc) }
  return acc
}

function toggle(id: number) {
  const s = expanded.value
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = new Set(s)
}
function pickNode(n: any) {
  // 点的是同一个点 → 不动，保留用户的「这个点 / 整条路线」选择
  if (selNode.value?.id === n.id) return
  selNode.value = n
  // 换到新节点时默认看「整条路线」（含子孙）的汇总
  scope.value = 'all'
}
// 点左栏标题 = 选中整条路线（聚焦根领域）
function pickRoot() {
  const r = root.value
  if (!r) return
  selNode.value = r
  scope.value = 'all'
}

async function addRoute() {
  const t = await nameDlg.value?.ask()
  if (!t?.trim()) return
  const r = await api.routes.create({ parent_id: null, title: t.trim(), domain: store.domain })
  activeRoot.value = r.id
  await load()
  toast('已新建领域')
}

async function addChild(n: any) {
  const t = await nameDlg.value?.ask()
  if (!t?.trim()) return
  await api.routes.create({ parent_id: n.id, title: t.trim() })
  expanded.value.add(n.id)
  await load()
  toast('已加一个节点')
}

async function upd(n: any, patch: any) {
  await api.routes.update(n.id, patch)
  await load()
}

// 数一数连带删掉多少节点，确认框里说清楚
function countNodes(n: any): number {
  let k = 0
  const walk = (x: any) => { for (const c of x.children || []) { k++; walk(c) } }
  walk(n)
  return k
}

async function del(n: any) {
  const kids = countNodes(n)
  const ok = await confirmDlg.value?.ask({
    message: `删除节点「${n.title}」？`,
    detail: kids
      ? `连它下面的 ${kids} 个子节点一起删除，这些节点上的学习记录关联会一并解除。删除后无法恢复。`
      : '删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.routes.remove(n.id)
  if (selNode.value?.id === n.id) selNode.value = null
  await load()
  toast('已删除节点')
}

// 顶层「领域」的重命名 / 删除（之前完全没有入口）
async function renameRoute() {
  const r = root.value
  if (!r) return
  const t = await nameDlg.value?.ask(r.title)
  if (!t?.trim() || t.trim() === r.title) return
  await api.routes.update(r.id, { title: t.trim() })
  await load()
  toast('已重命名')
}

async function delRoute() {
  const r = root.value
  if (!r) return
  const kids = countNodes(r)
  const ok = await confirmDlg.value?.ask({
    message: `删除整条路线「${r.title}」？`,
    detail: kids
      ? `这条路线连同下面 ${kids} 个节点都会被删除，删除后无法恢复。`
      : '删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.routes.remove(r.id)
  activeRoot.value = null
  selNode.value = null
  await load()
  toast('已删除路线')
}

// ---------- 资料 ----------
// 资料统一进资料库（materials）并挂到 route_node_id 上，由 MaterialLinkPanel 负责增删关联。
// 点树上的资料角标 → 聚焦到这个节点（@res="pickNode"），右栏就会显示它（含子孙）关联的资料。

const durText = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + m % 60 + 'm' : ''}` : `${m}min`

// 右栏统计：全部范围用后端汇总，本节点范围用明细现算
const rightStat = computed(() => {
  if (scope.value === 'node') {
    const rs = recData.value.records
    return {
      count: rs.length,
      minutes: rs.reduce((s, r) => s + (r.duration_min || 0), 0),
      refl: recData.value.reflections.length
    }
  }
  const s = summary.value
  return { count: s?.count || 0, minutes: s?.minutes || 0, refl: s?.refl || 0 }
})
</script>

<template>
  <div class="page routes-page">
    <div class="page-head">
      <h1>学习路线</h1>
      <span class="sub">左上切换领域 · 左边是路线树 · 右边看这个点的资料与学习记录</span>
      <span class="spacer"></span>
      <button class="btn primary" @click="addRoute"><Icon name="plus" :size="14" /> 新领域</button>
    </div>

    <div v-if="!tree.length" class="card empty" style="padding: 44px 0;">
      <div class="leaf-mark">❧</div>
      当前是「{{ store.domain === 'study' ? '学习' : '爱好' }}」域，还没有路线 —— 点右上角「新领域」立一条吧
    </div>

    <div v-else class="rt-layout">
      <!-- 左上：领域切换 -->
      <div class="domain-tabs">
        <button v-for="r in tree" :key="r.id" class="dtab" :class="{ on: r.id === activeRoot }"
          @click="activeRoot = r.id">
          {{ r.title }}
        </button>
        <button class="dtab add" title="新建领域" @click="addRoute"><Icon name="plus" :size="12" /></button>
      </div>

      <div class="rt-cols" ref="colsEl" :class="{ dragging: splitDragging }" :style="splitStyle">
        <!-- 左：竖向路线树 -->
        <section class="col-tree card">
          <div class="col-head" @click="pickRoot">
            <span class="ct-title">{{ root?.title }}</span>
            <span class="ct-stat" v-if="root">
              <b>{{ root.rec_count || 0 }}</b> 次 · {{ durText(root.rec_minutes || 0) }}
            </span>
            <span class="spacer"></span>
            <span class="ch-ops">
              <button title="重命名这条路线" @click.stop="renameRoute"><Icon name="edit" :size="12" /></button>
              <button title="加一个顶层节点" @click.stop="addChild(root)"><Icon name="plus" :size="12" /></button>
              <button class="del" title="删除整条路线" @click.stop="delRoute"><Icon name="trash" :size="12" /></button>
            </span>
          </div>
          <div class="col-body">
            <div class="r-overall">
              <div class="progress" style="flex:1;"><i :style="{ width: (root?.progress || 0) + '%' }"></i></div>
              <b class="ov">{{ root?.progress || 0 }}%</b>
            </div>
            <div v-if="!root?.children?.length" class="empty" style="padding: 20px 0;">
              还没有节点 —— 点上方「＋」拆解这条路线
            </div>
            <RouteNode v-for="c in root?.children || []" :key="c.id" :n="c" :depth="0"
              :expanded="expanded" :status-map="STATUS" :sel-id="selNode?.id ?? null"
              @toggle="toggle" @upd="upd" @del="del" @askadd="addChild" @res="pickNode" @pick="pickNode" />
          </div>
          <div class="col-foot">
            <button class="btn soft sm" @click="showNewRecord = true"><Icon name="pen" :size="12" /> 写一条学习记录</button>
          </div>
        </section>

        <!-- 中：拖拽条，调左右比例 -->
        <div class="splitter" title="拖动调整左右宽度" @pointerdown="onSplitDown"><i></i></div>

        <!-- 右：关联资料 + 学习记录 -->
        <section class="col-side">
          <!-- 聚焦节点 -->
          <div class="card side-card">
            <div class="sc-head">
              <span class="focus-name">{{ selNode?.title || '整条路线' }}</span>
              <span class="badge" v-if="selNode" :class="selNode.status">{{ STATUS[selNode.status] }}</span>
              <span class="spacer"></span>
              <div class="scope-seg">
                <button :class="{ on: scope === 'node' }" @click="scope = 'node'">这个点</button>
                <button :class="{ on: scope === 'all' }" @click="scope = 'all'">整条路线</button>
              </div>
            </div>
            <div class="stat-row">
              <span><b>{{ rightStat.count }}</b> 次学习</span>
              <span><b>{{ durText(rightStat.minutes) }}</b></span>
              <span><b>{{ rightStat.refl }}</b> 条感想</span>
              <span class="drill" @click="selNode && (showNewRecord = true)">＋ 记一条</span>
            </div>
          </div>

          <!-- 关联资料：和资料库打通，这里的增删都会写回资料库；
               changed → 重拉树，资料角标(mat_count)跟着刷新 -->
          <div class="card side-card">
            <MaterialLinkPanel :node-id="selNode?.id ?? null" :domain="store.domain"
              :top-level="selNode?.id === root?.id" @changed="load" />
          </div>

          <!-- 学习记录（只给摘要 + 可展开明细） -->
          <div class="card side-card grow-side">
            <div class="sc-title">
              学习记录
              <em>{{ scope === 'node' ? '只看这个点' : '含全部子节点' }}</em>
            </div>
            <div class="rec-list">
              <div v-for="r in recData.records.slice(0, 60)" :key="r.id" class="row-item">
                <span class="fp-date">{{ r.date }}</span>
                <p class="fp-body">{{ r.content || '（只记了时间）' }}<i v-if="r.duration_min"> · {{ durText(r.duration_min) }}</i></p>
              </div>
              <div v-if="!recData.records.length" class="sec-empty">这里还没有学习记录</div>
            </div>
            <div v-if="recData.reflections.length" class="refl-wrap">
              <div v-for="rf in recData.reflections.slice(0, 4)" :key="'rf' + rf.id" class="refl-line">「{{ rf.content }}」</div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <RecordModal v-if="showNewRecord" :preset-node="selNode?.id ?? null" @close="showNewRecord = false" @saved="loadRight" />
    <InputDialog ref="nameDlg" title="名称" placeholder="路线 / 节点名称" />
    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.routes-page { display: flex; flex-direction: column; height: 100%; padding-bottom: 16px; }
.page-head { flex: none; }

/* 左上角领域切换 */
.domain-tabs { flex: none; display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 12px; }
.dtab {
  border: 1px solid var(--line); background: var(--card); cursor: pointer;
  font-size: 13px; color: var(--ink-2); padding: 6px 15px; border-radius: 999px;
  transition: all .16s;
}
.dtab:hover { border-color: var(--grass); color: var(--ink); }
.dtab.on { background: var(--deep); border-color: var(--deep); color: var(--on-deep); font-weight: 600; }
.dtab.add { padding: 6px 11px; color: var(--ink-3); }

/* 两栏布局：左树 / 右资料+记录；比例可拖拽（gridStyle），minmax(0,·) 保证长链接不会把左边挤扁 */
.rt-layout { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rt-cols { flex: 1; min-height: 0; display: grid; }
.rt-cols.dragging { user-select: none; }
.splitter { cursor: col-resize; position: relative; touch-action: none; }
.splitter i {
  position: absolute; top: 4px; bottom: 4px; left: 6px; width: 2px;
  border-radius: 2px; background: transparent; transition: background .15s;
}
.splitter:hover i, .rt-cols.dragging .splitter i {
  background: color-mix(in srgb, var(--grass) 55%, transparent);
}
.col-tree { display: flex; flex-direction: column; min-height: 0; padding: 14px 16px; }
.col-head { flex: none; display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: pointer; }
/* 顶层路线的操作按钮：常驻可见 */
.ch-ops { display: flex; gap: 1px; flex: none; }
.ch-ops button {
  border: none; background: none; color: var(--ink-3);
  cursor: pointer; padding: 3px; border-radius: 6px; line-height: 0;
  transition: background .15s, color .15s;
}
.ch-ops button:hover { color: var(--deep); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.ch-ops button.del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
.ct-title { font-size: 15px; font-weight: 650; color: var(--ink); }
.ct-stat { font-size: 11.5px; color: var(--ink-3); }
.ct-stat b { color: var(--deep); }
.col-body { flex: 1; min-height: 0; overflow-y: auto; }
.r-overall { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ov { font-size: 13px; color: var(--deep); min-width: 36px; text-align: right; }
.col-foot { flex: none; border-top: 1px dashed var(--line); padding-top: 10px; margin-top: 8px; }

.col-side { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.side-card { padding: 13px 15px; display: flex; flex-direction: column; }
.side-card.grow-side { flex: 1; min-height: 0; }
.sc-head { display: flex; align-items: center; gap: 8px; }
.focus-name { font-size: 14.5px; font-weight: 620; color: var(--ink); }
.spacer { flex: 1; }
/* 范围切换：和「学习足迹」保持同一套胶囊样式 */
.scope-seg {
  display: inline-flex;
  background: var(--tint);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px;
  flex: none;
}
.scope-seg button {
  border: none; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--ink-3);
  padding: 4px 12px; border-radius: 999px;
  transition: background .16s, color .16s;
}
.scope-seg button:hover { color: var(--ink-2); }
.scope-seg button.on { background: var(--deep); color: var(--on-deep); font-weight: 600; }
.stat-row { display: flex; align-items: center; gap: 16px; font-size: 12.5px; color: var(--ink-2); margin-top: 10px; }
.stat-row b { color: var(--deep); font-size: 14px; }
.drill { margin-left: auto; color: var(--leaf); cursor: pointer; font-size: 12px; }
.drill:hover { text-decoration: underline; }
.sc-title { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; }
.sc-title em { font-style: normal; font-weight: 400; font-size: 11px; color: var(--ink-3); }
.sc-title .btn { margin-left: auto; }
.sec-empty { font-size: 12.5px; color: var(--ink-3); padding: 8px 0; }
.res-item { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
.res-item:hover { background: var(--tint); }
.ri-icon { flex: none; font-size: 11px; }
.ri-body { flex: 1; min-width: 0; }
.ri-title { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ri-path { font-size: 10.5px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ri-node { flex: none; font-size: 10.5px; color: var(--lake); background: color-mix(in srgb, var(--lake) 8%, transparent); border-radius: 999px; padding: 1px 8px; }
.rec-list { flex: 1; min-height: 0; overflow-y: auto; }
.fp-date { font-size: 11.5px; color: var(--ink-3); flex: none; width: 76px; padding-top: 2px; }
.fp-body { flex: 1; font-size: 12.5px; color: var(--ink-2); }
.fp-body i { font-style: normal; color: var(--ink-3); font-size: 11.5px; }
.refl-wrap { flex: none; border-top: 1px dashed var(--line); margin-top: 6px; padding-top: 6px; }
.refl-line { font-size: 12.5px; color: var(--lake); font-family: "KaiTi", "STKaiti", inherit; margin-top: 4px; }
.res-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
</style>
