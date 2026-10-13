<script setup lang="ts">
// 目标 / 学习路线共用的「关联资料」面板。
// 资料统一存在资料库里（materials），这里只负责把库里的资料挂到目标或路线节点上：
//   1) 关联已有 —— 从资料库挑一份挂过来
//   2) 新建资料 —— 现场建一份，同时进资料库并挂上来
// 目标/路线包含子孙时，会把子孙挂的资料一并列出来（用 owning 标签标出出处）。
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../api'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import Select from './Select.vue'
import { toast } from '../toast'
import type { Material } from '../../../shared/types'

const props = defineProps<{
  goalId?: number | null
  nodeId?: number | null
  domain: 'study' | 'hobby'
  /** 是否是最顶层（路线的领域 / 顶层目标）——只有顶层才显示「含下级」并可切换 */
  topLevel?: boolean
}>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const TYPE_LABEL: Record<string, string> = { web: '网页', video: '视频', image: '图片', software: '软件', file: '文件' }
const TYPE_ICON: Record<string, string> = { web: 'external', video: 'play', image: 'book', software: 'bottle', file: 'folder' }

const linked = ref<Material[]>([])
const loading = ref(false)
// 只用于把「挂在子孙节点上的资料」标出来
const goalTitles = ref<Record<number, string>>({})
const nodeTitles = ref<Record<number, string>>({})

const isGoal = computed(() => props.goalId != null)
const hasTarget = computed(() => props.goalId != null || props.nodeId != null)
const targetWord = computed(() => isGoal.value ? '目标' : '路线节点')

// 挂到当前对象上时写的字段：另一个字段一并清掉，保证一份资料只有一个归属
const targetPatch = computed(() => isGoal.value
  ? { goal_id: props.goalId as number, route_node_id: null }
  : { goal_id: null, route_node_id: props.nodeId as number })

function flatten(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flatten(n.children, acc) }
  return acc
}

async function load() {
  if (!hasTarget.value) { linked.value = []; return }
  loading.value = true
  try {
    linked.value = isGoal.value
      ? await api.materials.forGoal(props.goalId as number)
      : await api.materials.forNode(props.nodeId as number)
    await loadTitles()
  } finally { loading.value = false }
}

async function loadTitles() {
  try {
    const [gs, rs] = await Promise.all([
      api.goals.tree(props.domain),
      api.routes.tree(props.domain)
    ])
    const gm: Record<number, string> = {}
    for (const g of flatten(gs)) gm[g.id] = g.title
    const rm: Record<number, string> = {}
    for (const r of flatten(rs)) rm[r.id] = r.title
    goalTitles.value = gm
    nodeTitles.value = rm
  } catch { /* 标题只是装饰，取不到就算了 */ }
}

onMounted(load)
watch(() => [props.goalId, props.nodeId, props.domain], load)

// 这份资料是不是直接挂在我身上（而不是子孙）
function isDirect(m: Material): boolean {
  return isGoal.value ? m.goal_id === props.goalId : m.route_node_id === props.nodeId
}
// 层级规则：只有顶层才有「含下级 / 只看本层」的切换；下层一律只看自己这层直挂的
const scope = ref<'all' | 'direct'>('all')
const canToggle = computed(() => !!props.topLevel && hasTarget.value)
watch(() => [props.goalId, props.nodeId], () => { scope.value = 'all' })

const directItems = computed(() => linked.value.filter(isDirect))
const subItems = computed(() => linked.value.filter(m => !isDirect(m)))
// 现在该显示哪些：非顶层 / 切到「只看本层」→ 只有直挂的
const showSub = computed(() => canToggle.value && scope.value === 'all')
const showGroupHeads = computed(() => showSub.value && directItems.value.length > 0 && subItems.value.length > 0)
const shownCount = computed(() => showSub.value ? linked.value.length : directItems.value.length)
function ownerLabel(m: Material): string {
  if (m.goal_id != null) return '目标 · ' + (goalTitles.value[m.goal_id] || ('#' + m.goal_id))
  if (m.route_node_id != null) return '节点 · ' + (nodeTitles.value[m.route_node_id] || ('#' + m.route_node_id))
  return ''
}

function open(m: Material) { api.materials.open(m.id) }

async function unlink(m: Material) {
  await api.materials.update(m.id, { goal_id: null, route_node_id: null })
  await load()
  emit('changed')
  toast('已取消关联（资料还在资料库里）')
}

// ---------- 关联已有 ----------
const pickerOpen = ref(false)
const all = ref<Material[]>([])
const q = ref('')
async function openPicker() {
  if (!hasTarget.value) return
  all.value = await api.materials.list(undefined, props.domain)
  q.value = ''
  pickerOpen.value = true
}
const linkedIds = computed(() => new Set(linked.value.map(m => m.id)))
const candidates = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return all.value
    .filter(m => !linkedIds.value.has(m.id))
    .filter(m => !needle || (m.title || '').toLowerCase().includes(needle) || (m.source || '').toLowerCase().includes(needle))
})
async function link(m: Material) {
  await api.materials.update(m.id, targetPatch.value)
  pickerOpen.value = false
  await load()
  emit('changed')
  toast('已关联')
}

// ---------- 新建资料 ----------
const formOpen = ref(false)
const form = ref<any>({ type: 'web', title: '', source: '', note: '' })
function openForm() {
  if (!hasTarget.value) return
  form.value = { type: 'web', title: '', source: '', note: '' }
  formOpen.value = true
}
async function saveNew() {
  if (!form.value.title.trim()) { toast('给这份资料起个名字吧'); return }
  await api.materials.create({ ...form.value, domain: props.domain, ...targetPatch.value })
  formOpen.value = false
  await load()
  emit('changed')
  toast('已新建并关联')
}
</script>

<template>
  <div class="mlp">
    <div class="mlp-head">
      <span class="mlp-title">关联资料<em>共 {{ shownCount }} 条</em></span>
      <span class="spacer"></span>
      <button class="btn ghost sm" :disabled="!hasTarget" @click="openPicker"><Icon name="link" :size="12" /> 关联已有</button>
      <button class="btn soft sm" :disabled="!hasTarget" @click="openForm"><Icon name="plus" :size="12" /> 新建资料</button>
    </div>

    <!-- 只有顶层才有范围切换：含下级（总共）/ 只看本层 -->
    <div class="mlp-scoperow" v-if="canToggle">
      <div class="mlp-seg">
        <button :class="{ on: scope === 'all' }" @click="scope = 'all'">含下级</button>
        <button :class="{ on: scope === 'direct' }" @click="scope = 'direct'">只看本层</button>
      </div>
    </div>

    <div v-if="!hasTarget" class="mlp-empty">先选一个{{ targetWord }}，再挂资料</div>
    <template v-else>
      <div v-if="!shownCount && !loading" class="mlp-empty">
        {{ showSub ? '还没有挂资料 —— 从资料库「关联已有」，或直接「新建资料」' : '这一层还没有直挂的资料 —— 从资料库「关联已有」，或直接「新建资料」' }}
      </div>
      <!-- 「含下级」范围：本层级 / 含下级 两组（都有内容才显示标题） -->
      <template v-if="showSub && linked.length">
        <template v-if="showGroupHeads">
          <div class="mlp-ghead">本层级<em>{{ directItems.length }}</em></div>
          <div v-for="m in directItems" :key="m.id" class="mlp-item">
            <span class="mi-ic"><Icon :name="TYPE_ICON[m.type] || 'book'" :size="14" /></span>
            <div class="mi-body" @click="open(m)" :title="m.source">
              <p class="mi-title">{{ m.title }}</p>
              <p class="mi-src">{{ m.source || '（没有填位置）' }}</p>
            </div>
            <span class="mi-ops">
              <button title="打开" @click="open(m)"><Icon name="external" :size="12" /></button>
              <button class="del" title="取消关联" @click="unlink(m)"><Icon name="unlink" :size="12" /></button>
            </span>
          </div>
          <div class="mlp-ghead sub">含下级<em>{{ subItems.length }}</em></div>
          <div v-for="m in subItems" :key="m.id" class="mlp-item sub">
            <span class="mi-ic"><Icon :name="TYPE_ICON[m.type] || 'book'" :size="14" /></span>
            <div class="mi-body" @click="open(m)" :title="m.source">
              <p class="mi-title">{{ m.title }}</p>
              <p class="mi-src">{{ m.source || '（没有填位置）' }}</p>
            </div>
            <span class="mi-owner">{{ ownerLabel(m) }}</span>
            <span class="mi-ops">
              <button title="打开" @click="open(m)"><Icon name="external" :size="12" /></button>
            </span>
          </div>
        </template>
        <template v-else>
          <div v-for="m in linked" :key="m.id" class="mlp-item" :class="{ sub: !isDirect(m) }">
            <span class="mi-ic"><Icon :name="TYPE_ICON[m.type] || 'book'" :size="14" /></span>
            <div class="mi-body" @click="open(m)" :title="m.source">
              <p class="mi-title">{{ m.title }}</p>
              <p class="mi-src">{{ m.source || '（没有填位置）' }}</p>
            </div>
            <span class="mi-owner" v-if="!isDirect(m)">{{ ownerLabel(m) }}</span>
            <span class="mi-ops">
              <button title="打开" @click="open(m)"><Icon name="external" :size="12" /></button>
              <button v-if="isDirect(m)" class="del" title="取消关联" @click="unlink(m)"><Icon name="unlink" :size="12" /></button>
            </span>
          </div>
        </template>
      </template>
      <!-- 「只看本层」或非顶层：只有直挂的 -->
      <template v-else-if="directItems.length">
        <div v-for="m in directItems" :key="m.id" class="mlp-item">
          <span class="mi-ic"><Icon :name="TYPE_ICON[m.type] || 'book'" :size="14" /></span>
          <div class="mi-body" @click="open(m)" :title="m.source">
            <p class="mi-title">{{ m.title }}</p>
            <p class="mi-src">{{ m.source || '（没有填位置）' }}</p>
          </div>
          <span class="mi-ops">
            <button title="打开" @click="open(m)"><Icon name="external" :size="12" /></button>
            <button class="del" title="取消关联" @click="unlink(m)"><Icon name="unlink" :size="12" /></button>
          </span>
        </div>
      </template>
    </template>

    <!-- 关联已有 -->
    <Modal v-if="pickerOpen" title="从资料库关联" @close="pickerOpen = false" wide>
      <input v-model="q" class="input" placeholder="按名称或位置搜一下…" style="margin-bottom: 10px;" />
      <div class="pick-list">
        <div v-for="m in candidates" :key="m.id" class="pick-row" @click="link(m)">
          <span class="mi-ic"><Icon :name="TYPE_ICON[m.type] || 'book'" :size="14" /></span>
          <div class="mi-body">
            <p class="mi-title">{{ m.title }}</p>
            <p class="mi-src">{{ m.source }}</p>
          </div>
          <span class="pick-add"><Icon name="plus" :size="12" /> 关联</span>
        </div>
        <div v-if="!candidates.length" class="mlp-empty">
          {{ q ? '没有匹配的资料' : '资料库里还没有可关联的资料，去「资料库」先收一份吧' }}
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="pickerOpen = false">关闭</button>
      </template>
    </Modal>

    <!-- 新建资料 -->
    <Modal v-if="formOpen" :title="`新建资料 · 挂到${targetWord}`" @close="formOpen = false">
      <div class="nf">
        <div class="nf-row">
          <div class="field" style="width: 130px;">
            <label>类型</label>
            <Select v-model="form.type" :options="Object.keys(TYPE_LABEL).map(k => ({ value: k, label: TYPE_LABEL[k] }))" />
          </div>
          <div class="field grow">
            <label>名称</label>
            <input v-model="form.title" class="input" placeholder="这份资料叫什么" />
          </div>
        </div>
        <div class="field">
          <label>位置（网址或路径）</label>
          <input v-model="form.source" class="input" :placeholder="form.type === 'web' ? 'https://…' : '本地路径，可留空'" />
        </div>
        <div class="field">
          <label>备注</label>
          <textarea v-model="form.note" class="textarea" rows="2"></textarea>
        </div>
      </div>
      <template #foot>
        <button class="btn" @click="formOpen = false">取消</button>
        <button class="btn primary" @click="saveNew">收好并关联</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.mlp { display: flex; flex-direction: column; }
.mlp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mlp-title { font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.mlp-title em { font-style: normal; font-weight: 400; font-size: 11px; color: var(--ink-3); margin-left: 6px; }
.mlp-head .btn { padding: 3px 9px; font-size: 12px; line-height: 1.5; }
.mlp-head .btn:disabled { opacity: .45; cursor: not-allowed; }
.spacer { flex: 1; }
.mlp-empty { font-size: 12.5px; color: var(--ink-3); padding: 8px 0; }
.mlp-ghead {
  display: flex; align-items: baseline; gap: 6px;
  font-size: 11.5px; font-weight: 650; color: var(--ink-2);
  margin: 8px 0 2px; padding-left: 2px;
}
.mlp-ghead em { font-style: normal; font-weight: 400; font-size: 10.5px; color: var(--ink-3); }
.mlp-ghead.sub { color: var(--lake); margin-top: 10px; }
/* 顶层节点的范围切换：含下级 / 只看本层 */
.mlp-scoperow { margin: 0 0 6px; }
.mlp-seg {
  display: inline-flex;
  background: var(--tint);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 2px;
}
.mlp-seg button {
  border: none; background: transparent; cursor: pointer;
  font-size: 11.5px; color: var(--ink-3);
  padding: 2px 10px; border-radius: 999px;
  transition: background .16s, color .16s;
}
.mlp-seg button:hover { color: var(--ink-2); }
.mlp-seg button.on { background: var(--deep); color: var(--on-deep); font-weight: 600; }
.mlp-item { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; }
.mlp-item:hover { background: var(--tint); }
.mlp-item.sub { background: color-mix(in srgb, var(--lake) 5%, transparent); }
.mi-ic { flex: none; color: var(--deep); display: flex; }
.mi-body { flex: 1; min-width: 0; cursor: pointer; }
.mi-title { font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi-src { font-size: 10.5px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi-owner {
  flex: none; font-size: 10.5px; color: var(--lake);
  background: color-mix(in srgb, var(--lake) 9%, transparent);
  border-radius: 999px; padding: 1px 8px;
}
/* 操作按钮常驻可见 */
.mi-ops { display: flex; gap: 1px; flex: none; }
.mi-ops button {
  border: none; background: none; color: var(--ink-3);
  cursor: pointer; padding: 3px; border-radius: 6px; line-height: 0;
  transition: background .15s, color .15s;
}
.mi-ops button:hover { color: var(--deep); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.mi-ops button.del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
.pick-list { max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; }
.pick-row { display: flex; align-items: center; gap: 9px; padding: 8px 8px; border-radius: 8px; cursor: pointer; }
.pick-row:hover { background: var(--tint); }
.pick-add {
  flex: none; display: inline-flex; align-items: center; gap: 3px;
  font-size: 11.5px; color: var(--leaf);
  border: 1px solid color-mix(in srgb, var(--grass) 45%, transparent);
  border-radius: 999px; padding: 2px 10px;
}
.nf { display: flex; flex-direction: column; gap: 12px; }
.nf-row { display: flex; gap: 12px; }
.grow { flex: 1; }
</style>
