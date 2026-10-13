import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
  kind: 'ok' | 'err'
}

/** 全局提示条队列：任何组件 import { toast } 就能弹一条 */
export const toasts = ref<ToastItem[]>([])

let seq = 1

export function toast(text: string, kind: 'ok' | 'err' = 'ok', ms = 2600) {
  const id = seq++
  toasts.value.push({ id, text, kind })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, ms)
}
