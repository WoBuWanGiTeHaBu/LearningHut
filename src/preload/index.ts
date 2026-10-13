// preload：contextBridge 白名单暴露
import { contextBridge, ipcRenderer } from 'electron'
import { plain } from '../shared/plain'

// 再兜一层：即使渲染层漏了摊平，主进程也不会收到不可克隆的值
const invoke = (ch: string, ...args: any[]) => ipcRenderer.invoke(ch, ...args.map((a) => plain(a)))

const api = {
  goals: {
    tree: (domain?: string) => invoke('goals:tree', domain),
    create: (d: any) => invoke('goals:create', d),
    update: (id: number, d: any) => invoke('goals:update', id, d),
    remove: (id: number) => invoke('goals:remove', id),
    events: (goalId: any) => invoke('goals:events', goalId),
    addEvent: (d: any) => invoke('goals:addEvent', d),
    updateEvent: (id: number, d: any) => invoke('goals:updateEvent', id, d),
    removeEvent: (id: number) => invoke('goals:removeEvent', id),
    progressList: (goalId: number) => invoke('goals:progressList', goalId),
    addProgress: (goalId: number, d: any) => invoke('goals:addProgress', goalId, d),
    removeProgress: (id: number, goalId: number) => invoke('goals:removeProgress', id, goalId)
  },
  routes: {
    tree: (domain?: string) => invoke('routes:tree', domain),
    create: (d: any) => invoke('routes:create', d),
    update: (id: number, d: any) => invoke('routes:update', id, d),
    remove: (id: number) => invoke('routes:remove', id)
  },
  records: {
    list: (r: any, domain?: string) => invoke('records:list', r, domain),
    recent: (n: number, domain?: string) => invoke('records:recent', n, domain),
    create: (d: any) => invoke('records:create', d),
    update: (id: number, d: any) => invoke('records:update', id, d),
    remove: (id: number) => invoke('records:remove', id),
    day: (date: string) => invoke('records:day', date),
    forGoal: (id: number, opts?: any) => invoke('records:forGoal', id, opts),
    forNode: (id: number, opts?: any) => invoke('records:forNode', id, opts),
    summaryForGoal: (id: number) => invoke('records:summaryForGoal', id),
    summaryForNode: (id: number) => invoke('records:summaryForNode', id)
  },
  reflections: {
    list: (o?: any, domain?: string) => invoke('reflections:list', o, domain),
    create: (d: any) => invoke('reflections:create', d),
    remove: (id: number) => invoke('reflections:remove', id),
    thatDay: () => invoke('reflections:thatDay')
  },
  notes: {
    list: (domain?: string) => invoke('notes:list', domain),
    create: (d: any) => invoke('notes:create', d),
    update: (id: number, d: any) => invoke('notes:update', id, d),
    remove: (id: number) => invoke('notes:remove', id)
  },
  materials: {
    list: (t?: string, domain?: string) => invoke('materials:list', t, domain),
    create: (d: any) => invoke('materials:create', d),
    update: (id: number, d: any) => invoke('materials:update', id, d),
    remove: (id: number) => invoke('materials:remove', id),
    open: (id: number) => invoke('materials:open', id),
    importFile: () => invoke('materials:importFile'),
    // 某个目标 / 学习路线节点关联的资料（含子树）
    forGoal: (id: number) => invoke('materials:forGoal', id),
    forNode: (id: number) => invoke('materials:forNode', id)
  },
  projects: {
    list: (domain?: string) => invoke('projects:list', domain),
    create: (d: any) => invoke('projects:create', d),
    update: (id: number, d: any) => invoke('projects:update', id, d),
    remove: (id: number) => invoke('projects:remove', id)
  },
  wishlist: {
    list: (domain?: string) => invoke('wishlist:list', domain),
    create: (d: any) => invoke('wishlist:create', d),
    update: (id: number, d: any) => invoke('wishlist:update', id, d),
    remove: (id: number) => invoke('wishlist:remove', id),
    convert: (id: number) => invoke('wishlist:convert', id)
  },
  search: (q: string) => invoke('search', q),
  shell: {
    showItem: (p: string) => invoke('shell:showItem', p),
    openExternal: (u: string) => invoke('shell:openExternal', u)
  },
  reports: {
    summary: (from: string, to: string, domain?: string) => invoke('reports:summary', from, to, domain),
    export: (kind: string, domain?: string) => invoke('reports:export', kind, domain)
  },
  checkin: {
    goals: (domain?: string) => invoke('checkin:goals', domain),
    create: (d: any) => invoke('checkin:create', d),
    update: (id: number, d: any) => invoke('checkin:update', id, d),
    remove: (id: number) => invoke('checkin:remove', id),
    toggle: (goalId: number, date: string) => invoke('checkin:toggle', goalId, date),
    logs: (goalId: number, from?: string, to?: string) => invoke('checkin:logs', goalId, from, to),
    stats: (goalId: number) => invoke('checkin:stats', goalId)
  },
  bgm: {
    setFolder: () => invoke('bgm:setFolder'),
    list: () => invoke('bgm:list')
  },
  settings: {
    get: (k: string) => invoke('settings:get', k),
    set: (k: string, v: any) => invoke('settings:set', k, v)
  },
  theme: {
    // 把当前主题名同步给主进程，用于重画窗口底色
    chrome: (id: string) => invoke('theme:chrome', id)
  },
  win: {
    minimize: () => invoke('win:minimize'),
    toggleMaximize: () => invoke('win:toggleMaximize'),
    close: () => invoke('win:close'),
    isMaximized: () => invoke('win:isMaximized'),
    // 返回取消订阅函数
    onMaxChanged: (cb: (v: boolean) => void) => {
      const h = (_e: unknown, v: boolean) => cb(v)
      ipcRenderer.on('win:max-changed', h as any)
      return () => { ipcRenderer.removeListener('win:max-changed', h as any) }
    }
  },
  dialog: {
    pickFolder: () => invoke('dialog:pickFolder'),
    pickFile: (f?: any) => invoke('dialog:pickFile', f),
    backupNow: () => invoke('dialog:backupNow')
  },
  appInfo: () => invoke('app:info'),
  heatmap: (domain?: string) => invoke('heatmap', domain)
}

contextBridge.exposeInMainWorld('api', api)
