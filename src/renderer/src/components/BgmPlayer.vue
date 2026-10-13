<script setup lang="ts">
import Icon from './Icon.vue'
import { store, togglePlay, nextTrack, prevTrack } from '../store'
import { computed } from 'vue'

const cur = computed(() => store.bgm.tracks[store.bgm.idx])
</script>

<template>
  <div class="bgm card-like" v-if="store.bgm.tracks.length">
    <div class="info">
      <div class="t">{{ cur?.title }}</div>
      <div class="s">BGM</div>
    </div>
    <div class="ctrls">
      <button @click="prevTrack" title="上一首"><Icon name="prev" :size="13" /></button>
      <button class="pp" @click="togglePlay">
        <Icon :name="store.bgm.playing ? 'pause' : 'play'" :size="14" />
      </button>
      <button @click="nextTrack" title="下一首"><Icon name="next" :size="13" /></button>
    </div>
  </div>
</template>

<style scoped>
.bgm {
  display: flex; align-items: center; gap: 8px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 10px;
  color: var(--ink-2);
  box-shadow: var(--shadow-1);
}
.info { flex: 1; min-width: 0; }
.t {
  font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.t.playing { }
.s { font-size: 10px; opacity: .55; letter-spacing: .15em; }
.ctrls { display: flex; align-items: center; gap: 2px; }
.ctrls button {
  border: none; background: transparent; color: inherit;
  cursor: pointer; padding: 4px; border-radius: 6px;
  display: flex; align-items: center;
  transition: background .15s;
}
.ctrls button:hover { background: color-mix(in srgb, var(--grass) 16%, transparent); color: var(--ink); }
.pp { background: var(--deep) !important; color: var(--on-deep) !important; border-radius: 999px !important; }
.pp:hover { background: var(--leaf) !important; }
</style>
