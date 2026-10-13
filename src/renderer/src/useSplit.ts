// 左右分栏的可拖拽比例。grid 三列：左 | 拖拽条 | 右，比例存 localStorage。
// 用 minmax(0, xfr) 而不是裸 fr：裸 fr 的最小宽度是内容宽度，长链接会把对面挤扁。
import { ref, computed, type Ref, onBeforeUnmount } from 'vue'

export function useSplit(key: string, defaultLeft: number, container: Ref<HTMLElement | null>) {
  const saved = Number(localStorage.getItem(key))
  const split = ref(Number.isFinite(saved) && saved > 0.2 && saved < 0.8 ? saved : defaultLeft)
  const dragging = ref(false)

  function onDown(e: PointerEvent) {
    e.preventDefault()
    dragging.value = true
    const move = (ev: PointerEvent) => {
      const el = container.value
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width <= 0) return
      const f = (ev.clientX - r.left) / r.width
      split.value = Math.min(0.75, Math.max(0.25, f))
    }
    const up = () => {
      dragging.value = false
      try { localStorage.setItem(key, split.value.toFixed(3)) } catch { /* 存不上就下次用默认 */ }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const gridStyle = computed(() => ({
    gridTemplateColumns: `minmax(0, ${split.value}fr) 14px minmax(0, ${(1 - split.value).toFixed(3)}fr)`
  }))

  onBeforeUnmount(() => { document.body.style.cursor = '' })

  return { split, dragging, onDown, gridStyle }
}
