// 开发预览用 mock：仅在非 Electron 环境（vite 纯浏览器模式）生效
import type { Api } from '../../shared/types'

const iso = () => new Date().toISOString().slice(0, 10)
const delay = () => new Promise(r => setTimeout(r, 60))

function mk<T>(v: T): Promise<T> { return delay().then(() => JSON.parse(JSON.stringify(v))) }

const goals = [
  { id: 1, parent_id: null, title: '水彩入门', description: '从零开始画点小东西', status: 'active', sort: 0, domain: 'hobby', target_total: 30, target_unit: '张', start_date: '2026-09-01', due_date: '2026-12-31', rec_count: 4, rec_minutes: 135, rec_qty: 6, refl_count: 1, created_at: '', updated_at: '', children: [
    { id: 11, parent_id: 1, title: '基础技法', description: '', status: 'active', sort: 0, target_total: 0, target_unit: '', start_date: '2026-09-05', due_date: '', rec_count: 2, rec_minutes: 80, rec_qty: 0, refl_count: 0, created_at: '', updated_at: '', children: [] },
    { id: 12, parent_id: 1, title: '临摹小画', description: '', status: 'paused', sort: 1, target_total: 20, target_unit: '张', start_date: '2026-09-20', due_date: '2026-10-10', rec_count: 1, rec_minutes: 30, rec_qty: 2, refl_count: 1, created_at: '', updated_at: '', children: [] }
  ] },
  { id: 2, parent_id: null, title: '读《夜晚的潜水艇》', description: '', status: 'active', sort: 1, domain: 'study', target_total: 0, target_unit: '', start_date: '2026-10-01', due_date: '', rec_count: 3, rec_minutes: 90, rec_qty: 0, refl_count: 2, created_at: '', updated_at: '', children: [] }
]

const routes = [
  { id: 1, parent_id: null, title: '水彩 · 基础路线', domain: 'hobby', status: 'doing', weight: 2, progress: 46, sort: 0, resources: [], mat_count: 1, rec_count: 3, rec_minutes: 105, rec_qty: 0, refl_count: 1, created_at: '', updated_at: '', children: [
    { id: 11, parent_id: 1, title: '平涂与渐变', domain: 'hobby', status: 'done', weight: 1, progress: 100, sort: 0, resources: [], mat_count: 1, rec_count: 1, rec_minutes: 60, rec_qty: 0, refl_count: 0, created_at: '', updated_at: '', children: [] },
    { id: 12, parent_id: 1, title: '干湿画法', domain: 'hobby', status: 'doing', weight: 1, progress: 50, sort: 1, resources: [], mat_count: 0, rec_count: 2, rec_minutes: 45, rec_qty: 0, refl_count: 1, created_at: '', updated_at: '', children: [] },
    { id: 13, parent_id: 1, title: '简单风景', domain: 'hobby', status: 'todo', weight: 2, progress: 0, sort: 2, resources: [], mat_count: 0, rec_count: 0, rec_minutes: 0, rec_qty: 0, refl_count: 0, created_at: '', updated_at: '', children: [] }
  ] },
  { id: 2, parent_id: null, title: '英语 · 语法路线', domain: 'study', status: 'doing', weight: 2, progress: 30, sort: 1, resources: [], mat_count: 0, rec_count: 1, rec_minutes: 40, rec_qty: 0, refl_count: 0, created_at: '', updated_at: '', children: [
    { id: 21, parent_id: 2, title: '时态', domain: 'study', status: 'doing', weight: 1, progress: 50, sort: 0, resources: [], mat_count: 0, rec_count: 1, rec_minutes: 40, rec_qty: 0, refl_count: 0, created_at: '', updated_at: '', children: [] }
  ] }
]

const records = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  date: iso(),
  content: ['画了三张色卡练习，晕染比上周稳了', '读到第三篇，陈透纳的梦写得真好', '看了渐变的教学视频并跟画', '整理了本子的颜料清单'][i % 4],
  duration_min: [45, 30, 60, 20][i % 4],
  goal_id: (i % 2) + 1,
  route_node_id: i % 3 === 0 ? 11 : i % 3 === 1 ? 12 : null,
  quantity: i % 4 === 0 ? 3 : 0,
  start_time: '',
  end_time: '',
  tags: [['水彩'], ['读书'], ['水彩', '练习'], ['随手']][i % 4],
  created_at: '', updated_at: ''
}))

const notes = [
  { id: 1, content: '周末去文具店看看纸', color: '#E4EC81', x: 30, y: 24, x2: 260, y2: 60, domain: 'hobby', created_at: '', updated_at: '' },
  { id: 2, content: '「慢慢来，比较快」', color: '#F5E9C9', x: 300, y: 120, x2: 40, y2: 200, domain: 'study', created_at: '', updated_at: '' },
  { id: 3, content: '下一个想画：窗台上的绿萝', color: '#D8E8D4', x: 120, y: 230, x2: 340, y2: 250, domain: 'hobby', created_at: '', updated_at: '' }
]

const projectSeed = [
  { id: 1, title: '手帐扫描存档', avatar: '', path: 'D:\\手帐', repo_url: '', description: '把手帐页扫成 PDF 归档', status: 'active', domain: 'hobby', created_at: '' },
  { id: 2, title: '小屋网站', avatar: '', path: '', repo_url: 'https://github.com/example/hut', description: '', status: 'archived', domain: 'study', created_at: '' }
]

// goals/routes 的轻量足迹摘要（真实实现是含子树汇总，这里够用就行）
function sumFor(col: 'goal_id' | 'route_node_id', id: number) {
  const rs = records.filter((r: any) => r[col] === id)
  const minutes = rs.reduce((a, r: any) => a + (r.duration_min || 0), 0)
  return {
    count: rs.length,
    minutes,
    quantity: rs.reduce((a, r: any) => a + (r.quantity || 0), 0),
    refl: 0,
    own_count: rs.length,
    own_minutes: minutes
  }
}

export function installMock() {
  const api: any = {
    goals: {
      tree: (domain?: string) => mk(domain ? goals.filter((g: any) => g.domain === domain) : goals),
      create: (d: any) => {
        const node: any = { id: Date.now(), status: 'active', sort: 0, children: [], ...d }
        if (node.parent_id != null) {
          const find = (arr: any[]): any => {
            for (const n of arr) {
              if (n.id === node.parent_id) return n
              const r = n.children?.length ? find(n.children) : null
              if (r) return r
            }
            return null
          }
          find(goals)?.children.push(node)
        } else {
          goals.push(node)
        }
        return mk(node)
      },
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      events: () => mk([
        { id: 1, date: iso(), title: '画完第一张完整小画', description: '窗台上的杯子', goal_id: 1 },
        { id: 2, date: iso(), title: '读完第二章', description: '', goal_id: 2 }
      ]),
      addEvent: () => Promise.resolve(),
      removeEvent: () => Promise.resolve(),
      progressList: () => mk([{ id: 1, goal_id: 1, date: iso(), delta: 6, created_at: '' }]),
      addProgress: () => mk({ total: 0 }),
      removeProgress: () => mk({ total: 0 })
    },
    routes: {
      tree: (domain?: string) => mk(domain ? routes.filter((r: any) => r.domain === domain) : routes),
      create: (d: any) => {
        const node: any = { id: Date.now(), status: 'todo', weight: 1, progress: 0, sort: 0, children: [], ...d }
        if (node.parent_id != null) {
          const find = (arr: any[]): any => {
            for (const n of arr) {
              if (n.id === node.parent_id) return n
              const r = n.children?.length ? find(n.children) : null
              if (r) return r
            }
            return null
          }
          find(routes)?.children.push(node)
        } else {
          routes.push(node)
        }
        return mk(node)
      },
      update: (id: number, patch: any) => {
        const find = (arr: any[]): any => {
          for (const n of arr) {
            if (n.id === id) return n
            const r = n.children?.length ? find(n.children) : null
            if (r) return r
          }
          return null
        }
        const n = find(routes)
        if (n && patch.resources) n.resources = patch.resources
        return Promise.resolve()
      },
      remove: () => Promise.resolve()
    },
    records: {
      list: () => mk(records),
      recent: () => mk(records.slice(0, 8)),
      create: (d: any) => {
        const r: any = { id: Date.now(), created_at: '', updated_at: '', start_time: '', end_time: '', route_node_id: null, quantity: 0, ...d }
        records.unshift(r)
        return mk(r)
      },
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      day: () => mk(records.slice(0, 3)),
      forGoal: (id: number) => mk({ records: records.filter(r => r.goal_id === id), reflections: [] }),
      forNode: (id: number) => mk({
        records: records.filter(r => r.route_node_id === id || (id === 1 && [11, 12, 13].includes(r.route_node_id as number))),
        reflections: [{ id: 5, record_id: 1, date: iso(), content: '晕开的那一瞬间有点像下小雨。', tags: [] }]
      }),
      // 轻量摘要（真实 IPC 是含子树汇总，预览里只要能出数就行）
      summaryForGoal: (id: number) => mk(sumFor('goal_id', id)),
      summaryForNode: (id: number) => mk(sumFor('route_node_id', id))
    },
    reflections: {
      list: (_o?: any, _domain?: string) => mk([
        { id: 1, record_id: null, date: iso(), content: '晕开的那一瞬间有点像下小雨，纸上会自己长出雾。', tags: ['水彩'] },
        { id: 2, record_id: null, date: iso(), content: '原来「每天一点」不是鸡血，是容忍自己写得少。', tags: ['心态'] },
        { id: 3, record_id: null, date: iso(), content: '读完那篇《音乐家》，想在下雨天再读一遍。', tags: ['读书'] }
      ]),
      create: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      thatDay: () => mk({ records: records.slice(0, 2), reflections: [] })
    },
    notes: {
      list: (domain?: string) => mk(domain ? notes.filter((n: any) => n.domain === domain) : notes),
      create: (d: any) => mk({ id: 99, created_at: '', updated_at: '', ...d }),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve()
    },
    materials: {
      list: (_type?: string, _domain?: string) => mk([
        { id: 1, type: 'web', title: '水彩入门教程合集', source: 'https://example.com/wc', note: '系统性看一遍', goal_id: 1, route_node_id: null, domain: 'hobby', tags: ['水彩'], created_at: '' },
        { id: 2, type: 'video', title: '【湿画法】星空示范', source: 'https://example.com/v', note: '', goal_id: null, route_node_id: 11, domain: 'hobby', tags: ['视频'], created_at: '' },
        { id: 3, type: 'software', title: 'Krita', source: 'C:\\Program Files\\Krita', note: '板绘画着玩', goal_id: null, route_node_id: null, domain: 'hobby', tags: ['软件'], created_at: '' },
        { id: 4, type: 'file', title: '色卡参考.pdf', source: 'D:\\refs\\色卡.pdf', note: '', goal_id: null, route_node_id: null, domain: 'hobby', tags: ['参考'], created_at: '' }
      ]),
      create: (d: any) => mk({ id: 99, ...d }),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      open: () => Promise.resolve(),
      importFile: () => mk([]),
      forGoal: (id: number) => mk([
        { id: 1, type: 'web', title: '水彩入门教程合集', source: 'https://example.com/wc', note: '系统性看一遍', goal_id: id, route_node_id: null, domain: 'hobby', tags: [], created_at: '' },
        { id: 2, type: 'video', title: '【湿画法】星空示范', source: 'https://example.com/v', note: '', goal_id: 12, route_node_id: null, domain: 'hobby', tags: [], created_at: '' }
      ].filter((m: any) => m.goal_id === id || id === 1)),
      forNode: (id: number) => mk([
        { id: 2, type: 'video', title: '【湿画法】星空示范', source: 'https://example.com/v', note: '', goal_id: null, route_node_id: 11, domain: 'hobby', tags: [], created_at: '' }
      ].filter((m: any) => m.route_node_id === id || id === 1))
    },
    projects: {
      list: (domain?: string) => mk(projectSeed.filter((p: any) => !domain || p.domain === domain)),
      create: (d: any) => mk({ id: 99, ...d }),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve()
    },
    wishlist: {
      list: (_domain?: string) => mk([
        { id: 1, title: '口琴', note: '布鲁斯十孔', stage: 'sprout', converted_goal_id: null, created_at: '' },
        { id: 2, title: '油画棒', note: '', stage: 'seedling', converted_goal_id: 2, created_at: '' },
        { id: 3, title: '速写', note: '每天一支小速写', stage: 'bloom', converted_goal_id: 3, created_at: '' }
      ]),
      create: (d: any) => mk({ id: 99, ...d }),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      convert: () => mk(1)
    },
    search: (q: string) => {
      const needle = q.trim().toLowerCase()
      if (!needle) return mk([])
      const hits: any[] = []
      const flat = (arr: any[], kind: string, route: string) => {
        for (const n of arr) {
          if (n.title?.toLowerCase().includes(needle) || n.content?.toLowerCase().includes(needle))
            hits.push({ kind, ref_id: n.id, title: n.title || String(n.content || '').slice(0, 20), snippet: String(n.content || '').slice(0, 30), route })
          if (n.children?.length) flat(n.children, kind, route)
        }
      }
      flat(goals, 'goal', '/goals')
      flat(routes, 'route', '/routes')
      flat(records, 'record', '/records')
      flat(notes, 'note', '/')
      return mk(hits.slice(0, 20))
    },
    reports: {
      summary: (_from?: string, _to?: string, _domain?: string) => mk({
        from: '', to: '', total_count: 42, total_minutes: 1380,
        by_day: Array.from({ length: 30 }, (_, i) => ({ date: iso(), count: i % 3, minutes: [0, 25, 45, 80, 120, 200][i % 6] })),
        by_goal: [
          { goal_id: 1, title: '水彩入门', count: 20, minutes: 640 },
          { goal_id: 2, title: '读《夜晚的潜水艇》', count: 12, minutes: 420 },
          { goal_id: null, title: '未关联', count: 10, minutes: 320 }
        ]
      }),
      export: (_kind?: string, _domain?: string) => mk('mock-path')
    },
    checkin: {
      goals: (_domain?: string) => mk([
        { id: 1, title: '每天读 10 页', note: '', domain: 'study', sort: 0, created_at: '' },
        { id: 2, title: '练 20 分钟琴', note: '晚上', domain: 'hobby', sort: 1, created_at: '' },
        { id: 3, title: '背 15 个单词', note: '', domain: 'study', sort: 2, created_at: '' }
      ]),
      create: (d: any) => mk({ id: Date.now(), sort: 0, created_at: '', ...d }),
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      toggle: (_goalId: number, _date: string) => mk({ checked: true }),
      logs: (_goalId: number) => mk([
        { id: 1, goal_id: _goalId, date: iso(), note: '', created_at: '' },
        { id: 2, goal_id: _goalId, date: iso(), note: '状态不错', created_at: '' }
      ]),
      stats: () => mk({ total: 12, streak: 4, last_date: iso() })
    },
    bgm: { setFolder: () => mk({ folder: 'D:\\Music', added: 3 }), list: () => mk([]) },
    settings: { get: (k: string) => mk(k === 'profile' ? { nickname: '沈先生', bio: '在学水彩和读书' } : null), set: () => Promise.resolve() },
    theme: { chrome: () => Promise.resolve() },
    win: {
      minimize: () => Promise.resolve(),
      toggleMaximize: () => Promise.resolve(false),
      close: () => Promise.resolve(),
      isMaximized: () => Promise.resolve(false),
      onMaxChanged: () => () => { /* noop */ }
    },
    dialog: { pickFolder: () => mk('D:\\mock'), pickFile: () => mk('D:\\mock\\a.png'), backupNow: () => mk('mock') },
    shell: { showItem: () => Promise.resolve(), openExternal: () => Promise.resolve() },
    appInfo: () => mk({ dbPath: 'C:\\mock\\learning-hut.db', version: '0.1.0' }),
    heatmap: (_domain?: string) => mk(
      Array.from({ length: 300 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i)
        const w = Math.random()
        return { date: d.toISOString().slice(0, 10), count: w > .4 ? 1 + Math.floor(w * 3) : 0, minutes: w > .4 ? Math.floor(w * 180) : 0 }
      }).filter(x => x.count > 0)
    )
  }
  ;(window as any).api = api as Api
  console.info('[mock] browser preview api installed')
}
