<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{
  g: any
  depth: number
  expanded: Set<number>
  sel: any
}>()
const emit = defineEmits<{
  (e: 'toggle', g: any): void
  (e: 'pick', g: any): void
  (e: 'add', g: any): void
  (e: 'del', g: any): void
  (e: 'check', g: any): void
  (e: 'edit', g: any): void
}>()

const STATUS: Record<string, string> = { active: '进行中', paused: '暂停', done: '完成', abandoned: '放弃' }
const hasKids = computed(() => (props.g.children?.length || 0) > 0)
const done = computed(() => props.g.status === 'done')

// 时间提醒：过了「目标时间」还没完成 → 树上直接标出来，不用点进去才发现
function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const overdueDays = computed(() => {
  const due = props.g.due_date
  if (!due || done.value) return 0
  const a = new Date(due + 'T00:00:00'), b = new Date(todayLocal() + 'T00:00:00')
  if (isNaN(a.getTime())) return 0
  const d = Math.round((b.getTime() - a.getTime()) / 86400000)
  return d > 0 ? d : 0
})
// 树上直接给时间提醒：超期 / 一周内到期
const dueChip = computed<{ text: string; tone: 'bad' | 'warn' } | null>(() => {
  const due = props.g.due_date
  if (!due || done.value) return null
  if (overdueDays.value) return { text: `超期 ${overdueDays.value} 天`, tone: 'bad' }
  const a = new Date(due + 'T00:00:00'), b = new Date(todayLocal() + 'T00:00:00')
  if (isNaN(a.getTime())) return null
  const left = Math.round((a.getTime() - b.getTime()) / 86400000)
  if (left >= 0 && left <= 7) return { text: left === 0 ? '今天到期' : `还剩 ${left} 天`, tone: 'warn' }
  return null
})

const pct = computed(() => Math.round(pctOf(props.g)))
function pctOf(n: any): number {
  // 自己设了量化总量 → 用自己的（和右侧详情、概览页口径一致）
  if (n.target_total > 0) return Math.min(100, (Number(n.rec_qty || 0) / n.target_total) * 100)
  if (n.status === 'done') return 100
  // 没量化也没完成，但下面挂着子目标 → 取子目标平均，作为整体推进度
  if (n.children?.length) return n.children.reduce((s: number, c: any) => s + pctOf(c), 0) / n.children.length
  return 0
}
const qtyLabel = computed(() => {
  if (props.g.target_total > 0) {
    return `${Math.min(Number(props.g.rec_qty || 0), props.g.target_total)} / ${props.g.target_total}${props.g.target_unit || ''}`
  }
  return ''
})
const statLabel = computed(() => {
  const parts: string[] = []
  // 含子树汇总（后端 attachStats 已经把子目标的记录累加上来）
  if (props.g.rec_count) parts.push(`${props.g.rec_count} 次`)
  if (props.g.rec_minutes) parts.push(props.g.rec_minutes >= 60
    ? `${Math.round(props.g.rec_minutes / 6) / 10} 时`
    : `${props.g.rec_minutes} 分`)
  // 有子目标、且自己也直接记过 → 标出「本层」的数字，避免和汇总混淆
  if (hasKids.value && props.g.own_count) parts.push(`本级 ${props.g.own_count} 次`)
  return parts.join(' · ')
})
// 有量化总量、或已经推进了进度，才显示进度条（0% 的父节点不显示，避免噪音）
const hasBar = computed(() => props.g.target_total > 0 || pct.value > 0)
</script>

<template>
  <div>
    <div class="gnode" :class="{ sel: sel && sel.id === g.id, done }" :style="{ marginLeft: depth * 18 + 'px' }">
      <button v-if="hasKids" class="tw" @click.stop="emit('toggle', g)">{{ expanded.has(g.id) ? '▾' : '▸' }}</button>
      <span v-else class="leafdot"></span>
      <button class="check" :class="{ done }" :title="done ? '标记为进行中' : '标记为完成'"
        @click.stop="emit('check', g)">
        <svg v-if="done" width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="gmain" @click="emit('pick', g)">
        <div class="gline1">
          <span class="glabel" :class="{ done }">{{ g.title }}</span>
          <span class="gqty" v-if="qtyLabel">{{ qtyLabel }}</span>
          <span class="badge" :class="g.status">{{ STATUS[g.status] }}</span>
          <span class="late" v-if="dueChip" :class="dueChip.tone"
            :title="`目标时间 ${g.due_date}`">
            <Icon v-if="dueChip.tone === 'bad'" name="alert" :size="10" />
            {{ dueChip.text }}
          </span>
        </div>
        <div class="gline2" v-if="hasBar">
          <div class="progress"><i :style="{ width: pct + '%' }"></i></div>
          <span class="pct">{{ pct }}%</span>
          <span class="gstat" v-if="statLabel">{{ statLabel }}</span>
        </div>
      </div>
      <span class="gops">
        <button title="编辑" @click.stop="emit('edit', g)"><Icon name="edit" :size="13" /></button>
        <button title="加子目标" @click.stop="emit('add', g)"><Icon name="plus" :size="13" /></button>
        <button class="del" title="删除" @click.stop="emit('del', g)"><Icon name="trash" :size="13" /></button>
      </span>
    </div>
    <template v-if="expanded.has(g.id)">
      <GoalNode v-for="c in g.children" :key="c.id" :g="c" :depth="depth + 1"
        :expanded="expanded" :sel="sel"
        @toggle="emit('toggle', $event)" @pick="emit('pick', $event)"
        @add="emit('add', $event)" @del="emit('del', $event)" @check="emit('check', $event)"
        @edit="emit('edit', $event)" />
    </template>
  </div>
</template>

<style scoped>
.gnode {
  display: flex; align-items: center; gap: 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 11px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: default;
  transition: box-shadow .18s ease, border-color .18s ease, background .18s ease;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent);
}
.gnode:hover { border-color: color-mix(in srgb, var(--grass) 50%, transparent); box-shadow: 0 2px 8px color-mix(in srgb, var(--ink) 8%, transparent); }
.gnode.sel { border-color: var(--grass); background: color-mix(in srgb, var(--hl) 22%, transparent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--grass) 14%, transparent); }
.gnode.done { background: var(--tint); }
.tw { border: none; background: none; cursor: pointer; width: 15px; color: var(--ink-3); font-size: 11px; padding: 0; flex: none; }
.leafdot { width: 5px; height: 5px; border-radius: 2px; background: var(--line-strong); display: inline-block; margin: 0 5px; flex: none; }
.check {
  flex: none; width: 19px; height: 19px; border-radius: 50%;
  border: 1.5px solid var(--line-strong); background: var(--card);
  cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  color: var(--on-deep); transition: all .15s;
}
.check:hover { border-color: var(--grass); transform: scale(1.08); }
.check.done { background: var(--deep); border-color: var(--deep); }
.gmain { flex: 1; min-width: 0; cursor: pointer; display: flex; flex-direction: column; gap: 5px; }
.gline1 { display: flex; align-items: center; gap: 8px; min-width: 0; }
.glabel { font-size: 14px; font-weight: 550; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.glabel.done { color: var(--ink-3); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ink-3) 60%, transparent); font-weight: 400; }
.gqty {
  flex: none; font-size: 12px; font-weight: 600; color: var(--deep);
  background: color-mix(in srgb, var(--hl) 55%, transparent); border-radius: 999px; padding: 1px 9px;
  font-variant-numeric: tabular-nums;
}
.gline2 { display: flex; align-items: center; gap: 8px; }
.late {
  flex: none; display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; border-radius: 999px; padding: 1px 8px; white-space: nowrap;
}
.late.bad { background: color-mix(in srgb, var(--err) 16%, transparent); color: var(--err); }
.late.warn { background: color-mix(in srgb, var(--hl) 75%, transparent); color: var(--ink); }.gline2 .progress { flex: 1; height: 6px; }
.gline2 .pct { font-size: 11px; color: var(--deep); font-weight: 600; width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
.gstat { font-size: 11px; color: var(--ink-3); flex: none; }
/* 操作按钮常驻可见 —— 之前是 opacity:0 悬停才出现，等于藏起来了 */
.gops { display: flex; gap: 1px; flex: none; }
.gops button {
  border: none; background: none; color: var(--ink-3);
  cursor: pointer; padding: 3px; border-radius: 6px; line-height: 0;
  transition: background .15s, color .15s;
}
.gops button:hover { color: var(--deep); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.gops button.del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
</style>
