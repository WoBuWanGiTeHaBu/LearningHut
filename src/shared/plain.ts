/**
 * 把响应式对象摊平成纯数据。
 *
 * 坑：Vue 的 reactive()/ref 包裹的数组、对象都是 Proxy，而 V8 的结构化克隆
 * **拒绝克隆 Proxy**。渲染层只要把 `form`、`tags.value` 这类响应式值直接传给
 * window.api.*，参数在穿过 contextBridge 时就会抛
 * "An object could not be cloned."，表现就是「点了保存一点反应都没有」。
 *
 * 所以所有 IPC 参数都必须先过这里，转成普通对象/数组再发出。
 */
export function plain<T = any>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (v instanceof Date || v instanceof RegExp || v instanceof ArrayBuffer) return v
  if (Array.isArray(v)) return v.map((x) => plain(x)) as unknown as T
  const out: Record<string, any> = {}
  for (const k of Object.keys(v as any)) {
    const val = (v as any)[k]
    if (typeof val !== 'function') out[k] = plain(val)
  }
  return out as T
}
