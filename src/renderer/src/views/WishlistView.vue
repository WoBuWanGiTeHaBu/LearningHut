<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import type { WishItem, WishStage } from '../../../shared/types'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import Select from '../components/Select.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'

const list = ref<WishItem[]>([])
const showForm = ref(false)
const editing = ref<WishItem | null>(null)
const form = ref<any>({})
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)

const STAGE: Record<WishStage, { label: string; badge: string }> = {
  sprout: { label: '芽 · 想学', badge: 'todo' },
  seedling: { label: '苗 · 学着', badge: 'seedling' },
  bloom: { label: '花 · 完成', badge: 'bloom' }
}

onMounted(load)
async function load() { list.value = await api.wishlist.list(store.domain) }
watch(() => store.domain, load)

function openForm(w?: WishItem) {
  editing.value = w || null
  form.value = w ? { ...w } : { title: '', note: '', stage: 'sprout', domain: store.domain }
  showForm.value = true
}
async function save() {
  if (!form.value.title.trim()) { err.value = '先写下想学的东西，再种下它'; return }
  err.value = ''
  editing.value ? await api.wishlist.update(editing.value.id, form.value) : await api.wishlist.create(form.value)
  showForm.value = false
  await load()
}
const err = ref('')
async function del(w: WishItem) {
  const ok = await confirmDlg.value?.ask({
    message: `拔掉「${w.title}」？`,
    detail: w.note ? `备注：「${w.note.slice(0, 30)}${w.note.length > 30 ? '…' : ''}」` : '删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.wishlist.remove(w.id)
  await load()
  toast('已从清单里移除')
}
async function convert(w: WishItem) {
  await api.wishlist.convert(w.id)
  await load()
  toast('已转为目标，去「目标」页就能看到它了')
}
async function setStage(w: WishItem, stage: WishStage) {
  await api.wishlist.update(w.id, { stage })
  await load()
}
</script>

<template>
  <div class="page wish-page">
    <div class="page-head">
      <h1>想学清单</h1>
      <span class="sub">每一个想学的东西都会冒出一棵芽</span>
      <span class="spacer"></span>
      <button class="btn primary" @click="openForm()"><Icon name="plus" :size="14" /> 冒一棵新芽</button>
    </div>

    <div class="card paper-grid wish-card" style="padding: 10px 20px;">
      <div v-if="!list.length" class="empty">
        <div class="leaf-mark">❧</div>
        育苗盆还空着
      </div>
      <div v-for="w in list" :key="w.id" class="row-item wish">
        <span class="stage-dot" :class="w.stage">
          <svg v-if="w.stage === 'sprout'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21 V13" /><path d="M12 13 C12 9 9 7 5 7 C5 11.5 8 13 12 13 Z" /></svg>
          <svg v-else-if="w.stage === 'seedling'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21 V12" /><path d="M12 12 C12 8 9 6 5 6 C5 10.5 8 12 12 12 Z" /><path d="M12 10 C12 6.5 14.5 5 19 5 C19 9 16.5 10 12 10 Z" /></svg>
          <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="9" r="2.4" /><path d="M12 3.5 a2 2 0 0 1 3 2 a2 2 0 0 1 2 3 a2 2 0 0 1 -2 3 a2 2 0 0 1 -3 2 a2 2 0 0 1 -3 -2 a2 2 0 0 1 -2 -3 a2 2 0 0 1 2 -3 a2 2 0 0 1 3 -2" transform="rotate(20 12 9)" /><path d="M12 15 V21" /></svg>
        </span>
        <div class="w-body">
          <b>{{ w.title }}</b>
          <p v-if="w.note">{{ w.note }}</p>
        </div>
        <span class="badge" :class="STAGE[w.stage].badge">{{ STAGE[w.stage].label }}</span>
        <div class="w-ops">
          <button v-if="w.stage === 'sprout'" class="btn sm soft" @click="convert(w)">转为目标</button>
          <button v-else-if="w.stage === 'seedling'" class="btn sm soft" @click="setStage(w, 'bloom')">开花</button>
          <button class="btn ghost sm" @click="openForm(w)"><Icon name="edit" :size="13" /></button>
          <button class="btn ghost sm" @click="del(w)"><Icon name="trash" :size="13" /></button>
        </div>
      </div>
    </div>

    <Modal v-if="showForm" :title="editing ? '编辑' : '冒一棵新芽'" @close="showForm = false">
      <div class="field">
        <label>想学什么</label>
        <input v-model="form.title" class="input" placeholder="如：水彩、Rust、口琴…" />
      </div>
      <div class="field">
        <label>备注</label>
        <textarea v-model="form.note" class="textarea" rows="2" placeholder="为什么想学、有什么打算…"></textarea>
      </div>
      <div class="field" v-if="editing">
        <label>阶段</label>
        <Select v-model="form.stage" :options="[
          { value: 'sprout', label: '芽 · 想学' },
          { value: 'seedling', label: '苗 · 学着' },
          { value: 'bloom', label: '花 · 完成' }
        ]" />
      </div>
      <div class="err-hint" v-if="err">{{ err }}</div>
      <template #foot>
        <button class="btn" @click="showForm = false">取消</button>
        <button class="btn primary" @click="save">种下</button>
      </template>
    </Modal>

    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.wish-page { overflow: hidden; }
.wish-page .wish-card { flex: 1; min-height: 0; overflow-y: auto; }
.wish { padding: 11px 2px; }
.stage-dot {
  width: 28px; height: 28px; flex: none;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px;
}
.stage-dot.sprout { background: color-mix(in srgb, var(--hl) 50%, transparent); color: color-mix(in srgb, var(--hl) 35%, var(--ink)); }
.stage-dot.seedling { background: color-mix(in srgb, var(--grass) 28%, transparent); color: color-mix(in srgb, var(--leaf) 72%, var(--ink)); }
.stage-dot.bloom { background: color-mix(in srgb, var(--deep) 14%, transparent); color: var(--deep); }
.w-body { flex: 1; min-width: 0; }
.w-body b { font-size: 13.5px; }
.w-body p { font-size: 12px; color: var(--ink-2); }
/* 操作按钮常驻可见（原来悬停才出现，等于藏起来） */
.w-ops { display: flex; gap: 4px; flex: none; }
</style>
