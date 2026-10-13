<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Modal from './Modal.vue'
import TagInput from './TagInput.vue'
import Select from './Select.vue'
import { api } from '../api'
import { store } from '../store'
import type { Goal, StudyRecord, RouteNode } from '../../../shared/types'

const props = defineProps<{
  record?: StudyRecord | null
  // 从路线页进来时预选好的节点（精确到学习路线的某个点）
  presetNode?: number | null
  presetGoal?: number | null
}>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const date = ref(props.record?.date || new Date().toISOString().slice(0, 10))
const content = ref(props.record?.content || '')
const timeMode = ref<'duration' | 'range'>(props.record?.end_time ? 'range' : 'duration')
// 时长的录入单位：h+min（时+分）/ h（只填小时）/ min（只填分钟）
const durUnit = ref<'hm' | 'h' | 'min'>('min')
const durH = ref<number | ''>('')
const durM = ref<number | ''>('')
const durOnly = ref<number | ''>('')   // h 模式或 min 模式共用一个输入框
const startTime = ref(props.record?.start_time || '')
const endTime = ref(props.record?.end_time || '')
const goalId = ref<number | null>(props.record?.goal_id ?? props.presetGoal ?? null)
const routeNodeId = ref<number | null>(props.record?.route_node_id ?? props.presetNode ?? null)
const tags = ref<string[]>(props.record?.tags ? [...props.record.tags] : [])
const errorHint = ref('')
// 第二张纸：感想
const reflContent = ref('')
const reflTags = ref<string[]>([])
const goals = ref<Goal[]>([])
const nodes = ref<RouteNode[]>([])
const goalsFlat = ref<any[]>([])
const nodesFlat = ref<any[]>([])

// 用编辑中已有的时长回填三个输入框
function seedDuration(minutes: number) {
  const m = Number(minutes) || 0
  if (m <= 0) return
  if (m % 60 === 0) {
    // 整数小时：默认按「只填小时」回填，更直观
    durUnit.value = 'h'
    durOnly.value = m / 60
  } else {
    durUnit.value = 'hm'
    durH.value = Math.floor(m / 60) || ''
    durM.value = m % 60 || ''
  }
}
if (props.record?.duration_min) seedDuration(props.record.duration_min)

onMounted(async () => {
  const [gt, rt] = await Promise.all([api.goals.tree(store.domain), api.routes.tree(store.domain)])
  goals.value = flatten(gt)
  nodes.value = flatten(rt)
  goalsFlat.value = withDepth(gt)
  nodesFlat.value = withDepth(rt)
})

function flatten(nodes: any[], acc: any[] = []): any[] {
  for (const n of nodes) { acc.push(n); if (n.children?.length) flatten(n.children, acc) }
  return acc
}

// 保留层级信息：给每层加缩进前缀，下拉里就能看出父子关系、也不会认错同名节点
function withDepth(list: any[], depth = 0, acc: any[] = []): any[] {
  for (const n of list) {
    acc.push({ id: n.id, title: n.title, depth })
    if (n.children?.length) withDepth(n.children, depth + 1, acc)
  }
  return acc
}
const indent = (depth: number) => depth > 0 ? '　'.repeat(depth) + '· ' : ''

const goalOptions = computed(() => [
  { value: null, label: '不关联' },
  ...goalsFlat.value.map(g => ({ value: g.id, label: indent(g.depth) + g.title }))
])
const nodeOptions = computed(() => [
  { value: null, label: '不关联' },
  ...nodesFlat.value.map(n => ({ value: n.id, label: indent(n.depth) + n.title }))
])

// 统一的时长（分钟）计算结果：三种输入方式汇总到一处
const durMinutes = computed<number>(() => {
  if (durUnit.value === 'hm') return (Number(durH.value) || 0) * 60 + (Number(durM.value) || 0)
  if (durUnit.value === 'h') return Math.round((Number(durOnly.value) || 0) * 60)
  return Math.round(Number(durOnly.value) || 0)
})

const computedDuration = computed(() => {
  if (timeMode.value !== 'range' || !startTime.value || !endTime.value) return null
  const [sh, sm] = startTime.value.split(':').map(Number)
  const [eh, em] = endTime.value.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  return mins
})

async function save() {
  const dur = timeMode.value === 'range' ? (computedDuration.value ?? 0) : durMinutes.value
  const hasSomething = content.value.trim() || dur > 0
  if (!hasSomething) {
    errorHint.value = '至少写一句内容、或记一个时长，才值得存下来'
    return
  }
  errorHint.value = ''
  const data: any = {
    date: date.value,
    content: content.value.trim(),
    duration_min: dur,
    goal_id: goalId.value,
    route_node_id: routeNodeId.value,
    domain: store.domain,
    tags: tags.value,
    start_time: startTime.value,
    end_time: timeMode.value === 'range' ? endTime.value : ''
  }
  if (props.record) {
    await api.records.update(props.record.id, data)
  } else {
    const rec = await api.records.create(data)
    if (reflContent.value.trim()) {
      await api.reflections.create({
        record_id: rec.id,
        date: date.value,
        content: reflContent.value.trim(),
        tags: reflTags.value
      })
    }
  }
  emit('saved')
  emit('close')
}
const durText = (m: number) => m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60 ? m % 60 + ' 分' : ''}`.trim() : `${m} 分钟`

// 切换录入单位时，把已填的数字换算过去，不丢用户输入
function switchUnit(u: 'hm' | 'h' | 'min') {
  const cur = durMinutes.value
  durUnit.value = u
  if (u === 'h') { durOnly.value = cur ? Math.round((cur / 60) * 10) / 10 : '' }
  else if (u === 'min') { durOnly.value = cur || '' }
  else { durH.value = Math.floor(cur / 60) || ''; durM.value = cur % 60 || '' }
}
</script>

<template>
  <Modal :title="record ? '编辑记录' : '写学习记录'" wide @close="emit('close')">
    <div class="two-paper" v-if="!record">
      <!-- 纸一：记录（方格纸） -->
      <section class="paper paper-grid">
        <h3>今天学了什么 <span class="opt">内容可不填</span></h3>
        <div class="row">
          <div class="field grow">
            <label>日期</label>
            <input v-model="date" type="date" class="input" />
          </div>
          <div class="field grow">
            <label>记时间的方式</label>
            <Select v-model="timeMode" :options="[
              { value: 'duration', label: '只记时长' },
              { value: 'range', label: '起止时间（自动算）' }
            ]" />
          </div>
        </div>
        <div class="row" v-if="timeMode === 'duration'">
          <div class="field grow">
            <label>时长
              <span class="seg">
                <button :class="{ on: durUnit === 'hm' }" @click="switchUnit('hm')">时+分</button>
                <button :class="{ on: durUnit === 'h' }" @click="switchUnit('h')">时</button>
                <button :class="{ on: durUnit === 'min' }" @click="switchUnit('min')">分</button>
              </span>
            </label>
            <div v-if="durUnit === 'hm'" class="dur-row">
              <input v-model="durH" type="number" min="0" class="input" placeholder="0" />
              <span class="unit">时</span>
              <input v-model="durM" type="number" min="0" max="59" class="input" placeholder="0" />
              <span class="unit">分</span>
            </div>
            <div v-else class="dur-row">
              <input v-model="durOnly" type="number" min="0" class="input" :placeholder="durUnit === 'h' ? '如 1.5' : '如 45'" />
              <span class="unit">{{ durUnit === 'h' ? '小时' : '分钟' }}</span>
            </div>
          </div>
          <div class="field grow">
            <label>起始时间 <span class="opt">选填</span></label>
            <input v-model="startTime" type="time" class="input" />
          </div>
        </div>
        <div class="row" v-else>
          <div class="field grow">
            <label>开始时间</label>
            <input v-model="startTime" type="time" class="input" />
          </div>
          <div class="field grow">
            <label>结束时间</label>
            <input v-model="endTime" type="time" class="input" />
          </div>
        </div>
        <div class="dur-hint" v-if="timeMode === 'range' && computedDuration != null && computedDuration > 0">
          ⏳ 自动算出：{{ durText(computedDuration) }}
        </div>
        <div class="dur-hint" v-else-if="timeMode === 'duration' && durMinutes > 0">
          ⏳ 记作：{{ durText(durMinutes) }}
        </div>
        <div class="field">
          <label>记录内容</label>
          <textarea v-model="content" class="textarea" placeholder="学的内容、做了什么、进展到哪…" rows="3"></textarea>
        </div>
        <div class="field">
          <label>关联目标</label>
          <Select v-model="goalId" :options="goalOptions" placeholder="不关联" />
        </div>
        <div class="field">
          <label>关联路线节点</label>
          <Select v-model="routeNodeId" :options="nodeOptions" placeholder="不关联" />
        </div>
        <div class="field">
          <label>标签</label>
          <TagInput v-model="tags" />
        </div>
      </section>

      <!-- 纸二：感想（横线纸） -->
      <section class="paper back paper-lines">
        <h3>顺便写点感想 <span class="opt">可不填</span></h3>
        <div class="field grow">
          <textarea v-model="reflContent" class="textarea refl" placeholder="这一段学习的感受、想法、启发…"></textarea>
        </div>
        <div class="field">
          <label>标签</label>
          <TagInput v-model="reflTags" />
        </div>
      </section>
    </div>

    <div class="one-paper" v-else>
      <section class="paper paper-grid">
        <div class="row">
          <div class="field grow">
            <label>日期</label>
            <input v-model="date" type="date" class="input" />
          </div>
          <div class="field grow">
            <label>记时间的方式</label>
            <Select v-model="timeMode" :options="[
              { value: 'duration', label: '只记时长' },
              { value: 'range', label: '起止时间（自动算）' }
            ]" />
          </div>
        </div>
        <div class="row" v-if="timeMode === 'duration'">
          <div class="field grow">
            <label>时长
              <span class="seg">
                <button :class="{ on: durUnit === 'hm' }" @click="switchUnit('hm')">时+分</button>
                <button :class="{ on: durUnit === 'h' }" @click="switchUnit('h')">时</button>
                <button :class="{ on: durUnit === 'min' }" @click="switchUnit('min')">分</button>
              </span>
            </label>
            <div v-if="durUnit === 'hm'" class="dur-row">
              <input v-model="durH" type="number" min="0" class="input" placeholder="0" />
              <span class="unit">时</span>
              <input v-model="durM" type="number" min="0" max="59" class="input" placeholder="0" />
              <span class="unit">分</span>
            </div>
            <div v-else class="dur-row">
              <input v-model="durOnly" type="number" min="0" class="input" :placeholder="durUnit === 'h' ? '如 1.5' : '如 45'" />
              <span class="unit">{{ durUnit === 'h' ? '小时' : '分钟' }}</span>
            </div>
          </div>
          <div class="field grow">
            <label>起始时间</label>
            <input v-model="startTime" type="time" class="input" />
          </div>
        </div>
        <div class="row" v-else>
          <div class="field grow">
            <label>开始时间</label>
            <input v-model="startTime" type="time" class="input" />
          </div>
          <div class="field grow">
            <label>结束时间</label>
            <input v-model="endTime" type="time" class="input" />
          </div>
        </div>
        <div class="dur-hint" v-if="timeMode === 'range' && computedDuration != null && computedDuration > 0">
          ⏳ 自动算出：{{ durText(computedDuration) }}
        </div>
        <div class="dur-hint" v-else-if="timeMode === 'duration' && durMinutes > 0">
          ⏳ 记作：{{ durText(durMinutes) }}
        </div>
        <div class="field">
          <label>记录内容</label>
          <textarea v-model="content" class="textarea" rows="3" placeholder="可不填"></textarea>
        </div>
        <div class="row">
          <div class="field grow">
            <label>关联目标</label>
            <Select v-model="goalId" :options="goalOptions" placeholder="不关联" />
          </div>
          <div class="field grow">
            <label>关联路线节点</label>
            <Select v-model="routeNodeId" :options="nodeOptions" placeholder="不关联" />
          </div>
        </div>
        <div class="field">
          <label>标签</label>
          <TagInput v-model="tags" />
        </div>
      </section>
    </div>

    <div class="err-hint" v-if="errorHint">{{ errorHint }}</div>

    <template #foot>
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn primary" @click="save">记下</button>
    </template>
  </Modal>
</template>

<style scoped>
.two-paper { display: grid; grid-template-columns: 1.35fr 1fr; gap: 14px; align-items: stretch; }
.one-paper { display: block; }
.paper {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
  box-shadow: var(--shadow-1);
}
.paper.back {
  border: 1px dashed color-mix(in srgb, var(--grass) 45%, transparent);
}
.paper h3 { font-size: 13.5px; color: var(--ink-2); font-weight: 600; }
.opt { font-size: 11px; color: var(--ink-3); font-weight: 400; margin-left: 6px; }
.row { display: flex; gap: 10px; }
.grow { flex: 1; }
.textarea.refl { flex: 1; min-height: 140px; font-family: "KaiTi", "STKaiti", inherit; }
.dur-hint { font-size: 12.5px; color: var(--leaf); margin-top: -6px; }
.err-hint { color: var(--err); font-size: 12.5px; margin-top: 10px; text-align: center; }

/* 时长录入：单位分段开关 + 输入行 */
.seg { display: inline-flex; margin-left: 8px; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; vertical-align: 1px; }
.seg button {
  border: none; background: transparent; cursor: pointer;
  font-size: 11px; line-height: 1; padding: 4px 7px; color: var(--ink-3);
}
.seg button + button { border-left: 1px solid var(--line); }
.seg button:hover { background: var(--tint); color: var(--ink-2); }
.seg button.on { background: var(--hl); color: var(--ink); font-weight: 600; }
.dur-row { display: flex; align-items: center; gap: 6px; }
.dur-row .input { flex: 1; min-width: 0; }
.dur-row .unit { font-size: 12px; color: var(--ink-3); flex: none; }
</style>
