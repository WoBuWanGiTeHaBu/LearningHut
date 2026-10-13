<script setup lang="ts">
import { ref, nextTick } from 'vue'

const props = defineProps<{
  title: string
  placeholder?: string
}>()

const open = ref(false)
const text = ref('')
const inputEl = ref<HTMLInputElement>()
let resolver: ((v: string | null) => void) | null = null

// 可传入初始值，用于「重命名」场景（不带初始值就是「新建」）
function ask(initial = ''): Promise<string | null> {
  text.value = initial
  open.value = true
  nextTick(() => {
    inputEl.value?.focus()
    inputEl.value?.select()
  })
  return new Promise(res => { resolver = res })
}

function ok() {
  const v = text.value.trim()
  open.value = false
  resolver?.(v || null)
  resolver = null
}
function cancel() {
  open.value = false
  resolver?.(null)
  resolver = null
}

defineExpose({ ask })
</script>

<template>
  <div v-if="open" class="overlay" style="z-index: 200;" @mousedown.self="cancel">
    <div class="modal" style="width: min(400px, calc(100vw - 80px));" @keydown.esc="cancel">
      <div class="modal-head">
        <h2>{{ title }}</h2>
      </div>
      <div class="modal-body">
        <input ref="inputEl" v-model="text" class="input" :placeholder="placeholder || '名称'"
          @keydown.enter="ok" />
      </div>
      <div class="modal-foot">
        <button class="btn" @click="cancel">取消</button>
        <button class="btn primary" @click="ok">确定</button>
      </div>
    </div>
  </div>
</template>
