<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{ title: string; wide?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <div class="modal" :style="wide ? 'width:min(720px,calc(100vw - 80px))' : ''">
      <div class="modal-head">
        <h2>{{ title }}</h2>
        <button class="btn ghost sm" @click="emit('close')"><Icon name="close" :size="15" /></button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
      <div class="modal-foot" v-if="$slots.foot">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>
