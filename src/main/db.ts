// 数据层：node:sqlite（Electron 内置，含 FTS5）
import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

let db: DatabaseSync

export function dbPath(): string {
  return path.join(app.getPath('userData'), 'learning-hut.db')
}

export function openDb(): DatabaseSync {
  const file = dbPath()
  db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate()
  integrityCheck()
  maybeBackup()
  return db
}

function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    sort INTEGER DEFAULT 0,
    domain TEXT NOT NULL DEFAULT 'study',
    start_date TEXT DEFAULT '',   -- 起始时间（可空）
    due_date TEXT DEFAULT '',     -- 目标完成时间（可空，用于时间量化提醒）
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS route_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'todo',
    weight INTEGER DEFAULT 1,
    progress INTEGER DEFAULT 0,
    sort INTEGER DEFAULT 0,
    domain TEXT NOT NULL DEFAULT 'study',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS study_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    duration_min INTEGER DEFAULT 0,
    goal_id INTEGER,
    domain TEXT NOT NULL DEFAULT 'study',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS sticky_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    color TEXT DEFAULT '#E4EC81',
    x REAL DEFAULT 20,
    y REAL DEFAULT 20,
    -- 第二块板（随手记页）的坐标：内容共享，位置两块板各自独立
    x2 REAL,
    y2 REAL,
    domain TEXT NOT NULL DEFAULT 'study',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT DEFAULT '',
    note TEXT DEFAULT '',
    goal_id INTEGER,
    route_node_id INTEGER,
    domain TEXT NOT NULL DEFAULT 'study',
    tags TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    avatar TEXT DEFAULT '',
    path TEXT DEFAULT '',
    repo_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    domain TEXT NOT NULL DEFAULT 'study',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT DEFAULT '',
    stage TEXT DEFAULT 'sprout',
    domain TEXT NOT NULL DEFAULT 'study',
    converted_goal_id INTEGER,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    goal_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS bgm_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT UNIQUE NOT NULL,
    title TEXT
  );
  CREATE TABLE IF NOT EXISTS goal_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    delta REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS checkin_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    note TEXT DEFAULT '',
    domain TEXT NOT NULL DEFAULT 'study',
    sort INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS checkin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(goal_id, date)
  );
  `)

  // 增量迁移：新字段（ALTER 失败说明已存在，忽略）
  const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name)
  const addCol = (table: string, ddl: string) => { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`) } catch { /* 已存在 */ } }
  if (!cols('goals').includes('target_total')) addCol('goals', `target_total INTEGER DEFAULT 0`)
  if (!cols('goals').includes('target_unit')) addCol('goals', `target_unit TEXT DEFAULT ''`)
  if (!cols('study_records').includes('start_time')) addCol('study_records', `start_time TEXT DEFAULT ''`)
  if (!cols('study_records').includes('end_time')) addCol('study_records', `end_time TEXT DEFAULT ''`)
  if (!cols('study_records').includes('route_node_id')) addCol('study_records', `route_node_id INTEGER`)
  if (!cols('study_records').includes('quantity')) addCol('study_records', `quantity REAL DEFAULT 0`)
  if (!cols('route_nodes').includes('resources')) addCol('route_nodes', `resources TEXT DEFAULT '[]'`)
  // 学习/爱好两域分离（旧库自动归 study）
  if (!cols('goals').includes('domain')) addCol('goals', `domain TEXT NOT NULL DEFAULT 'study'`)
  if (!cols('study_records').includes('domain')) addCol('study_records', `domain TEXT NOT NULL DEFAULT 'study'`)
  if (!cols('wishlist_items').includes('domain')) addCol('wishlist_items', `domain TEXT NOT NULL DEFAULT 'study'`)
  if (!cols('materials').includes('domain')) addCol('materials', `domain TEXT NOT NULL DEFAULT 'study'`)
  if (!cols('route_nodes').includes('domain')) addCol('route_nodes', `domain TEXT NOT NULL DEFAULT 'study'`)
  if (!cols('sticky_notes').includes('domain')) addCol('sticky_notes', `domain TEXT NOT NULL DEFAULT 'study'`)
  if (!cols('projects').includes('domain')) addCol('projects', `domain TEXT NOT NULL DEFAULT 'study'`)
  // 目标的时间设置（起始 / 目标完成）
  if (!cols('goals').includes('start_date')) addCol('goals', `start_date TEXT DEFAULT ''`)
  if (!cols('goals').includes('due_date')) addCol('goals', `due_date TEXT DEFAULT ''`)
  // 资料可以挂在目标上，也可以挂在学习路线节点上
  if (!cols('materials').includes('route_node_id')) addCol('materials', `route_node_id INTEGER`)
  // 便签第二块板（随手记页）坐标：新增列时是 NULL，用老坐标回填，
  // 之后两块板各拖各的、互不影响（内容仍然共享）
  if (!cols('sticky_notes').includes('x2')) {
    addCol('sticky_notes', `x2 REAL`)
    addCol('sticky_notes', `y2 REAL`)
    try { db.exec(`UPDATE sticky_notes SET x2 = x, y2 = y WHERE x2 IS NULL`) } catch { /* 忽略 */ }
  }

  // 全文搜索：优先 trigram 分词，失败则用默认分词
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(kind UNINDEXED, ref_id UNINDEXED, title, content, tokenize="trigram")`)
  } catch {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(kind UNINDEXED, ref_id UNINDEXED, title, content)`)
  }

  migrateRouteResources()
}

// 一次性迁移：学习路线老的「关联资料」是存在 route_nodes.resources 里的 JSON，
// 现在资料统一进资料库（materials + route_node_id）。用 settings 打标记，只跑一次。
// 老的 JSON 列保留不动（不再被界面读取），万一需要仍可回溯。
function migrateRouteResources() {
  try {
    if (getSetting('migrated_route_res_materials')) return
    const nodes = db.prepare(`SELECT id, domain, resources FROM route_nodes`).all() as any[]
    for (const n of nodes) {
      let arr: any[] = []
      try { const a = JSON.parse(n.resources || '[]'); if (Array.isArray(a)) arr = a } catch { /* 忽略坏数据 */ }
      for (const r of arr) {
        const url = String(r?.url || '').trim()
        if (!url) continue
        const type = /^https?:\/\//i.test(url) ? 'web' : 'file'
        const title = String(r?.title || '').trim() || url
        const info = db.prepare(`INSERT INTO materials(type,title,source,note,goal_id,route_node_id,domain,tags) VALUES(?,?,?,?,?,?,?,?)`)
          .run(type, title, url, '', null, n.id, n.domain || 'study', '[]')
        searchUpsert('material', Number(info.lastInsertRowid), title, url)
      }
    }
    setSetting('migrated_route_res_materials', true)
  } catch (e) {
    console.error('[db] migrateRouteResources failed', e)
  }
}

function integrityCheck() {
  try {
    const r = db.prepare(`PRAGMA integrity_check`).get() as any
    const verdict = r?.integrity_check ?? r?.result
    if (verdict && verdict !== 'ok') console.error('[db] integrity_check:', verdict)
  } catch (e) {
    console.error('[db] integrity_check failed', e)
  }
}

function maybeBackup() {
  try {
    const dir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const last = getSetting('last_backup_at')
    const now = Date.now()
    if (last && now - Number(last) < 24 * 3600 * 1000) return
    const target = path.join(dir, `backup-${stampName()}.db`)
    db.exec(`VACUUM INTO '${target.replace(/\\/g, '/')}'`)
    // 只留最近 14 份（每份几十 KB，够回看了）
    const files = fs.readdirSync(dir).filter(f => f.startsWith('backup-')).sort()
    while (files.length > 14) {
      const old = files.shift()!
      try { fs.unlinkSync(path.join(dir, old)) } catch {}
    }
    setSetting('last_backup_at', String(now))
  } catch (e) {
    console.error('[db] backup failed', e)
  }
}

function stampName(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

export function backupNow(): string {
  const dir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, `backup-${stampName()}.db`)
  db.exec(`VACUUM INTO '${target.replace(/\\/g, '/')}'`)
  return target
}

// ---------- 通用助手 ----------
export function getSetting(key: string): any {
  const row = db.prepare(`SELECT value FROM settings WHERE key=?`).get(key) as any
  if (!row) return null
  try { return JSON.parse(row.value) } catch { return row.value }
}

export function setSetting(key: string, value: any) {
  db.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
    .run(key, JSON.stringify(value))
}

export function parseTags(raw: any): string[] {
  try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

// ---------- FTS ----------
export function searchUpsert(kind: string, refId: number, title: string, content: string) {
  searchDelete(kind, refId)
  db.prepare(`INSERT INTO search_index(kind,ref_id,title,content) VALUES(?,?,?,?)`)
    .run(kind, String(refId), title || '', content || '')
}

export function searchDelete(kind: string, refId: number) {
  db.prepare(`DELETE FROM search_index WHERE kind=? AND ref_id=?`).run(kind, String(refId))
}

export function searchQuery(q: string, routes: Record<string, (id: number) => string>): any[] {
  const query = q.trim()
  if (!query) return []
  let hits: any[] = []
  try {
    if (query.length >= 3) {
      // 注意：node:sqlite 的 .run() 只返回变更信息，取行必须用 .all()
      hits = db.prepare(`SELECT kind, ref_id, title, snippet(search_index, 3, '', '', '…', 12) AS snip
        FROM search_index WHERE search_index MATCH ? LIMIT 40`).all(`"${query.replace(/"/g, '""')}"`) as any[]
    } else {
      // 1~2 字回退 LIKE（本地小库无压力）。注意 snippet() 只能在 MATCH 查询里用，这里手动截取
      const like = `%${query}%`
      hits = db.prepare(`SELECT kind, ref_id, title, content
        FROM search_index WHERE content LIKE ? OR title LIKE ? LIMIT 40`).all(like, like) as any[]
      hits = hits.map(h => {
        const at = h.content ? h.content.indexOf(query) : -1
        return { ...h, snip: at >= 0 ? h.content.slice(Math.max(0, at - 10), at + 30) : '' }
      })
    }
  } catch (e) {
    console.error('[search] failed', e)
    return []
  }
  if (!Array.isArray(hits)) return []
  return hits.map(h => ({
    kind: h.kind,
    ref_id: Number(h.ref_id),
    title: h.title,
    snippet: h.snip || '',
    route: routes[h.kind] ? routes[h.kind](Number(h.ref_id)) : ''
  }))
}
