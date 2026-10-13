<script setup lang="ts">
import { computed, ref } from 'vue'
import Select from './Select.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  n: any
  depth: number
  expanded: Set<number>
  statusMap: Record<string, string>
  selId?: number | null
}>()
const emit = defineEmits<{
  (e: 'toggle', id: number): void
  (e: 'upd', n: any, patch: any): void
  (e: 'del', n: any): void
  (e: 'askadd', n: any): void
  (e: 'res', n: any): void
  (e: 'pick', n: any): void
}>()

const hasKids = computed(() => (props.n.children?.length || 0) > 0)
const statusOptions = Object.entries(props.statusMap).map(([value, label]) => ({ value, label }))

// 行内标题输入框：点「编辑」按钮就聚焦进来，直接改名字
const titleEl = ref<HTMLInputElement>()
function focusTitle() {
  emit('pick', props.n)
  titleEl.value?.focus()
  titleEl.value?.select()
}

const statLabel = computed(() => {
  const parts: string[] = []
  // 含子树汇总
  if (props.n.rec_count) parts.push(`${props.n.rec_count}次`)
  if (props.n.rec_minutes) parts.push(`${props.n.rec_minutes}分`)
  // 有子节点、自己也直接记过 → 标出本级数字
  if (hasKids.value && props.n.own_count) parts.push(`本级${props.n.own_count}次`)
  return parts.join(' · ')
})
</script>

<template>
  <div>
    <div class="rnode" :class="{ on: selId === n.id }" :style="{ paddingLeft: depth * 22 + 4 + 'px' }"
      @click="emit('pick', n)">
      <button v-if="hasKids" class="tw" @click.stop="emit('toggle', n.id)">{{ expanded.has(n.id) ? '▾' : '▸' }}</button>
      <span v-else class="tw leafdot"></span>
      <input ref="titleEl" class="rtitle" :value="n.title" @click.stop
        @change="emit('upd', n, { title: ($event.target as HTMLInputElement).value })" />
      <div class="prog"><div class="progress"><i :style="{ width: n.progress + '%' }"></i></div></div>
      <span class="pnum">{{ n.progress }}%</span>
      <input class="wt" type="number" min="1" :value="n.weight" title="权重" @click.stop
        @change="emit('upd', n, { weight: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })" />
      <Select class="st" :model-value="n.status" :options="statusOptions"
        @update:model-value="(v: string) => emit('upd', n, { status: v })" />
      <button v-if="n.mat_count" class="res-badge" :title="`关联资料 ${n.mat_count} 条（含子节点）· 点一下看详情`"
        @click.stop="emit('res', n)">
        <svg width="11" height="11" viewBox="0 0 14 14"><path d="M5 3 H3.5 A1.5 1.5 0 0 0 2 4.5 V10.5 A1.5 1.5 0 0 0 3.5 12 H9.5 A1.5 1.5 0 0 0 11 10.5 V9 M8 2 H12 V6 M12 2 L6.5 7.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        {{ n.mat_count }}
      </button>
      <span class="stat" v-if="statLabel">{{ statLabel }}</span>
      <span class="rops">
        <button title="编辑名称" @click.stop="focusTitle"><Icon name="edit" :size="12" /></button>
        <button title="加子节点" @click.stop="emit('askadd', n)"><Icon name="plus" :size="12" /></button>
        <button title="关联资料" @click.stop="emit('res', n)"><Icon name="external" :size="12" /></button>
        <button class="del" title="删除" @click.stop="emit('del', n)"><Icon name="trash" :size="12" /></button>
      </span>
    </div>
    <template v-if="expanded.has(n.id)">
      <RouteNode v-for="c in n.children" :key="c.id" :n="c" :depth="depth + 1"
        :expanded="expanded" :status-map="statusMap" :sel-id="selId"
        @toggle="emit('toggle', $event)" @upd="(n2: any, p: any) => emit('upd', n2, p)"
        @del="emit('del', $event)" @askadd="(n2: any) => emit('askadd', n2)" @res="(n2: any) => emit('res', n2)"
        @pick="(n2: any) => emit('pick', n2)" />
    </template>
  </div>
</template>

<style scoped>
.rnode { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 8px; cursor: pointer; min-width: 0; }
.rnode:hover { background: var(--tint); }
.rnode.on { background: color-mix(in srgb, var(--hl) 35%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--grass) 45%, transparent); }
.rnode input, .rnode .sel { cursor: auto; }
.tw { border: none; background: none; cursor: pointer; width: 16px; color: var(--ink-3); font-size: 11px; padding: 0; flex: none; }
.leafdot { width: 5px; height: 5px; border-radius: 2px; background: var(--line-strong); display: inline-block; margin: 0 5px; flex: none; }
.rtitle {
  flex: 1 1 120px; min-width: 70px; max-width: 240px;
  border: 1px solid transparent; background: transparent;
  border-radius: 6px; padding: 3px 7px; font-size: 13.5px; color: var(--ink);
  text-overflow: ellipsis;
}
.rtitle:hover { border-color: var(--line); }
.rtitle:focus { border-color: var(--grass); background: var(--card); outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--grass) 15%, transparent); }
.prog { flex: 1 1 34px; min-width: 26px; }
.pnum { font-size: 11.5px; color: var(--ink-3); width: 32px; text-align: right; flex: none; font-variant-numeric: tabular-nums; }
.wt { width: 38px; font-size: 12px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 2px 4px; background: var(--card); color: var(--ink-2); flex: none; text-align: center; }
.st { flex: none; min-height: 0; padding: 2px 7px; font-size: 11.5px; border-radius: 999px; max-width: 74px; }
.res-badge {
  flex: none; display: inline-flex; align-items: center; gap: 3px;
  border: none; background: color-mix(in srgb, var(--lake) 9%, transparent); color: var(--lake);
  font-size: 11px; border-radius: 999px; padding: 2px 8px; cursor: pointer;
}
.res-badge:hover { background: color-mix(in srgb, var(--lake) 16%, transparent); }
.stat { flex: none; font-size: 10.5px; color: var(--ink-3); white-space: nowrap; }
/* 操作按钮常驻可见（原来悬停才出现，等于藏起来） */
.rops { display: flex; gap: 1px; flex: none; }
.rops button {
  border: none; background: none; color: var(--ink-3);
  cursor: pointer; padding: 3px; border-radius: 6px; line-height: 0;
  transition: background .15s, color .15s;
}
.rops button:hover { color: var(--deep); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.rops button.del:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, transparent); }
</style>
