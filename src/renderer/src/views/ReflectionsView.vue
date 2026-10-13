<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '../api'
import { store } from '../store'
import type { Reflection } from '../../../shared/types'
import Icon from '../components/Icon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { toast } from '../toast'

const list = ref<Reflection[]>([])
const mode = ref<'one' | 'all'>('one')
const one = ref<Reflection | null>(null)
const confirmDlg = ref<InstanceType<typeof ConfirmDialog> | null>(null)
// 信纸纹样轮换
const PAPER = ['paper-stars', 'paper-lines', 'paper-dots', 'paper-diamond']

onMounted(async () => {
  list.value = await api.reflections.list({ order: 'date' }, store.domain)
  drawOne()
})

watch(() => store.domain, async () => {
  list.value = await api.reflections.list({ order: 'date' }, store.domain)
  drawOne()
})

function drawOne() {
  if (!list.value.length) { one.value = null; return }
  one.value = list.value[Math.floor(Math.random() * list.value.length)]
}
async function del(r: Reflection) {
  const ok = await confirmDlg.value?.ask({
    message: '删除这条感想？',
    detail: r.content.length > 30 ? `「${r.content.slice(0, 30)}…」` : `「${r.content}」`,
    danger: true
  })
  if (!ok) return
  await api.reflections.remove(r.id)
  list.value = await api.reflections.list({ order: 'date' }, store.domain)
  drawOne()
  toast('已删除感想')
}
</script>

<template>
  <div class="page refl-page">
    <div class="page-head">
      <h1>感想回顾</h1>
      <span class="sub">从邮筒里滑出来的旧信</span>
      <span class="spacer"></span>
      <div class="modes">
        <button v-if="mode === 'one'" class="btn sm soft" @click="drawOne"><Icon name="next" :size="12" /> 换一封</button>
        <button class="btn sm" :class="mode === 'all' ? 'primary' : ''" @click="mode = mode === 'one' ? 'all' : 'one'">
          {{ mode === 'one' ? '翻阅全部' : '收回信夹' }}
        </button>
      </div>
    </div>

    <div v-if="!list.length" class="stage">
      <div class="card empty" style="padding: 44px 60px;">
        <div class="leaf-mark">✉</div>
        邮筒还空着——感想跟着学习记录一起写，会自动归到这里
      </div>
    </div>

    <!-- 单封信：首屏只呈现一段，居中摊开 -->
    <div v-else-if="mode === 'one' && one" class="stage">
      <div class="one-letter paper card" :class="PAPER[one.id % PAPER.length]">
        <div class="stamp">❦</div>
        <div class="o-rule"></div>
        <p class="o-body">{{ one.content }}</p>
        <div class="o-foot">
          <span class="o-date">{{ one.date }}</span>
          <div class="chips" v-if="one.tags.length">
            <span v-for="t in one.tags" :key="t" class="chip">{{ t }}</span>
          </div>
          <button class="btn ghost sm del" @click="del(one)"><Icon name="trash" :size="12" /></button>
        </div>
      </div>
    </div>

    <!-- 全部：信夹 -->
    <div v-else class="masonry">
      <div v-for="r in list" :key="r.id" class="card pad letter torn-top" :class="PAPER[r.id % PAPER.length]">
        <div class="l-date">{{ r.date }}<button class="btn ghost sm del" @click="del(r)"><Icon name="trash" :size="12" /></button></div>
        <p class="l-body">{{ r.content }}</p>
        <div class="chips" v-if="r.tags.length">
          <span v-for="t in r.tags" :key="t" class="chip">{{ t }}</span>
        </div>
      </div>
    </div>

    <ConfirmDialog ref="confirmDlg" />
  </div>
</template>

<style scoped>
.refl-page { overflow: hidden; }
/* 一封信摊在桌面正中的留白感 */
.refl-page .stage {
  flex: 1; min-height: 0;
  display: flex; align-items: center; justify-content: center;
  padding-bottom: 28px;
}
.refl-page .masonry { flex: 1; min-height: 0; overflow-y: auto; }
.modes { display: flex; gap: 6px; }
.one-letter {
  width: min(660px, 100%);
  margin: 0;
  padding: 40px 52px 28px;
  position: relative;
  font-family: "KaiTi", "STKaiti", inherit;
  box-shadow: var(--shadow-2);
  border-radius: 4px 18px 18px 18px;
}
.o-rule { height: 1px; background: linear-gradient(90deg, color-mix(in srgb, var(--leaf) 35%, transparent), transparent); margin: 0 0 22px; }
.stamp {
  position: absolute; top: 18px; right: 22px;
  font-size: 22px; color: color-mix(in srgb, var(--leaf) 40%, transparent);
  border: 1px solid color-mix(in srgb, var(--leaf) 30%, transparent);
  border-radius: 6px; padding: 2px 8px;
  transform: rotate(6deg);
}
.o-body {
  font-size: 19px; line-height: 2.1; color: var(--ink);
  white-space: pre-wrap; margin-bottom: 26px;
}
.o-foot { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
.o-date { font-size: 12.5px; color: var(--ink-3); }
.masonry { columns: 3 260px; column-gap: 14px; }
.letter {
  break-inside: avoid;
  margin-bottom: 14px;
  font-family: "KaiTi", "STKaiti", inherit;
}
.l-date { font-size: 12px; color: var(--ink-3); display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
/* 删除按钮常驻可见（原来悬停才出现，等于藏起来） */
.l-date .del, .o-foot .del { flex: none; }
.l-body { font-size: 14.5px; line-height: 1.85; color: var(--ink); margin-bottom: 10px; white-space: pre-wrap; }
</style>
