/**
 * 主题的「窗口级」配色 —— 给 Electron 主进程用。
 *
 * 背景：窗口是无边框的（frame:false），最小化/最大化/关闭三个按钮由系统
 * 画在一层 overlay 上，颜色只能在 BrowserWindow 的 titleBarOverlay 里指定，
 * **渲染层的 CSS 改不动它**。所以换主题时除了换 html[data-theme]，
 * 还得把 overlay 的底色/符号色同步给主进程。
 *
 * 这里的取色必须和 styles/main.css 里对应 [data-theme='x'] 的
 * `--paper`（overlay 底色）与 `--ink`（符号色）一致 —— 两处一起改。
 */
export const DEFAULT_THEME = 'leaf'

export interface ThemeChrome {
  /** overlay 背板色，取自 --paper */
  color: string
  /** 最小/最大/关闭图标色，取自 --ink */
  symbolColor: string
}

export const THEME_CHROME: Record<string, ThemeChrome> = {
  leaf: { color: '#FAFCFD', symbolColor: '#23361A' },
  guava: { color: '#FEFAF6', symbolColor: '#45322E' },
  soda: { color: '#FAFCF3', symbolColor: '#22362B' },
  hawthorn: { color: '#FDFAF4', symbolColor: '#3B1F28' },
  orange: { color: '#FFFAF4', symbolColor: '#43291C' },
  allgrey: { color: '#16181A', symbolColor: '#E9EBEC' }
}

export function isThemeId(v: unknown): v is string {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(THEME_CHROME, v)
}

/** 取某个主题的窗口配色；未知/空值退回默认主题。 */
export function chromeFor(id: unknown): ThemeChrome {
  return THEME_CHROME[isThemeId(id) ? id : DEFAULT_THEME]
}
