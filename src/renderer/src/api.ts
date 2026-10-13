import type { Api } from '../../shared/types'
import { plain } from '../../shared/plain'

declare global {
  interface Window { api: Api }
}

/**
 * contextBridge 暴露出来的对象是被冻结的（属性 non-configurable / 只读），
 * 直接在上面套 Proxy 会违反 Proxy 不变式并抛
 * "property 'x' is a read-only and non-configurable data property..."。
 * 所以这里显式复制一层：每个函数换成「先把参数摊平再调用」的包装。
 *
 * 参数摊平的必要性见 shared/plain.ts —— Vue 的响应式对象是 Proxy，
 * 不摊平就会在穿过 contextBridge 时抛 "An object could not be cloned."，
 * 表现就是「点了保存没反应」。
 */
const cache = new WeakMap<object, Record<string, any>>()

function wrapNamespace(ns: any): Record<string, any> {
  if (cache.has(ns)) return cache.get(ns)!
  const out: Record<string, any> = {}
  for (const k of Object.keys(ns)) {
    const v = ns[k]
    if (typeof v === 'function') {
      out[k] = (...args: any[]) => v.apply(ns, args.map((a) => plain(a)))
    } else if (v && typeof v === 'object') {
      // 嵌套命名空间（records / goals / materials ...）必须继续往下包，
      // 否则它的方法会拿着原始响应式对象直接穿过 contextBridge。
      out[k] = wrapNamespace(v)
    } else {
      out[k] = v
    }
  }
  cache.set(ns, out)
  return out
}

let root: Record<string, any> | null = null

// 延迟取 window.api（浏览器预览模式下 mock 是异步安装的）
export const api: Api = new Proxy({} as Api, {
  get(_t, prop: string) {
    const real = (window as any).api
    if (!real) throw new Error('api 尚未就绪')
    if (!root) root = wrapNamespace(real)
    return root[prop]
  }
})
