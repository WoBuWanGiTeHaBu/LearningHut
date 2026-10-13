<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { api } from '../api'
import type { StickyNote } from '../../../shared/types'
import Icon from './Icon.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { notePalette } from '../theme'

const props = withDefaults(defineProps<{
  height?: string
  minHeight?: string
  fill?: boolean
  domain?: 'study' | 'hobby'
  // 同一批便签出现在两块板上（概览 / 随手记），内容共享，
  // 但坐标各存各的 —— 拖动其中一块不会影响另一块。
  surface?: 'dash' | 'notes'
}>(), {
  height: '420px',
  minHeight: '320px',
  fill: false,
  domain: 'study',
  surface: 'dash'
})

// 当前板用哪一组坐标：概览用 x/y，随手记用 x2/y2
// （x2/y2 万一为空则退回 x/y，老库极端情况下也不至于叠在左上角）
const isNotes = () => props.surface === 'notes'
function gx(n: StickyNote): number { return Number((isNotes() ? (n.x2 ?? n.x) : n.x) ?? 0) || 0 }
function gy(n: StickyNote): number { return Number((isNotes() ? (n.y2 ?? n.y) : n.y) ?? 0) || 0 }
function setPos(n: StickyNote, x: number, y: number) {
  if (isNotes()) { n.x2 = x; n.y2 = y }
  else { n.x = x; n.y = y }
}

const notes = ref<StickyNote[]>([])
const board = ref<HTMLElement>()
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)
// 便签纸色：库里存的是「身份色」（就是绿野那套 5 色，历史数据也是它），
// 显示时按序号映射到当前主题的 5 色 —— 换主题时便签跟着换装，
// 但每张便签的序号不变，所以换纸色、排序都不会乱。
const IDENT = ['#E4EC81', '#FAFCFD', '#D8E8D4', '#F5E9C9', '#DDE6EA']
function noteColors() {
  return notePalette()
}
function shownColor(c: string) {
  const i = IDENT.indexOf(c)
  return i < 0 ? c : (noteColors()[i] || c)
}
const NOTE_W = 186
let drag: { id: number; dx: number; dy: number } | null = null
// 正在拖动的便签 id：拖动期间不做任何会导致 textarea 重渲染的写入
const draggingId = ref<number | null>(null)
// 每个便签的本地草稿：输入即写这里，textarea 用 v-model 双向绑定，打断「DOM 值 ↔ n.content」不同步
const drafts = ref<Record<number, string>>({})
// 输入防抖定时器（每张便签一个）
const saveTimers: Record<number, any> = {}

async function load() {
  const list = await api.notes.list(props.domain)
  notes.value = list
  // 载入时把服务端内容灌进草稿；已经有本地草稿的（正在编辑）不动，避免覆盖用户输入
  const d: Record<number, string> = {}
  for (const n of list) d[n.id] = drafts.value[n.id] ?? n.content ?? ''
  drafts.value = d
  await nextTick()
  clampAll()
}
onMounted(() => {
  load()
  window.addEventListener('resize', clampAll)
})
onUnmounted(() => window.removeEventListener('resize', clampAll))
// 切学习/爱好：便签也是两套，换域时清掉本域草稿与待写定时器再重取
watch(() => props.domain, () => {
  for (const k of Object.keys(saveTimers)) { clearTimeout(saveTimers[Number(k)]); delete saveTimers[Number(k)] }
  drafts.value = {}
  load()
})

function clampAll() {
  const b = board.value
  if (!b) return
  const w = b.clientWidth, h = b.clientHeight
  for (const n of notes.value) {
    const x = Math.max(6, Math.min(gx(n), Math.max(6, w - NOTE_W - 6)))
    const y = Math.max(6, Math.min(gy(n), Math.max(6, h - 70)))
    setPos(n, x, y)
  }
}

async function addNote() {
  const b = board.value
  const w = b ? Math.max(60, b.clientWidth - NOTE_W - 20) : 200
  const h = b ? Math.max(40, b.clientHeight - 120) : 200
  const rx = Math.round(12 + Math.random() * w)
  const ry = Math.round(12 + Math.random() * h)
  // 两块板都给一个落点，之后再各拖各的
  const n = await api.notes.create({
    content: '',
    color: IDENT[Math.floor(Math.random() * IDENT.length)],
    x: rx, y: ry, x2: rx, y2: ry,
    domain: props.domain
  })
  notes.value.unshift(n)
  drafts.value = { ...drafts.value, [n.id]: '' }
  await nextTick()
  focusEdit(n.id)
}

function focusEdit(id: number) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-note="${id}"] textarea`) as HTMLTextAreaElement
    el?.focus()
  })
}

function onDown(e: PointerEvent, n: StickyNote) {
  if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).closest('button')) return
  const card = (e.currentTarget as HTMLElement)
  const rect = card.getBoundingClientRect()
  const bRect = board.value!.getBoundingClientRect()
  drag = { id: n.id, dx: e.clientX - rect.left, dy: e.clientY - rect.top }
  draggingId.value = n.id
  card.setPointerCapture(e.pointerId)
  // 用局部变量累积坐标，避免拖动过程中反复写坐标触发无关重渲染
  let nx = gx(n), ny = gy(n)
  const move = (ev: PointerEvent) => {
    if (!drag || !board.value) return
    nx = Math.min(Math.max(0, ev.clientX - drag.dx - bRect.left), Math.max(0, board.value.clientWidth - rect.width - 6))
    ny = Math.min(Math.max(0, ev.clientY - drag.dy - bRect.top), Math.max(0, board.value.clientHeight - 46))
    setPos(n, nx, ny)
  }
  const up = async () => {
    card.removeEventListener('pointermove', move)
    card.removeEventListener('pointerup', up)
    const d = drag
    drag = null
    if (d) {
      // 只落当前板的那一组坐标，另一块板不受影响
      await api.notes.update(d.id, isNotes() ? { x2: nx, y2: ny } : { x: nx, y: ny })
    }
    // 松开鼠标后再解除拖动锁定
    draggingId.value = null
  }
  card.addEventListener('pointermove', move)
  card.addEventListener('pointerup', up)
}

function autoGrow(e: Event) {
  const t = e.target as HTMLTextAreaElement
  t.style.height = 'auto'
  t.style.height = t.scrollHeight + 'px'
}

// 输入：只更新本地草稿 + 自适应高度，绝不在这里打断（防抖后再落库）
function onInput(e: Event, n: StickyNote) {
  autoGrow(e)
  drafts.value[n.id] = (e.target as HTMLTextAreaElement).value
  if (saveTimers[n.id]) clearTimeout(saveTimers[n.id])
  saveTimers[n.id] = setTimeout(() => save(n), 600)
}

// 落库：以草稿为准。若该便签正在被拖动，先不写，等 pointerup 之后再补
async function save(n: StickyNote) {
  if (saveTimers[n.id]) { clearTimeout(saveTimers[n.id]); delete saveTimers[n.id] }
  if (draggingId.value === n.id) return
  const content = drafts.value[n.id] ?? ''
  n.content = content
  await api.notes.update(n.id, { content })
}

// 失焦 / 拖动开始前强制落库，保证数据不丢
function flush(n: StickyNote) {
  if (saveTimers[n.id]) { clearTimeout(saveTimers[n.id]); delete saveTimers[n.id] }
  const content = drafts.value[n.id] ?? ''
  if (content === (n.content ?? '')) return
  n.content = content
  api.notes.update(n.id, { content })
}

function onBlur(n: StickyNote) { flush(n) }

async function remove(n: StickyNote) {
  // 空便签直接撕；写了字的先问一声，便签内容攒起来不容易
  const written = (drafts.value[n.id] ?? n.content ?? '').trim()
  if (written) {
    const ok = await confirmDlg.value?.ask({
      message: '撕掉这张便签？',
      detail: written.length > 30 ? `「${written.slice(0, 30)}…」` : `「${written}」`,
      confirmText: '撕掉',
      danger: true
    })
    if (!ok) return
  }
  if (saveTimers[n.id]) { clearTimeout(saveTimers[n.id]); delete saveTimers[n.id] }
  const d = { ...drafts.value }
  delete d[n.id]
  drafts.value = d
  notes.value = notes.value.filter(x => x.id !== n.id)
  await api.notes.remove(n.id)
}

async function cycleColor(n: StickyNote) {
  const i = IDENT.indexOf(n.color)
  n.color = IDENT[(i + 1) % IDENT.length]
  await api.notes.update(n.id, { color: n.color })
}
</script>

<template>
  <div class="wall-wrap">
    <div class="wall-tools">
      <span class="tip">
        随手记录 · 便签可自由拖动摆放
        <em v-if="notes.length">共 {{ notes.length }} 张</em>
      </span>
      <button class="btn sm primary" @click="addNote"><Icon name="plus" :size="13" /> 贴一张</button>
    </div>
    <div ref="board" class="wall paper-dots" :class="{ empty: !notes.length, fill }"
      :style="fill ? { minHeight } : { height, minHeight }">
      <div v-if="!notes.length" class="wall-empty">
        <Icon name="leaf" :size="26" />
        <p>墙上还空着，贴一张便签吧</p>
      </div>
      <div v-for="n in notes" :key="n.id" :data-note="n.id" class="note"
        :class="{ dragging: draggingId === n.id }"
        :style="{ background: shownColor(n.color), left: gx(n) + 'px', top: gy(n) + 'px' }"
        @pointerdown="onDown($event, n)">
        <span class="pin"></span>
        <div class="n-tools">
          <button title="换纸色" @click="cycleColor(n)"><Icon name="leaf" :size="12" /></button>
          <button title="撕掉" @click="remove(n)"><Icon name="trash" :size="12" /></button>
        </div>
        <textarea v-model="drafts[n.id]" placeholder="写点什么…"
          @input="onInput($event, n)" @blur="onBlur(n)" @change="save(n)"></textarea>
      </div>
    </div>
    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.wall-wrap { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.wall-tools { display: flex; align-items: center; justify-content: space-between; flex: none; }
.tip { font-size: 12px; color: var(--ink-3); }
.tip em { font-style: normal; margin-left: 8px; color: var(--ink-3); opacity: .8; }
.wall.fill { flex: 1; }
.wall {
  position: relative;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  box-shadow: inset 0 1px 3px color-mix(in srgb, var(--ink) 4%, transparent);
  overflow: hidden;
}
.wall-empty {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: var(--ink-3); font-size: 13px;
}
.note {
  position: absolute;
  width: 186px;
  border-radius: 3px 10px 10px 10px;
  box-shadow: 0 2px 3px color-mix(in srgb, var(--ink) 10%, transparent), 0 10px 20px color-mix(in srgb, var(--ink) 13%, transparent);
  padding: 14px 11px 9px;
  cursor: grab;
  transition: box-shadow .18s, transform .18s;
  border: 1px solid color-mix(in srgb, var(--ink) 6%, transparent);
}
.note:hover { box-shadow: 0 4px 7px color-mix(in srgb, var(--ink) 14%, transparent), 0 16px 30px color-mix(in srgb, var(--ink) 18%, transparent); transform: translateY(-2px); }
.note:active { cursor: grabbing; }
/* 拖动中：不让 textarea 抢焦点、不做 hover 位移，避免输入内容被重渲染清掉 */
.note.dragging { cursor: grabbing; transition: none; transform: none; }
.note.dragging:hover { transform: none; }
.note.dragging textarea { pointer-events: none; user-select: none; }
.pin {
  position: absolute; top: 3px; left: 50%; transform: translateX(-50%);
  width: 22px; height: 4px; border-radius: 99px;
  background: color-mix(in srgb, var(--note-ink) 16%, transparent);
}
/* 便签工具：微弱常驻，鼠标进来变清晰 —— 别让它彻底隐身 */
.n-tools {
  position: absolute; top: 5px; right: 5px;
  display: flex; gap: 2px;
  opacity: .4; transition: opacity .15s;
}
.note:hover .n-tools { opacity: 1; }
.n-tools button { border: none; background: none; cursor: pointer; color: color-mix(in srgb, var(--note-ink) 55%, transparent); padding: 2px; border-radius: 4px; }
.n-tools button:hover { color: var(--note-ink); background: color-mix(in srgb, var(--note-ink) 10%, transparent); }
.note textarea {
  width: 100%;
  border: none; background: transparent; resize: none;
  font-size: 13px; line-height: 1.6; color: var(--note-ink);
  min-height: 40px; overflow: hidden;
  font-family: "KaiTi", "STKaiti", inherit;
}
.note textarea:focus { outline: none; }
</style>
