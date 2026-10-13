<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import TitleBar from './components/TitleBar.vue'
import SideBar from './components/SideBar.vue'
import SearchOverlay from './components/SearchOverlay.vue'
import ToastHost from './components/ToastHost.vue'
import { store, initBgm, setupBgmAudio } from './store'

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    store.searchOpen = true
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  initBgm().then(setupBgmAudio)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="shell grain">
    <TitleBar />
    <SideBar />
    <main class="content">
      <router-view v-slot="{ Component }">
        <transition name="view" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
    <SearchOverlay v-if="store.searchOpen" />
    <ToastHost />
  </div>
</template>

<style scoped>
.shell {
  height: 100vh;
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  grid-template-rows: var(--titlebar-h) 1fr;
  grid-template-areas:
    "bar bar"
    "side main";
}
.content {
  grid-area: main;
  overflow: hidden;
  position: relative;
  background: var(--paper);
}
</style>
