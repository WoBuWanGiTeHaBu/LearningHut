// 全部 IPC handlers
import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  openDb, getSetting, setSetting, parseTags, searchUpsert, searchDelete,
  searchQuery, backupNow, dbPath
} from './db'
import type { MaterialType, ReportSummary } from '../shared/types'
import { chromeFor } from '../shared/theme'

let win: BrowserWindow | null = null
export function setMainWindow(w: BrowserWindow) { win = w }

type DB = ReturnType<typeof openDb>

const today = () => new Date().toISOString().slice(0, 10)
const nowIso = () => new Date().toISOString()

export function registerIpc() {
  const db = openDb()

  // ---------- 目标 ----------
  const goalTree = (domain?: string): any[] => {
    const rows = domain
      ? (db.prepare(`SELECT * FROM goals WHERE domain=? ORDER BY sort, id`).all(domain) as any[])
      : (db.prepare(`SELECT * FROM goals ORDER BY sort, id`).all() as any[])
    return rows.map(r => ({ ...r }))
  }
  const childrenOf = (rows: any[], pid: number | null): any[] =>
    rows.filter(r => r.parent_id === pid).map(r => ({ ...r, children: childrenOf(rows, r.id) }))

  ipcMain.handle('goals:tree', (_e, domain?: string) => {
    const tree = childrenOf(goalTree(domain), null)
    attachStats(tree, 'goal_id', 'goal')
    return tree
  })

  ipcMain.handle('goals:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO goals(parent_id,title,description,status,sort,domain,target_total,target_unit,start_date,due_date) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(data.parent_id ?? null, data.title || '未命名目标', data.description || '', data.status || 'active', data.sort ?? 0, data.domain || 'study', Number(data.target_total) || 0, data.target_unit || '', data.start_date || '', data.due_date || '')
    const id = Number(r.lastInsertRowid)
    const row = db.prepare(`SELECT * FROM goals WHERE id=?`).get(id) as any
    searchUpsert('goal', id, row.title, row.description)
    return row
  })
  ipcMain.handle('goals:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['parent_id', 'title', 'description', 'status', 'sort', 'target_total', 'target_unit', 'start_date', 'due_date']) if (k in data) fields[k] = data[k]
    if ('target_total' in fields) fields.target_total = Number(fields.target_total) || 0
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE goals SET ${sets}, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM goals WHERE id=?`).get(id) as any
    if (row) searchUpsert('goal', id, row.title, row.description)
  })
  ipcMain.handle('goals:remove', (_e, id: number) => {
    // 级联：收集整棵子树
    const all = goalTree()
    const ids: number[] = [id]
    let frontier = [id]
    while (frontier.length) {
      const next = all.filter(r => frontier.includes(r.parent_id)).map(r => r.id)
      ids.push(...next); frontier = next
    }
    for (const i of ids) {
      db.prepare(`DELETE FROM goals WHERE id=?`).run(i)
      searchDelete('goal', i)
      db.prepare(`DELETE FROM events WHERE goal_id=?`).run(i)
      db.prepare(`DELETE FROM goal_progress WHERE goal_id=?`).run(i)
    }
  })

  // ---------- 目标量化进度（与学习记录解耦，直接在目标页记录） ----------
  const goalQtyTotal = (goalId: number): number => {
    const r = db.prepare(`SELECT COALESCE(SUM(delta),0) q FROM goal_progress WHERE goal_id=?`).get(goalId) as any
    return Number(r?.q || 0)
  }
  ipcMain.handle('goals:progressList', (_e, goalId: number) => {
    return db.prepare(`SELECT * FROM goal_progress WHERE goal_id=? ORDER BY date DESC, id DESC`).all(goalId)
  })
  ipcMain.handle('goals:addProgress', (_e, goalId: number, data: any) => {
    const delta = Number(data?.delta) || 0
    db.prepare(`INSERT INTO goal_progress(goal_id,date,delta) VALUES(?,?,?)`)
      .run(goalId, data?.date || today(), delta)
    return { total: goalQtyTotal(goalId) }
  })
  ipcMain.handle('goals:removeProgress', (_e, id: number, goalId: number) => {
    db.prepare(`DELETE FROM goal_progress WHERE id=?`).run(id)
    return { total: goalQtyTotal(goalId) }
  })

  ipcMain.handle('goals:events', (_e, goalId: number | null) => {
    if (goalId == null) return db.prepare(`SELECT * FROM events ORDER BY date DESC, id DESC`).all()
    return db.prepare(`SELECT * FROM events WHERE goal_id=? ORDER BY date DESC, id DESC`).all(goalId)
  })
  ipcMain.handle('goals:addEvent', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO events(date,title,description,goal_id) VALUES(?,?,?,?)`)
      .run(data.date || today(), data.title || '', data.description || '', data.goal_id ?? null)
    const id = Number(r.lastInsertRowid)
    searchUpsert('event', id, data.title || '', data.description || '')
    return id
  })
  ipcMain.handle('goals:updateEvent', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['date', 'title', 'description', 'goal_id']) if (k in data) fields[k] = data[k]
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE events SET ${sets} WHERE id=?`).run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM events WHERE id=?`).get(id) as any
    if (row) searchUpsert('event', id, row.title, row.description)
  })
  ipcMain.handle('goals:removeEvent', (_e, id: number) => {
    db.prepare(`DELETE FROM events WHERE id=?`).run(id); searchDelete('event', id)
  })

  // ---------- 路线 ----------
  const routeNodeOut = (r: any) => {
    let res: any[] = []
    try { const a = JSON.parse(r.resources || '[]'); if (Array.isArray(a)) res = a } catch {}
    return { ...r, resources: res }
  }
  // domain 省略时返回全部（内部删除递归要用），给了就只取该域（顶层路线按学习/爱好分开）
  const routeTree = (domain?: string): any[] => {
    const rows = (domain
      ? db.prepare(`SELECT * FROM route_nodes WHERE domain=? ORDER BY sort, id`).all(domain)
      : db.prepare(`SELECT * FROM route_nodes ORDER BY sort, id`).all()) as any[]
    return rows.map(routeNodeOut)
  }
  const routeChildren = (rows: any[], pid: number | null): any[] =>
    rows.filter(r => r.parent_id === pid).map(r => ({ ...r, children: routeChildren(rows, r.id) }))

  // 学习统计：按 goal_id / route_node_id 聚合，挂到树的每个节点。
  // rec_* / refl_count = 整棵子树的汇总（父节点包含所有后代，嵌套目标才不会「下面记了、上面还是 0」）
  // own_* 保留「只统计本节点」的数字，界面需要区分时可用。
  // 量化数（rec_qty）来源：目标取 goal_progress 累加；路线节点取学习记录里的 quantity
  const attachStats = (nodes: any[], key: string, mode: 'goal' | 'route') => {
    if (!nodes.length) return
    const recRows = db.prepare(`SELECT ${key} k, COUNT(*) c, COALESCE(SUM(duration_min),0) m
      FROM study_records WHERE ${key} IS NOT NULL GROUP BY ${key}`).all() as any[]
    const qtyRows = (mode === 'goal'
      ? db.prepare(`SELECT goal_id k, COALESCE(SUM(delta),0) q FROM goal_progress GROUP BY goal_id`).all()
      : db.prepare(`SELECT route_node_id k, COALESCE(SUM(quantity),0) q FROM study_records WHERE route_node_id IS NOT NULL GROUP BY route_node_id`).all()) as any[]
    const reflRows = db.prepare(`SELECT sr.${key} k, COUNT(*) c FROM reflections rf
      JOIN study_records sr ON sr.id = rf.record_id WHERE sr.${key} IS NOT NULL GROUP BY sr.${key}`).all() as any[]
    // 关联资料（现在统一存在 materials 里，按 goal_id / route_node_id 挂）
    const matRows = (mode === 'goal'
      ? db.prepare(`SELECT goal_id k, COUNT(*) c FROM materials WHERE goal_id IS NOT NULL GROUP BY goal_id`).all()
      : db.prepare(`SELECT route_node_id k, COUNT(*) c FROM materials WHERE route_node_id IS NOT NULL GROUP BY route_node_id`).all()) as any[]
    const recMap = new Map(recRows.map(r => [r.k, r]))
    const qtyMap = new Map(qtyRows.map(r => [r.k, r.q]))
    const reflMap = new Map(reflRows.map(r => [r.k, r.c]))
    const matMap = new Map(matRows.map(r => [r.k, r.c]))
    // 自底向上：先写自身，再把子节点已汇总的值累加上来
    const walk = (n: any): { c: number; m: number; q: number; rf: number; mt: number } => {
      const s = recMap.get(n.id)
      const own = {
        c: Number(s?.c) || 0,
        m: Number(s?.m) || 0,
        q: Number(qtyMap.get(n.id)) || 0,
        rf: Number(reflMap.get(n.id)) || 0,
        mt: Number(matMap.get(n.id)) || 0
      }
      let c = own.c, m = own.m, q = own.q, rf = own.rf, mt = own.mt
      for (const k of n.children || []) {
        const sub = walk(k)
        c += sub.c; m += sub.m; q += sub.q; rf += sub.rf; mt += sub.mt
      }
      n.own_count = own.c
      n.own_minutes = own.m
      n.own_qty = own.q
      n.own_refl = own.rf
      n.own_mat = own.mt
      n.rec_count = c
      n.rec_minutes = m
      n.rec_qty = q
      n.refl_count = rf
      n.mat_count = mt
      return { c, m, q, rf, mt }
    }
    for (const n of nodes) walk(n)
  }

  const recomputeRoute = (id: number) => {
    // 自底向上：父节点进度 = 子节点按权重加权平均
    const row = db.prepare(`SELECT * FROM route_nodes WHERE id=?`).get(id) as any
    if (!row) return
    const kids = db.prepare(`SELECT id FROM route_nodes WHERE parent_id=?`).all(id) as any[]
    if (kids.length) {
      const details = kids.map(k => db.prepare(`SELECT weight, progress FROM route_nodes WHERE id=?`).get(k.id) as any)
      const wsum = details.reduce((s, d) => s + (d.weight || 1), 0) || 1
      const prog = Math.round(details.reduce((s, d) => s + (d.progress || 0) * (d.weight || 1), 0) / wsum)
      db.prepare(`UPDATE route_nodes SET progress=?, updated_at=datetime('now','localtime') WHERE id=?`).run(prog, id)
    }
    if (row.parent_id != null) recomputeRoute(row.parent_id)
  }

  ipcMain.handle('routes:tree', (_e, domain?: string) => {
    const tree = routeChildren(routeTree(domain), null)
    attachStats(tree, 'route_node_id', 'route')
    return tree
  })
  ipcMain.handle('routes:create', (_e, data: any) => {
    // 顶层路线用传入的域；子节点一律继承父节点的域，保证一棵树同域
    let domain = data.domain || 'study'
    if (data.parent_id != null) {
      const p = db.prepare(`SELECT domain FROM route_nodes WHERE id=?`).get(data.parent_id) as any
      if (p?.domain) domain = p.domain
    }
    const r = db.prepare(`INSERT INTO route_nodes(parent_id,title,status,weight,progress,sort,domain) VALUES(?,?,?,?,?,?,?)`)
      .run(data.parent_id ?? null, data.title || '未命名节点', data.status || 'todo', data.weight ?? 1, data.progress ?? 0, data.sort ?? 0, domain)
    const id = Number(r.lastInsertRowid)
    if (data.parent_id != null) recomputeRoute(data.parent_id)
    searchUpsert('route', id, data.title || '', '')
    return routeNodeOut(db.prepare(`SELECT * FROM route_nodes WHERE id=?`).get(id))
  })
  ipcMain.handle('routes:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['parent_id', 'title', 'status', 'weight', 'progress', 'sort', 'resources']) if (k in data) fields[k] = data[k]
    if ('resources' in fields && !Array.isArray(fields.resources)) fields.resources = '[]'
    if ('resources' in fields && Array.isArray(fields.resources)) fields.resources = JSON.stringify(fields.resources)
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE route_nodes SET ${sets}, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(...Object.values(fields), id)
    // 状态联动叶子进度
    if ('status' in data) {
      const map: Record<string, number> = { todo: 0, doing: 50, paused: 50, done: 100, abandoned: 0 }
      const row = db.prepare(`SELECT parent_id FROM route_nodes WHERE id=?`).get(id) as any
      const hasKids = (db.prepare(`SELECT COUNT(*) c FROM route_nodes WHERE parent_id=?`).get(id) as any).c > 0
      if (!hasKids && row) {
        db.prepare(`UPDATE route_nodes SET progress=? WHERE id=?`).run(map[data.status] ?? 0, id)
      }
    }
    const row2 = db.prepare(`SELECT parent_id FROM route_nodes WHERE id=?`).get(id) as any
    if (row2?.parent_id != null) recomputeRoute(row2.parent_id)
    const r = db.prepare(`SELECT * FROM route_nodes WHERE id=?`).get(id) as any
    if (r) searchUpsert('route', id, r.title, '')
  })
  ipcMain.handle('routes:remove', (_e, id: number) => {
    const all = routeTree()
    const ids: number[] = [id]
    let frontier = [id]
    while (frontier.length) {
      const next = all.filter(r => frontier.includes(r.parent_id)).map(r => r.id)
      ids.push(...next); frontier = next
    }
    for (const i of ids) {
      db.prepare(`DELETE FROM route_nodes WHERE id=?`).run(i)
      searchDelete('route', i)
    }
    // 逐个重算受影响父级
    const roots = all.filter(r => ids.includes(r.parent_id)).map(r => r.parent_id)
    for (const p of new Set(roots)) if (p != null && !ids.includes(p)) recomputeRoute(p)
  })

  // ---------- 学习记录 ----------
  const recordOut = (r: any) => ({ ...r, tags: parseTags(r.tags), resources: undefined })

  ipcMain.handle('records:list', (_e, range: { from: string; to: string }, domain?: string) => {
    let rows: any[]
    if (domain) {
      rows = db.prepare(`SELECT * FROM study_records WHERE date BETWEEN ? AND ? AND domain=? ORDER BY date DESC, id DESC`)
        .all(range.from, range.to, domain) as any[]
    } else {
      rows = db.prepare(`SELECT * FROM study_records WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC`)
        .all(range.from, range.to) as any[]
    }
    return rows.map(recordOut)
  })
  ipcMain.handle('records:recent', (_e, limit: number, domain?: string) => {
    let rows: any[]
    if (domain) {
      rows = db.prepare(`SELECT * FROM study_records WHERE domain=? ORDER BY date DESC, id DESC LIMIT ?`).all(domain, limit || 10) as any[]
    } else {
      rows = db.prepare(`SELECT * FROM study_records ORDER BY date DESC, id DESC LIMIT ?`).all(limit || 10) as any[]
    }
    return rows.map(recordOut)
  })
  // 起止时间自动折算时长（跨零点按 +24h 处理）
  const calcDuration = (d: any): number => {
    if (d.duration_min != null && Number(d.duration_min) > 0) return Number(d.duration_min)
    if (d.start_time && d.end_time) {
      const [sh, sm] = String(d.start_time).split(':').map(Number)
      const [eh, em] = String(d.end_time).split(':').map(Number)
      let mins = (eh * 60 + em) - (sh * 60 + sm)
      if (mins <= 0) mins += 24 * 60
      return mins
    }
    return 0
  }
  ipcMain.handle('records:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO study_records(date,content,duration_min,goal_id,route_node_id,domain,tags,start_time,end_time,quantity) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(data.date || today(), data.content || '', calcDuration(data), data.goal_id ?? null, data.route_node_id ?? null,
        data.domain || 'study', JSON.stringify(data.tags || []), data.start_time || '', data.end_time || '', Number(data.quantity) || 0)
    const id = Number(r.lastInsertRowid)
    searchUpsert('record', id, data.content || '', data.content || '')
    return recordOut(db.prepare(`SELECT * FROM study_records WHERE id=?`).get(id))
  })
  ipcMain.handle('records:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['date', 'content', 'duration_min', 'goal_id', 'route_node_id', 'domain', 'tags', 'start_time', 'end_time', 'quantity'])
      if (k in data) fields[k] = k === 'tags' ? JSON.stringify(data[k]) : data[k]
    if ('quantity' in fields) fields.quantity = Number(fields.quantity) || 0
    if (Object.keys(fields).some(k => ['duration_min', 'start_time', 'end_time'].includes(k))) {
      fields.duration_min = calcDuration({ ...data, duration_min: fields.duration_min ?? 0 })
    }
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE study_records SET ${sets}, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM study_records WHERE id=?`).get(id) as any
    if (row) searchUpsert('record', id, row.content, row.content)
  })
  ipcMain.handle('records:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM study_records WHERE id=?`).run(id)
    searchDelete('record', id)
  })
  ipcMain.handle('records:day', (_e, date: string) => {
    return (db.prepare(`SELECT * FROM study_records WHERE date=? ORDER BY id`).all(date) as any[]).map(recordOut)
  })

  // 目标/路线节点关联的学习记录（含子树），连同对应感想一起返回
  const subtreeIds = (table: string, rootId: number): number[] => {
    const all = db.prepare(`SELECT id, parent_id FROM ${table}`).all() as any[]
    const ids = [rootId]
    let frontier = [rootId]
    while (frontier.length) {
      const next = all.filter(r => frontier.includes(r.parent_id)).map(r => r.id)
      ids.push(...next); frontier = next
    }
    return ids
  }
  const recordsFor = (table: string, col: string, rootId: number) => {
    const ids = subtreeIds(table, rootId)
    const ph = ids.map(() => '?').join(',')
    const records = (db.prepare(`SELECT * FROM study_records WHERE ${col} IN (${ph}) ORDER BY date DESC, id DESC`).all(...ids) as any[]).map(recordOut)
    const recIds = records.map(r => r.id)
    const reflections = recIds.length
      ? (db.prepare(`SELECT * FROM reflections WHERE record_id IN (${recIds.map(() => '?').join(',')}) ORDER BY date DESC`).all(...recIds) as any[]).map(reflOut)
      : []
    return { records, reflections }
  }
  // 只看「这个节点本身」的记录（不含子孙），用于「这个点 / 整条路线」的切换
  const recordsOfNode = (col: string, id: number) => {
    const records = (db.prepare(`SELECT * FROM study_records WHERE ${col}=? ORDER BY date DESC, id DESC`).all(id) as any[]).map(recordOut)
    const recIds = records.map(r => r.id)
    const reflections = recIds.length
      ? (db.prepare(`SELECT * FROM reflections WHERE record_id IN (${recIds.map(() => '?').join(',')}) ORDER BY date DESC`).all(...recIds) as any[]).map(reflOut)
      : []
    return { records, reflections }
  }
  ipcMain.handle('records:forGoal', (_e, goalId: number, opts: any = {}) =>
    opts.only ? recordsOfNode('goal_id', goalId) : recordsFor('goals', 'goal_id', goalId))
  ipcMain.handle('records:forNode', (_e, nodeId: number, opts: any = {}) =>
    opts.only ? recordsOfNode('route_node_id', nodeId) : recordsFor('route_nodes', 'route_node_id', nodeId))

  // 轻量摘要：只给「多少次 / 多久 / 多少条感想」（+ 量化数），不返回明细
  const summaryFor = (col: string, rootId: number) => {
    const ids = subtreeIds(col === 'goal_id' ? 'goals' : 'route_nodes', rootId)
    const ph = ids.map(() => '?').join(',')
    const s = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(duration_min),0) m, COALESCE(SUM(quantity),0) q
      FROM study_records WHERE ${col} IN (${ph})`).get(...ids) as any
    const rf = db.prepare(`SELECT COUNT(*) c FROM reflections rf JOIN study_records sr ON sr.id=rf.record_id
      WHERE sr.${col} IN (${ph})`).get(...ids) as any
    const own = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(duration_min),0) m FROM study_records WHERE ${col}=?`).get(rootId) as any
    return {
      count: Number(s?.c) || 0,
      minutes: Number(s?.m) || 0,
      quantity: Number(s?.q) || 0,
      refl: Number(rf?.c) || 0,
      own_count: Number(own?.c) || 0,
      own_minutes: Number(own?.m) || 0
    }
  }
  ipcMain.handle('records:summaryForGoal', (_e, goalId: number) => summaryFor('goal_id', goalId))
  ipcMain.handle('records:summaryForNode', (_e, nodeId: number) => summaryFor('route_node_id', nodeId))

  // ---------- 感想 ----------
  const reflOut = (r: any) => ({ ...r, tags: parseTags(r.tags) })
  ipcMain.handle('reflections:list', (_e, opts: any = {}, domain?: string) => {
    let rows: any[]
    let sql: string
    let params: any[] = []
    if (domain) {
      // 感想跟着它那条学习记录的域走
      sql = `SELECT rf.* FROM reflections rf
        LEFT JOIN study_records sr ON sr.id = rf.record_id
        WHERE (sr.domain = ? OR (rf.record_id IS NULL))`
      params = [domain]
    } else {
      sql = `SELECT * FROM reflections`
    }
    if (opts.order === 'random') {
      sql += ` ORDER BY RANDOM() LIMIT ?`
      params.push(opts.limit || 10)
    } else {
      sql += ` ORDER BY date DESC, id DESC${opts.limit ? ' LIMIT ' + Number(opts.limit) : ''}`
    }
    rows = (domain ? db.prepare(sql).all(...params) : db.prepare(sql).all()) as any[]
    return rows.map(reflOut)
  })
  ipcMain.handle('reflections:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO reflections(record_id,date,content,tags) VALUES(?,?,?,?)`)
      .run(data.record_id ?? null, data.date || today(), data.content || '', JSON.stringify(data.tags || []))
    const id = Number(r.lastInsertRowid)
    searchUpsert('reflection', id, data.content || '', data.content || '')
    return reflOut(db.prepare(`SELECT * FROM reflections WHERE id=?`).get(id))
  })
  ipcMain.handle('reflections:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM reflections WHERE id=?`).run(id); searchDelete('reflection', id)
  })
  ipcMain.handle('reflections:thatDay', () => {
    const md = today().slice(5) // MM-DD
    const records = (db.prepare(`SELECT * FROM study_records WHERE strftime('%m-%d', date)=? AND date < ? ORDER BY date DESC`).all(md, today()) as any[]).map(recordOut)
    const reflections = (db.prepare(`SELECT * FROM reflections WHERE strftime('%m-%d', date)=? AND date < ? ORDER BY date DESC`).all(md, today()) as any[]).map(reflOut)
    return { records, reflections }
  })

  // ---------- 便签（跟随学习/爱好域） ----------
  ipcMain.handle('notes:list', (_e, domain?: string) => {
    const rows = domain
      ? db.prepare(`SELECT * FROM sticky_notes WHERE domain=? ORDER BY updated_at DESC`).all(domain)
      : db.prepare(`SELECT * FROM sticky_notes ORDER BY updated_at DESC`).all()
    return rows
  })
  ipcMain.handle('notes:create', (_e, data: any) => {
    const x = data.x ?? 20, y = data.y ?? 20
    const r = db.prepare(`INSERT INTO sticky_notes(content,color,x,y,x2,y2,domain) VALUES(?,?,?,?,?,?,?)`)
      .run(data.content || '', data.color || '#E4EC81', x, y, data.x2 ?? x, data.y2 ?? y, data.domain || 'study')
    const id = Number(r.lastInsertRowid)
    searchUpsert('note', id, data.content || '', data.content || '')
    return db.prepare(`SELECT * FROM sticky_notes WHERE id=?`).get(id)
  })
  ipcMain.handle('notes:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['content', 'color', 'x', 'y', 'x2', 'y2', 'domain']) if (k in data) fields[k] = data[k]
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE sticky_notes SET ${sets}, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM sticky_notes WHERE id=?`).get(id) as any
    if (row) searchUpsert('note', id, row.content, row.content)
  })
  ipcMain.handle('notes:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM sticky_notes WHERE id=?`).run(id); searchDelete('note', id)
  })

  // ---------- 资料库 ----------
  const matOut = (r: any) => ({ ...r, tags: parseTags(r.tags) })
  ipcMain.handle('materials:list', (_e, type?: MaterialType, domain?: string) => {
    let rows: any[]
    if (type && domain) rows = db.prepare(`SELECT * FROM materials WHERE type=? AND domain=? ORDER BY id DESC`).all(type, domain) as any[]
    else if (type) rows = db.prepare(`SELECT * FROM materials WHERE type=? ORDER BY id DESC`).all(type) as any[]
    else if (domain) rows = db.prepare(`SELECT * FROM materials WHERE domain=? ORDER BY id DESC`).all(domain) as any[]
    else rows = db.prepare(`SELECT * FROM materials ORDER BY id DESC`).all() as any[]
    return rows.map(matOut)
  })
  ipcMain.handle('materials:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO materials(type,title,source,note,goal_id,route_node_id,domain,tags) VALUES(?,?,?,?,?,?,?,?)`)
      .run(data.type || 'web', data.title || '', data.source || '', data.note || '', data.goal_id ?? null, data.route_node_id ?? null, data.domain || 'study', JSON.stringify(data.tags || []))
    const id = Number(r.lastInsertRowid)
    searchUpsert('material', id, data.title || '', (data.note || '') + ' ' + (data.source || ''))
    return matOut(db.prepare(`SELECT * FROM materials WHERE id=?`).get(id))
  })
  ipcMain.handle('materials:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['type', 'title', 'source', 'note', 'goal_id', 'route_node_id', 'domain', 'tags']) if (k in data) fields[k] = k === 'tags' ? JSON.stringify(data[k]) : data[k]
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE materials SET ${sets} WHERE id=?`).run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM materials WHERE id=?`).get(id) as any
    if (row) searchUpsert('material', id, row.title, (row.note || '') + ' ' + (row.source || ''))
  })
  // 某个目标 / 路线节点关联的资料（含子树：目标包含子目标，路线包含子节点）
  ipcMain.handle('materials:forGoal', (_e, goalId: number) => {
    const ids = subtreeIds('goals', goalId)
    const ph = ids.map(() => '?').join(',')
    return (db.prepare(`SELECT * FROM materials WHERE goal_id IN (${ph}) ORDER BY id DESC`).all(...ids) as any[]).map(matOut)
  })
  ipcMain.handle('materials:forNode', (_e, nodeId: number) => {
    const ids = subtreeIds('route_nodes', nodeId)
    const ph = ids.map(() => '?').join(',')
    return (db.prepare(`SELECT * FROM materials WHERE route_node_id IN (${ph}) ORDER BY id DESC`).all(...ids) as any[]).map(matOut)
  })
  ipcMain.handle('materials:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM materials WHERE id=?`).run(id); searchDelete('material', id)
  })
  ipcMain.handle('materials:open', async (_e, id: number) => {
    const row = db.prepare(`SELECT * FROM materials WHERE id=?`).get(id) as any
    if (!row) return
    if (row.type === 'web' || row.type === 'video' || row.type === 'image') {
      if (/^https?:\/\//.test(row.source)) await shell.openExternal(row.source)
      else if (row.source) await shell.openPath(row.source)
    } else if (row.type === 'software') {
      // 软件类：只记录不启动，打开所在位置
      if (row.source && fs.existsSync(row.source)) shell.showItemInFolder(row.source)
      else dialog.showMessageBox({ type: 'info', message: '记录的路径不存在：\n' + row.source })
    } else {
      if (row.source && fs.existsSync(row.source)) await shell.openPath(row.source)
      else dialog.showMessageBox({ type: 'info', message: '文件不存在：\n' + row.source })
    }
  })

  // 直接把文件导入资料库（复制进 userData/files，成为应用内资产）
  ipcMain.handle('materials:importFile', async () => {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, {
      title: '导入资料文件',
      properties: ['openFile', 'multiSelections']
    })
    if (r.canceled || !r.filePaths.length) return null
    const dir = path.join(app.getPath('userData'), 'files')
    fs.mkdirSync(dir, { recursive: true })
    const created: any[] = []
    for (const src of r.filePaths) {
      const ext = path.extname(src)
      const dest = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`)
      fs.copyFileSync(src, dest)
      const type: MaterialType = ['.mp4', '.mkv', '.avi', '.webm'].includes(ext.toLowerCase()) ? 'video'
        : ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext.toLowerCase()) ? 'image' : 'file'
      const row = db.prepare(`INSERT INTO materials(type,title,source,note,tags) VALUES(?,?,?,?,?)`)
        .run(type, path.basename(src), dest, '', '[]')
      const id = Number(row.lastInsertRowid)
      searchUpsert('material', id, path.basename(src), dest)
      created.push(db.prepare(`SELECT * FROM materials WHERE id=?`).get(id))
    }
    return created
  })

  // ---------- 项目（跟随学习/爱好域） ----------
  ipcMain.handle('projects:list', (_e, domain?: string) => {
    const rows = domain
      ? db.prepare(`SELECT * FROM projects WHERE domain=? ORDER BY id DESC`).all(domain)
      : db.prepare(`SELECT * FROM projects ORDER BY id DESC`).all()
    return rows
  })
  ipcMain.handle('projects:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO projects(title,avatar,path,repo_url,description,status,domain) VALUES(?,?,?,?,?,?,?)`)
      .run(data.title || '未命名项目', data.avatar || '', data.path || '', data.repo_url || '', data.description || '', data.status || 'active', data.domain || 'study')
    const id = Number(r.lastInsertRowid)
    searchUpsert('project', id, data.title || '', data.description || '')
    return db.prepare(`SELECT * FROM projects WHERE id=?`).get(id)
  })
  ipcMain.handle('projects:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['title', 'avatar', 'path', 'repo_url', 'description', 'status', 'domain']) if (k in data) fields[k] = data[k]
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE projects SET ${sets} WHERE id=?`).run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM projects WHERE id=?`).get(id) as any
    if (row) searchUpsert('project', id, row.title, row.description)
  })
  ipcMain.handle('projects:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM projects WHERE id=?`).run(id); searchDelete('project', id)
  })

  // ---------- 想学清单 ----------
  ipcMain.handle('wishlist:list', (_e, domain?: string) => {
    const rows = domain
      ? db.prepare(`SELECT * FROM wishlist_items WHERE domain=? ORDER BY id DESC`).all(domain)
      : db.prepare(`SELECT * FROM wishlist_items ORDER BY id DESC`).all()
    return rows
  })
  ipcMain.handle('wishlist:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO wishlist_items(title,note,stage,domain) VALUES(?,?,?,?)`)
      .run(data.title || '', data.note || '', data.stage || 'sprout', data.domain || 'study')
    const id = Number(r.lastInsertRowid)
    searchUpsert('wishlist', id, data.title || '', data.note || '')
    return db.prepare(`SELECT * FROM wishlist_items WHERE id=?`).get(id)
  })
  ipcMain.handle('wishlist:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['title', 'note', 'stage', 'domain', 'converted_goal_id']) if (k in data) fields[k] = data[k]
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE wishlist_items SET ${sets} WHERE id=?`).run(...Object.values(fields), id)
    const row = db.prepare(`SELECT * FROM wishlist_items WHERE id=?`).get(id) as any
    if (row) searchUpsert('wishlist', id, row.title, row.note)
  })
  ipcMain.handle('wishlist:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM wishlist_items WHERE id=?`).run(id); searchDelete('wishlist', id)
  })
  ipcMain.handle('wishlist:convert', (_e, id: number) => {
    const item = db.prepare(`SELECT * FROM wishlist_items WHERE id=?`).get(id) as any
    if (!item) return 0
    const r = db.prepare(`INSERT INTO goals(title,description,status,domain) VALUES(?,?,?,?)`)
      .run(item.title, item.note || '', 'active', item.domain || 'study')
    const gid = Number(r.lastInsertRowid)
    db.prepare(`UPDATE wishlist_items SET stage='seedling', converted_goal_id=? WHERE id=?`).run(gid, id)
    searchUpsert('goal', gid, item.title, item.note || '')
    return gid
  })

  // ---------- 搜索 ----------
  ipcMain.handle('search', (_e, q: string) => {
    return searchQuery(q, {
      record: () => '/records',
      reflection: () => '/reflections',
      note: () => '/',
      material: () => '/library',
      project: () => '/projects',
      goal: () => '/goals',
      event: () => '/goals',
      route: () => '/routes',
      wishlist: () => '/wishlist'
    })
  })

  // ---------- 报表与导出 ----------
  ipcMain.handle('reports:summary', (_e, from: string, to: string, domain?: string): ReportSummary => {
    const d = domain ? ` AND r.domain='${domain}'` : ''
    const byDay = db.prepare(`SELECT date, COUNT(*) count, SUM(duration_min) minutes FROM study_records r
      WHERE date BETWEEN ? AND ?${d} GROUP BY date ORDER BY date`).all(from, to) as any[]
    const byGoal = db.prepare(`SELECT r.goal_id, COALESCE(g.title,'未关联') title, COUNT(*) count, SUM(r.duration_min) minutes
      FROM study_records r LEFT JOIN goals g ON g.id = r.goal_id
      WHERE r.date BETWEEN ? AND ?${d} GROUP BY r.goal_id ORDER BY minutes DESC`).all(from, to) as any[]
    const totals = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(duration_min),0) m FROM study_records r WHERE date BETWEEN ? AND ?${d}`).get(from, to) as any
    return {
      from, to,
      total_count: totals.c, total_minutes: totals.m,
      by_day: byDay.map(r => ({ date: r.date, count: r.count, minutes: r.minutes })),
      by_goal: byGoal
    }
  })

  const dumpAll = (domain?: string) => {
    const out: any = { exported_at: nowIso(), app: 'study-helper', domain: domain || 'all' }
    // 带域的表按域筛选（目标/路线/记录/资料/想学/便签/项目都分学习-爱好）；事件/音乐/设置跨域，原样导出
    out.goals = db.prepare(`SELECT * FROM goals${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.wishlist_items = db.prepare(`SELECT * FROM wishlist_items${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.materials = db.prepare(`SELECT * FROM materials${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.study_records = db.prepare(`SELECT * FROM study_records${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.route_nodes = db.prepare(`SELECT * FROM route_nodes${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.sticky_notes = db.prepare(`SELECT * FROM sticky_notes${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.projects = db.prepare(`SELECT * FROM projects${domain ? ` WHERE domain='${domain}'` : ''}`).all()
    out.reflections = domain
      ? db.prepare(`SELECT rf.* FROM reflections rf LEFT JOIN study_records sr ON sr.id=rf.record_id WHERE sr.domain=? OR rf.record_id IS NULL`).all(domain)
      : db.prepare(`SELECT * FROM reflections`).all()
    for (const t of ['events', 'bgm_tracks', 'settings'])
      out[t] = db.prepare(`SELECT * FROM ${t}`).all()
    return out
  }

  const toCsv = (rows: any[]): string => {
    if (!rows.length) return ''
    const keys = Object.keys(rows[0])
    const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    return '\ufeff' + keys.join(',') + '\n' + rows.map(r => keys.map(k => esc(r[k])).join(',')).join('\n')
  }

  const toMd = (from: string, to: string, domain?: string): string => {
    const d = domain ? ` AND domain='${domain}'` : ''
    const s = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(duration_min),0) m FROM study_records WHERE date BETWEEN ? AND ?${d}`).get(from, to) as any
    const goals = db.prepare(`SELECT r.goal_id, COALESCE(g.title,'未关联') title, COUNT(*) c, SUM(r.duration_min) m
      FROM study_records r LEFT JOIN goals g ON g.id=r.goal_id WHERE r.date BETWEEN ? AND ?${d} GROUP BY r.goal_id`).all(from, to) as any[]
    const lines: string[] = [`# Study Helper 报表 ${from} ~ ${to}${domain ? '（' + (domain === 'study' ? '学习' : '爱好') + '）' : ''}`, '',
      `- 记录条数：${s.c}`, `- 累计时长：${s.m} 分钟`, '', '## 按目标', '']
    for (const g of goals) lines.push(`- ${g.title}：${g.c} 条 / ${g.m} 分钟`)
    lines.push('', '## 记录明细', '')
    const recs = db.prepare(`SELECT * FROM study_records WHERE date BETWEEN ? AND ?${d} ORDER BY date`).all(from, to) as any[]
    for (const r of recs) lines.push(`- **${r.date}**（${r.duration_min} 分钟）${r.content}`)
    return lines.join('\n')
  }

  ipcMain.handle('reports:export', async (_e, kind: 'json' | 'csv' | 'md', domain?: string) => {
    if (!win) return null
    const ext = kind === 'json' ? 'json' : kind === 'csv' ? 'csv' : 'md'
    // 导出目录：应用目录下 exports/，不占 C 盘
    const exportDir = path.join(app.getPath('userData'), 'exports')
    try { fs.mkdirSync(exportDir, { recursive: true }) } catch {}
    const base = `study-helper-${today()}${domain ? '-' + domain : ''}`
    const r = await dialog.showSaveDialog(win, {
      title: '导出数据',
      defaultPath: path.join(exportDir, `${base}.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (r.canceled || !r.filePath) return null
    if (kind === 'json') {
      fs.writeFileSync(r.filePath, JSON.stringify(dumpAll(domain), null, 2), 'utf-8')
    } else {
      const from = today().slice(0, 4) + '-01-01'
      const to = today()
      if (kind === 'csv') {
        const d = domain ? ` AND domain='${domain}'` : ''
        const rows = db.prepare(`SELECT * FROM study_records WHERE date BETWEEN ? AND ?${d} ORDER BY date`).all(from, to)
        fs.writeFileSync(r.filePath, toCsv(rows.map(r => ({ ...r, tags: r.tags }))), 'utf-8')
      } else {
        fs.writeFileSync(r.filePath, toMd(from, to, domain), 'utf-8')
      }
    }
    return r.filePath
  })

  // ---------- BGM ----------
  const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']
  ipcMain.handle('bgm:setFolder', async () => {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { title: '选择音乐文件夹', properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const folder = r.filePaths[0]
    let added = 0
    const scan = (dir: string) => {
      let entries: fs.Dirent[] = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) scan(full)
        else if (AUDIO_EXT.includes(path.extname(e.name).toLowerCase())) {
          const info = db.prepare(`INSERT INTO bgm_tracks(path,title) VALUES(?,?) ON CONFLICT(path) DO NOTHING`)
            .run(full, path.basename(e.name, path.extname(e.name)))
          added += Number(info.changes)
        }
      }
    }
    scan(folder)
    setSetting('bgm_folder', folder)
    return { folder, added }
  })
  ipcMain.handle('bgm:list', () => db.prepare(`SELECT * FROM bgm_tracks ORDER BY title`).all())

  // ---------- 通用 shell ----------
  ipcMain.handle('shell:showItem', (_e, p: string) => {
    if (p && fs.existsSync(p)) shell.showItemInFolder(p)
    else dialog.showMessageBox({ type: 'info', message: '路径不存在：\n' + p })
  })
  ipcMain.handle('shell:openExternal', (_e, u: string) => {
    if (/^https?:\/\//.test(u)) shell.openExternal(u)
  })

  // ---------- 设置 / 弹窗 ----------
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: any) => setSetting(key, value))

  // 换主题时同步窗口底色（无边框窗口的窗控按钮已由渲染层自绘，
  // 这里只负责窗口背景色，避免切主题时边缘闪一下旧色）。
  ipcMain.handle('theme:chrome', (_e, id: string) => {
    if (!win || win.isDestroyed()) return
    const c = chromeFor(id)
    try { (win as any).setBackgroundColor?.(c.color) } catch { /* 旧版本无此 API，忽略 */ }
  })

  // ---------- 窗口控制（TitleBar 里自绘的三个按钮） ----------
  ipcMain.handle('win:minimize', () => {
    if (win && !win.isDestroyed()) win.minimize()
  })
  ipcMain.handle('win:toggleMaximize', () => {
    if (!win || win.isDestroyed()) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('win:close', () => {
    if (win && !win.isDestroyed()) win.close()
  })
  ipcMain.handle('win:isMaximized', () => !!(win && !win.isDestroyed() && win.isMaximized()))
  ipcMain.handle('dialog:pickFolder', async () => {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:pickFile', async (_e, filters?: any[]) => {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:backupNow', () => backupNow())
  ipcMain.handle('app:info', () => ({ dbPath: dbPath(), version: app.getVersion() }))

  // ---------- 热力图 ----------
  ipcMain.handle('heatmap', (_e, domain?: string) => {
    const d = domain ? ` AND domain='${domain}'` : ''
    const rows = db.prepare(`SELECT date, COUNT(*) count, SUM(duration_min) minutes FROM study_records
      WHERE date >= date('now','localtime','-364 days')${d} GROUP BY date`).all() as any[]
    return rows.map(r => ({ date: r.date, count: r.count, minutes: r.minutes }))
  })

  // ---------- 打卡（独立习惯清单） ----------
  const checkinOut = (r: any) => ({ ...r })
  ipcMain.handle('checkin:goals', (_e, domain?: string) => {
    const rows = domain
      ? db.prepare(`SELECT * FROM checkin_goals WHERE domain=? ORDER BY sort, id`).all(domain)
      : db.prepare(`SELECT * FROM checkin_goals ORDER BY sort, id`).all()
    return rows.map(checkinOut)
  })
  ipcMain.handle('checkin:create', (_e, data: any) => {
    const r = db.prepare(`INSERT INTO checkin_goals(title,note,domain,sort) VALUES(?,?,?,?)`)
      .run(data.title || '未命名习惯', data.note || '', data.domain || 'study', data.sort ?? 0)
    const id = Number(r.lastInsertRowid)
    return checkinOut(db.prepare(`SELECT * FROM checkin_goals WHERE id=?`).get(id))
  })
  ipcMain.handle('checkin:update', (_e, id: number, data: any) => {
    const fields: Record<string, any> = {}
    for (const k of ['title', 'note', 'domain', 'sort']) if (k in data) fields[k] = data[k]
    if (!Object.keys(fields).length) return
    const sets = Object.keys(fields).map(k => `${k}=?`).join(',')
    db.prepare(`UPDATE checkin_goals SET ${sets} WHERE id=?`).run(...Object.values(fields), id)
  })
  ipcMain.handle('checkin:remove', (_e, id: number) => {
    db.prepare(`DELETE FROM checkin_goals WHERE id=?`).run(id)
    db.prepare(`DELETE FROM checkin_logs WHERE goal_id=?`).run(id)
  })
  ipcMain.handle('checkin:toggle', (_e, goalId: number, date: string) => {
    const existing = db.prepare(`SELECT id FROM checkin_logs WHERE goal_id=? AND date=?`).get(goalId, date) as any
    if (existing) {
      db.prepare(`DELETE FROM checkin_logs WHERE id=?`).run(existing.id)
      return { checked: false }
    }
    db.prepare(`INSERT INTO checkin_logs(goal_id,date,note) VALUES(?,?,?)`).run(goalId, date, '')
    return { checked: true }
  })
  ipcMain.handle('checkin:logs', (_e, goalId: number, from?: string, to?: string) => {
    let rows: any[]
    if (from && to) rows = db.prepare(`SELECT * FROM checkin_logs WHERE goal_id=? AND date BETWEEN ? AND ? ORDER BY date`).all(goalId, from, to)
    else rows = db.prepare(`SELECT * FROM checkin_logs WHERE goal_id=? ORDER BY date`).all(goalId)
    return rows.map(checkinOut)
  })
  ipcMain.handle('checkin:stats', (_e, goalId: number) => {
    const all = db.prepare(`SELECT date FROM checkin_logs WHERE goal_id=? ORDER BY date`).all(goalId) as any[]
    const total = all.length
    const set = new Set(all.map(r => r.date))
    let lastDate: string | null = all.length ? all[all.length - 1].date : null
    // 连续天数：从今天（或昨天，若今天没打）往回数
    let d = new Date()
    const fmt = (x: Date) => x.toISOString().slice(0, 10)
    if (!set.has(fmt(d))) d.setDate(d.getDate() - 1)
    let streak = 0
    while (set.has(fmt(d))) { streak++; d.setDate(d.getDate() - 1) }
    return { total, streak, last_date: lastDate }
  })
}
