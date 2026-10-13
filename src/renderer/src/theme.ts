/**
 * 主题：一套色卡 = 一组 CSS 变量。
 * 变量的真实取值写在 styles/main.css 的 [data-theme='x'] 块里，
 * 这里只放元数据（名字、说明、色卡条），供设置页画选择器和迷你预览。
 * 迷你预览不做第二套取值：直接在被预览的元素上挂 data-theme='x'，
 * 里面的 var() 就会按那套色卡解析 —— 所见即所得，不会两处走样。
 */

export interface ThemeDef {
  id: string
  name: string
  desc: string
  swatch: string[]   // 五格色卡条
}

export const DEFAULT_THEME = 'leaf'

export const THEMES: ThemeDef[] = [
  {
    id: 'leaf',
    name: '绿野',
    desc: '现在这套 · 草绿纸感',
    swatch: ['#FAFCFD', '#E4EC81', '#9BC43C', '#56992F', '#1B693C']
  },
  {
    id: 'guava',
    name: '番石榴',
    desc: '芭乐配色 · 粉+橄榄绿+奶黄',
    swatch: ['#FDD7D0', '#EAE7B4', '#F19E96', '#B2BA69', '#F8ECD7']
  },
  {
    id: 'soda',
    name: '咸柠汽水',
    desc: '柠檬黄 · 青柠 · 薄荷青',
    swatch: ['#E3E17C', '#C3DC89', '#96CAA4', '#96CFC1', '#EAF3DC']
  },
  {
    id: 'hawthorn',
    name: '雪顶山楂',
    desc: '山楂红 · 奶油 · 冰蓝',
    swatch: ['#FDF5DC', '#C9EAF8', '#DA2E53', '#D40D3E', '#FBD0D8']
  },
  {
    id: 'orange',
    name: '橘子汽水',
    desc: '蜜桃 · 橘 · 汽水青',
    swatch: ['#FFEBD5', '#FFC4AF', '#FF8D65', '#8FDBE0', '#FFF1E6']
  },
  {
    id: 'allgrey',
    name: '格雷系',
    desc: '近黑灰阶 · 一点粉（暗色）',
    swatch: ['#1C1E1F', '#585858', '#FD7C9F', '#E9EBEC', '#26282B']
  }
]

const LS_KEY = 'sh-theme'

export function isTheme(id: unknown): id is string {
  return typeof id === 'string' && THEMES.some((t) => t.id === id)
}

/** 把主题挂到 <html> 上。CSS 变量挂在根上，全应用一起换色。 */
export function applyTheme(id: string) {
  const t = isTheme(id) ? id : DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(LS_KEY, t) } catch { /* 隐私模式等，忽略 */ }
  // 窗控 overlay 由系统画在窗口层，CSS 改不动 —— 得回主进程重画它的底色/符号色。
  // 用原始 window.api（不是 api.ts 的包装代理），浏览器预览下没有它也不会抛。
  try { (window as any).api?.theme?.chrome?.(t) } catch { /* 忽略 */ }
}

/** 冷启动先用缓存上色，避免闪一下默认绿；随后再用库里的值覆盖。 */
export function cachedTheme(): string {
  try {
    const v = localStorage.getItem(LS_KEY)
    return isTheme(v) ? v : DEFAULT_THEME
  } catch { return DEFAULT_THEME }
}

/** 读当前生效的变量值（便签纸色这类要落库成实际色值的地方用）。 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** 当前主题的五张便签纸色 */
export function notePalette(): string[] {
  return ['--note-1', '--note-2', '--note-3', '--note-4', '--note-5'].map(cssVar)
}
