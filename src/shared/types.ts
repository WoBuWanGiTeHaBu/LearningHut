// 共享类型：主进程 / 渲染层共用

export interface Goal {
  id: number
  parent_id: number | null
  title: string
  description: string
  status: 'active' | 'paused' | 'done' | 'abandoned'
  sort: number
  domain: 'study' | 'hobby'
  target_total: number      // 量化总量（0 = 不量化），如 200p
  target_unit: string       // 量化单位，如 p、集、页
  start_date: string        // 起始时间 YYYY-MM-DD 或 ''
  due_date: string          // 目标完成时间 YYYY-MM-DD 或 ''（用于时间量化提醒）
  // 学习统计：rec_* = 含子树的汇总；own_* = 仅本节点
  rec_count?: number
  rec_minutes?: number
  rec_qty?: number
  refl_count?: number
  mat_count?: number
  own_count?: number
  own_minutes?: number
  own_qty?: number
  own_refl?: number
  own_mat?: number
  created_at: string
  updated_at: string
}

export interface GoalProgress {
  id: number
  goal_id: number
  date: string
  delta: number
  created_at: string
}

export interface RouteResource {
  title: string
  url: string
}

// 学习统计摘要：只给数字，不返回明细（明细用 forGoal / forNode 现取）
export interface RecSummary {
  count: number        // 含子树的记录条数
  minutes: number      // 含子树的累计分钟
  quantity: number     // 含子树的量化数
  refl: number         // 含子树的感想条数
  own_count: number    // 仅本节点
  own_minutes: number  // 仅本节点
}

export interface RouteNode {
  id: number
  parent_id: number | null
  title: string
  status: 'todo' | 'doing' | 'paused' | 'done' | 'abandoned'
  weight: number
  progress: number // 手动进度（叶子节点用）
  sort: number
  domain: 'study' | 'hobby' // 学习 / 爱好（跟着顶层路线走，子节点继承父节点）
  resources: RouteResource[] // 关联资料（老的 JSON 形式，界面已改用资料库关联）
  // 学习统计：rec_* = 含子树的汇总；own_* = 仅本节点
  rec_count?: number
  rec_minutes?: number
  rec_qty?: number
  refl_count?: number
  mat_count?: number
  own_count?: number
  own_minutes?: number
  own_qty?: number
  own_refl?: number
  own_mat?: number
  created_at: string
  updated_at: string
}

export interface StudyRecord {
  id: number
  date: string // YYYY-MM-DD
  content: string        // 可为空
  duration_min: number   // 分钟（起止时间自动折算或手填）
  start_time: string     // 'HH:MM' 或 ''
  end_time: string       // 'HH:MM' 或 ''
  goal_id: number | null
  route_node_id: number | null
  quantity: number       // 本次推进的量化数（如看了 3 集）
  domain: 'study' | 'hobby'
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Reflection {
  id: number
  record_id: number | null
  date: string
  content: string
  tags: string[]
  created_at: string
}

export interface StickyNote {
  id: number
  content: string
  color: string
  x: number          // 概览页坐标
  y: number
  x2: number         // 随手记页坐标（内容共享，位置两块板独立）
  y2: number
  domain: 'study' | 'hobby'
  created_at: string
  updated_at: string
}

export type MaterialType = 'web' | 'video' | 'image' | 'software' | 'file'

export interface Material {
  id: number
  type: MaterialType
  title: string
  source: string // URL 或本地路径
  note: string
  goal_id: number | null
  route_node_id: number | null // 关联的学习路线节点
  domain: 'study' | 'hobby'
  tags: string[]
  created_at: string
}

export interface Project {
  id: number
  title: string
  avatar: string
  path: string
  repo_url: string
  description: string
  status: 'active' | 'archived'
  domain: 'study' | 'hobby'
  created_at: string
}

export type WishStage = 'sprout' | 'seedling' | 'bloom'

export interface WishItem {
  id: number
  title: string
  note: string
  stage: WishStage
  domain: 'study' | 'hobby'
  converted_goal_id: number | null
  created_at: string
}

export interface EventItem {
  id: number
  date: string
  title: string
  description: string
  goal_id: number | null
}

export interface BgmTrack {
  id: number
  path: string
  title: string
}

// 打卡：独立的习惯清单，与目标树解耦
export interface CheckinGoal {
  id: number
  title: string
  note: string
  domain: 'study' | 'hobby'
  sort: number
  created_at: string
}

export interface CheckinLog {
  id: number
  goal_id: number
  date: string // YYYY-MM-DD
  note: string
  created_at: string
}

export interface CheckinStats {
  total: number             // 累计打卡天数
  streak: number           // 当前连续天数
  last_date: string | null // 最近一次打卡日期
}

export interface SearchHit {
  kind: string
  ref_id: number
  title: string
  snippet: string
}

export interface DayStat {
  date: string
  count: number
  minutes: number
}

export interface ReportSummary {
  from: string
  to: string
  total_count: number
  total_minutes: number
  by_day: DayStat[]
  by_goal: { goal_id: number | null; title: string; count: number; minutes: number }[]
}

export interface SearchResultItem {
  kind: string
  ref_id: number
  title: string
  snippet: string
  route: string
}

// 渲染层可用的完整 API（通过 contextBridge 暴露）
export interface Api {
  goals: {
    tree(domain?: 'study' | 'hobby'): Promise<Goal[]>
    create(data: Partial<Goal>): Promise<Goal>
    update(id: number, data: Partial<Goal>): Promise<void>
    remove(id: number): Promise<void>
    events(goalId: number | null): Promise<EventItem[]>
    addEvent(data: Partial<EventItem>): Promise<void>
    updateEvent(id: number, data: Partial<EventItem>): Promise<void>
    removeEvent(id: number): Promise<void>
    progressList(goalId: number): Promise<GoalProgress[]>
    addProgress(goalId: number, data: { date: string; delta: number }): Promise<{ total: number }>
    removeProgress(id: number, goalId: number): Promise<{ total: number }>
  }
  routes: {
    tree(domain?: 'study' | 'hobby'): Promise<RouteNode[]>
    create(data: Partial<RouteNode>): Promise<RouteNode>
    update(id: number, data: Partial<RouteNode>): Promise<void>
    remove(id: number): Promise<void>
  }
  records: {
    list(range: { from: string; to: string }, domain?: 'study' | 'hobby'): Promise<StudyRecord[]>
    recent(limit: number, domain?: 'study' | 'hobby'): Promise<StudyRecord[]>
    create(data: Partial<StudyRecord>): Promise<StudyRecord>
    update(id: number, data: Partial<StudyRecord>): Promise<void>
    remove(id: number): Promise<void>
    day(date: string): Promise<StudyRecord[]>
    forGoal(id: number, opts?: { only?: boolean }): Promise<{ records: StudyRecord[]; reflections: Reflection[] }>
    forNode(id: number, opts?: { only?: boolean }): Promise<{ records: StudyRecord[]; reflections: Reflection[] }>
    summaryForGoal(id: number): Promise<RecSummary>
    summaryForNode(id: number): Promise<RecSummary>
  }
  reflections: {
    list(opts?: { order?: 'date' | 'random'; limit?: number }, domain?: 'study' | 'hobby'): Promise<Reflection[]>
    create(data: Partial<Reflection>): Promise<Reflection>
    remove(id: number): Promise<void>
    thatDay(): Promise<{ records: StudyRecord[]; reflections: Reflection[] }>
  }
  notes: {
    list(domain?: 'study' | 'hobby'): Promise<StickyNote[]>
    create(data: Partial<StickyNote>): Promise<StickyNote>
    update(id: number, data: Partial<StickyNote>): Promise<void>
    remove(id: number): Promise<void>
  }
  materials: {
    list(type?: MaterialType, domain?: 'study' | 'hobby'): Promise<Material[]>
    create(data: Partial<Material>): Promise<Material>
    update(id: number, data: Partial<Material>): Promise<void>
    remove(id: number): Promise<void>
    open(id: number): Promise<void>
    importFile(): Promise<Material[] | null>
    forGoal(id: number): Promise<Material[]>
    forNode(id: number): Promise<Material[]>
  }
  projects: {
    list(domain?: 'study' | 'hobby'): Promise<Project[]>
    create(data: Partial<Project>): Promise<Project>
    update(id: number, data: Partial<Project>): Promise<void>
    remove(id: number): Promise<void>
  }
  wishlist: {
    list(domain?: 'study' | 'hobby'): Promise<WishItem[]>
    create(data: Partial<WishItem>): Promise<WishItem>
    update(id: number, data: Partial<WishItem>): Promise<void>
    remove(id: number): Promise<void>
    convert(id: number): Promise<number>
  }
  search(q: string): Promise<SearchResultItem[]>
  shell: {
    showItem(p: string): Promise<void>
    openExternal(u: string): Promise<void>
  }
  reports: {
    summary(from: string, to: string, domain?: 'study' | 'hobby'): Promise<ReportSummary>
    export(kind: 'json' | 'csv' | 'md', domain?: 'study' | 'hobby'): Promise<string | null>
  }
  bgm: {
    setFolder(): Promise<{ folder: string; added: number } | null>
    list(): Promise<BgmTrack[]>
  }
  settings: {
    get(key: string): Promise<any>
    set(key: string, value: any): Promise<void>
  }
  theme: {
    chrome(id: string): Promise<void>
  }
  win: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaxChanged(cb: (v: boolean) => void): () => void
  }
  dialog: {
    pickFolder(): Promise<string | null>
    pickFile(filters?: { name: string; ext: string[] }[]): Promise<string | null>
    backupNow(): Promise<string | null>
  }
  heatmap(domain?: 'study' | 'hobby'): Promise<DayStat[]>
  checkin: {
    goals(domain?: 'study' | 'hobby'): Promise<CheckinGoal[]>
    create(data: Partial<CheckinGoal>): Promise<CheckinGoal>
    update(id: number, data: Partial<CheckinGoal>): Promise<void>
    remove(id: number): Promise<void>
    toggle(goalId: number, date: string): Promise<{ checked: boolean }>
    logs(goalId: number, from?: string, to?: string): Promise<CheckinLog[]>
    stats(goalId: number): Promise<CheckinStats>
  }
}
