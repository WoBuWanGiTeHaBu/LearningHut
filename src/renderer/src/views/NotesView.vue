<script setup lang="ts">
import StickyWall from '../components/StickyWall.vue'
import { store } from '../store'
</script>

<template>
  <div class="page notes-page">
    <div class="page-head">
      <h1>随手记</h1>
      <span class="sub">
        {{ store.domain === 'study' ? '学习' : '爱好' }}这一边的便签 · 拖到哪儿就留在哪儿
      </span>
    </div>
    <div class="board">
      <StickyWall fill min-height="360px" :domain="store.domain" surface="notes" />
    </div>
  </div>
</template>

<style scoped>
.notes-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.notes-page .board { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.notes-page .board > * { flex: 1; min-height: 0; }
</style>
