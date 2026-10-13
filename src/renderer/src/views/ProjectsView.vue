<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import type { Project } from '../../../shared/types'
import Icon from '../components/Icon.vue'
import Modal from '../components/Modal.vue'
import Select from '../components/Select.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'

const list = ref<Project[]>([])
const showForm = ref(false)
const editing = ref<Project | null>(null)
const form = ref<any>({})
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)

onMounted(load)
async function load() { list.value = await api.projects.list(store.domain) }
watch(() => store.domain, load)

function openForm(p?: Project) {
  editing.value = p || null
  form.value = p ? { ...p } : { title: '', avatar: '', path: '', repo_url: '', description: '', status: 'active', domain: store.domain }
  showForm.value = true
}
async function save() {
  // 名字空着也能存，后端会给默认名「未命名项目」，回来再改
  editing.value ? await api.projects.update(editing.value.id, form.value) : await api.projects.create(form.value)
  showForm.value = false
  await load()
}
async function del(p: Project) {
  const ok = await confirmDlg.value?.ask({
    message: `删除项目「${p.title}」？`,
    detail: '只从档案里移除，项目文件夹不会被动。删除后无法恢复。',
    danger: true
  })
  if (!ok) return
  await api.projects.remove(p.id)
  await load()
  toast('已删除项目')
}
async function pickPath() {
  const p = await api.dialog.pickFolder()
  if (p) form.value.path = p
}
async function pickAvatar() {
  const p = await api.dialog.pickFile([{ name: '图片', ext: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }])
  if (p) form.value.avatar = p
}
const mediaUrl = (p: string) => 'lh-media://local/' + p.replace(/\\/g, '/').replace(/^\//, '')
const initial = (t: string) => t.trim().slice(0, 1)
</script>

<template>
  <div class="page proj-page">
    <div class="page-head">
      <h1>项目档案</h1>
      <span class="sub">{{ store.domain === 'study' ? '学习' : '爱好' }}这边做过的项目 · 都收进玻璃瓶里</span>
      <span class="spacer"></span>
      <button class="btn primary" @click="openForm()"><Icon name="plus" :size="14" /> 立一个项目</button>
    </div>

    <div class="grid">
      <div v-if="!list.length" class="empty card" style="grid-column: 1/-1; padding: 40px 0;">
        <div class="leaf-mark">❧</div>
        瓶子里还没有项目
      </div>
      <div v-for="p in list" :key="p.id" class="card hover p-card">
        <div class="p-head">
          <img v-if="p.avatar" :src="mediaUrl(p.avatar)" class="p-avatar" />
          <span v-else class="p-avatar p-initial">{{ initial(p.title) }}</span>
          <div class="p-title">
            <b>{{ p.title }}</b>
            <span class="badge" :class="p.status === 'active' ? 'active' : 'done'">{{ p.status === 'active' ? '进行中' : '已归档' }}</span>
          </div>
        </div>
        <p class="p-desc" v-if="p.description">{{ p.description }}</p>
        <div class="p-links">
          <button v-if="p.path" class="btn sm" @click="api.shell.showItem(p.path)">
            <Icon name="folder" :size="12" /> 所在位置
          </button>
          <button v-if="p.repo_url" class="btn sm" @click="api.shell.openExternal(p.repo_url)">
            <Icon name="external" :size="12" /> 仓库
          </button>
        </div>
        <div class="p-ops">
          <span class="grow"></span>
          <button class="btn ghost sm" @click="openForm(p)"><Icon name="edit" :size="13" /></button>
          <button class="btn ghost sm" @click="del(p)"><Icon name="trash" :size="13" /></button>
        </div>
      </div>
    </div>

    <Modal v-if="showForm" :title="editing ? '编辑项目' : '立一个项目'" @close="showForm = false">
      <div class="field">
        <label>项目名</label>
        <input v-model="form.title" class="input" />
      </div>
      <div class="field">
        <label>头像小图</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <img v-if="form.avatar" :src="mediaUrl(form.avatar)" class="p-avatar" style="width: 40px; height: 40px;" />
          <button class="btn sm" @click="pickAvatar">选一张图</button>
          <button v-if="form.avatar" class="btn ghost sm" @click="form.avatar = ''">清除</button>
        </div>
      </div>
      <div class="field">
        <label>本地路径</label>
        <div style="display:flex; gap:8px;">
          <input v-model="form.path" class="input" placeholder="项目文件夹" />
          <button class="btn" @click="pickPath">浏览…</button>
        </div>
      </div>
      <div class="field">
        <label>仓库地址</label>
        <input v-model="form.repo_url" class="input" placeholder="https://github.com/…" />
      </div>
      <div class="field">
        <label>说明</label>
        <textarea v-model="form.description" class="textarea" rows="3"></textarea>
      </div>
      <div class="field">
        <label>状态</label>
        <Select v-model="form.status" :options="[
          { value: 'active', label: '进行中' },
          { value: 'archived', label: '已归档' }
        ]" />
      </div>
      <template #foot>
        <button class="btn" @click="showForm = false">取消</button>
        <button class="btn primary" @click="save">存进瓶子</button>
      </template>
    </Modal>

    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.proj-page { overflow: hidden; }
.proj-page .grid { flex: 1; min-height: 0; overflow-y: auto; align-content: start; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; }
.p-card { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.p-head { display: flex; align-items: center; gap: 11px; }
.p-avatar { width: 44px; height: 44px; border-radius: 12px; object-fit: cover; flex: none; box-shadow: var(--shadow-1); }
.p-initial {
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(140deg, var(--hl), var(--grass));
  color: var(--ink); font-size: 18px; font-weight: 700;
}
.p-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.p-title b { font-size: 14.5px; }
.p-desc { font-size: 12.5px; color: var(--ink-2); }
.p-links { display: flex; gap: 6px; }
.p-ops { display: flex; margin-top: 4px; }
.grow { flex: 1; }
</style>
