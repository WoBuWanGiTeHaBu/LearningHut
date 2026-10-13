<script setup lang="ts">
import { useRoute } from 'vue-router'
import Icon from './Icon.vue'
import BgmPlayer from './BgmPlayer.vue'
import { store, setDomain } from '../store'

const route = useRoute()
const items = [
  { path: '/', label: '概览', icon: 'home' },
  { path: '/records', label: '学习记录', icon: 'pen' },
  { path: '/notes', label: '随手记', icon: 'note' },
  { path: '/goals', label: '目标', icon: 'target' },
  { path: '/routes', label: '学习路线', icon: 'route' },
  { path: '/checkin', label: '打卡', icon: 'calendar' },
  { path: '/library', label: '资料库', icon: 'book' },
  { path: '/projects', label: '项目档案', icon: 'bottle' },
  { path: '/wishlist', label: '想学清单', icon: 'sprout' },
  { path: '/reflections', label: '感想回顾', icon: 'mail' },
  { path: '/reports', label: '报表与导出', icon: 'drawer' },
  { path: '/settings', label: '设置', icon: 'gear' }
]
</script>

<template>
  <aside class="sidebar">
    <!-- 学习 / 爱好 全局切换 -->
    <div class="domain-seg" role="tablist" aria-label="学习或爱好">
      <button class="ds" :class="{ on: store.domain === 'study' }" @click="setDomain('study')">
        <Icon name="pen" :size="13" /> 学习
      </button>
      <button class="ds" :class="{ on: store.domain === 'hobby' }" @click="setDomain('hobby')">
        <Icon name="sprout" :size="13" /> 爱好
      </button>
    </div>
    <nav class="nav">
      <router-link v-for="it in items" :key="it.path" :to="it.path"
        class="nav-item" :class="{ on: route.path === it.path }">
        <Icon :name="it.icon" :size="16" />
        <span>{{ it.label }}</span>
      </router-link>
    </nav>
    <BgmPlayer />
  </aside>
</template>

<style scoped>
.sidebar {
  grid-area: side;
  background: linear-gradient(178deg, var(--side-a) 0%, var(--side-b) 100%);
  border-right: 1px solid color-mix(in srgb, var(--ink) 12%, transparent);
  display: flex;
  flex-direction: column;
  padding: 12px 10px 12px;
  overflow-y: auto;
}
/* 学习 / 爱好 切换：跟卡片胶囊同语言 */
.domain-seg {
  display: flex; gap: 3px;
  background: color-mix(in srgb, var(--ink) 10%, transparent);
  border-radius: 999px; padding: 3px; margin-bottom: 12px;
}
.ds {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  border: none; background: transparent; cursor: pointer;
  font-size: 12.5px; color: var(--side-ink);
  padding: 6px 4px; border-radius: 999px; transition: all .16s;
}
.ds :deep(svg) { opacity: .75; }
.ds:hover { color: var(--ink); }
.ds.on { background: var(--deep); color: var(--on-deep); font-weight: 600; box-shadow: 0 2px 6px color-mix(in srgb, var(--deep) 30%, transparent); }
.ds.on :deep(svg) { opacity: 1; }
.nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  color: var(--side-ink);
  text-decoration: none;
  font-size: 13.5px;
  padding: 8px 13px;
  border-radius: 10px;
  transition: all .18s ease;
}
.nav-item :deep(svg) { opacity: .8; }
.nav-item:hover { background: color-mix(in srgb, var(--paper) 65%, transparent); color: var(--ink); }
.nav-item.on {
  background: var(--deep);
  color: var(--on-deep);
  font-weight: 600;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--deep) 30%, transparent);
}
.nav-item.on :deep(svg) { opacity: 1; }
</style>
