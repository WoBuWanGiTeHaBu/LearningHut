<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>()
const input = ref('')
const editing = ref(props.modelValue.slice())

function commit() {
  const t = input.value.trim().replace(/^#/, '')
  if (t && !editing.value.includes(t)) editing.value.push(t)
  input.value = ''
  emit('update:modelValue', editing.value.slice())
}
function remove(i: number) {
  editing.value.splice(i, 1)
  emit('update:modelValue', editing.value.slice())
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
  else if (e.key === 'Backspace' && !input.value && editing.value.length) remove(editing.value.length - 1)
}
</script>

<template>
  <div class="tag-input" @click="($refs.inp as HTMLInputElement)?.focus()">
    <span v-for="(t, i) in editing" :key="t" class="chip tag-chip">
      {{ t }}
      <button class="x" @click.stop="remove(i)">×</button>
    </span>
    <input ref="inp" v-model="input" class="tag-in" :placeholder="editing.length ? '' : '输入标签，回车添加'"
      @keydown="onKey" @blur="commit" />
  </div>
</template>

<style scoped>
.tag-input {
  display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
  border: 1px solid var(--line-strong); border-radius: var(--radius-s);
  padding: 5px 9px; background: var(--card); cursor: text;
}
.tag-input:focus-within { border-color: var(--grass); box-shadow: 0 0 0 3px color-mix(in srgb, var(--grass) 18%, transparent); }
.tag-chip { display: inline-flex; align-items: center; gap: 3px; }
.tag-chip .x { border: none; background: none; cursor: pointer; color: var(--ink-3); font-size: 13px; line-height: 1; padding: 0 1px; }
.tag-chip .x:hover { color: var(--danger); }
.tag-in { border: none; outline: none; flex: 1; min-width: 80px; background: transparent; font-size: 13px; }
</style>
