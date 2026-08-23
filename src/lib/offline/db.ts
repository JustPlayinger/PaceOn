/**
 * 离线数据层（纯前端离线 APK 核心）
 *
 * 用 sql.js（SQLite WASM）在浏览器内建库，与 Prisma schema 表结构一致，
 * 数据防抖持久化到 IndexedDB。桌面/服务端模式不受影响。
 */
// sql.js 采用动态 import，避免 Turbopack 客户端静态打包 CJS 模块失败
type Database = import('sql.js').Database
type SqlJsStatic = import('sql.js').SqlJsStatic
type BindParams = import('sql.js').BindParams

let SQL: SqlJsStatic | null = null
let db: Database | null = null
const DB_KEY = 'paceon-offline-db'

// ---------- 表结构（与 prisma/schema.prisma 一致，列名 camelCase） ----------

const DDL = `
CREATE TABLE IF NOT EXISTS Runner (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER, gender TEXT,
  weight REAL, height INTEGER, restingHr INTEGER, maxHr INTEGER, vo2max REAL,
  experience TEXT, targetRace TEXT, targetDate TEXT, targetTime TEXT,
  weeklyMileage INTEGER, notes TEXT, createdAt TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS TrainingWeek (
  id TEXT PRIMARY KEY, planId TEXT, weekStart TEXT, weekEnd TEXT, weekNumber INTEGER,
  phase TEXT, goal TEXT, summary TEXT, createdAt TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS TrainingPlan (
  id TEXT PRIMARY KEY, title TEXT, goal TEXT, targetRace TEXT,
  active INTEGER DEFAULT 1, startedAt TEXT, createdAt TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS TrainingSession (
  id TEXT PRIMARY KEY, weekId TEXT, date TEXT, dayOfWeek INTEGER, type TEXT,
  plannedDistance REAL, plannedDuration INTEGER, plannedPace TEXT, intensity TEXT,
  description TEXT, status TEXT DEFAULT 'pending', "order" INTEGER DEFAULT 0,
  createdAt TEXT, updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_session_week ON TrainingSession(weekId);
CREATE TABLE IF NOT EXISTS TrainingCompletion (
  id TEXT PRIMARY KEY, sessionId TEXT UNIQUE, distance REAL, duration INTEGER,
  avgPace TEXT, avgPaceSec INTEGER, avgHr INTEGER, maxHr INTEGER, elevation INTEGER,
  cadence INTEGER, calories INTEGER, weather TEXT, temperature REAL,
  rpe INTEGER, feeling INTEGER, feelingNote TEXT, imageDataUrl TEXT,
  rawExtract TEXT, notes TEXT, shoeId TEXT, createdAt TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS AIReview (
  id TEXT PRIMARY KEY, weekId TEXT, type TEXT, content TEXT,
  rating INTEGER, suggestions TEXT, createdAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_review_week ON AIReview(weekId);
CREATE TABLE IF NOT EXISTS Shoe (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, model TEXT,
  type TEXT DEFAULT 'daily', color TEXT, purchasedAt TEXT,
  lifespan INTEGER DEFAULT 800, retired INTEGER DEFAULT 0, notes TEXT,
  createdAt TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS ShoeUsage (
  id TEXT PRIMARY KEY, shoeId TEXT, completionId TEXT, distance REAL,
  date TEXT, note TEXT, createdAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_shoe_usage ON ShoeUsage(shoeId);
CREATE TABLE IF NOT EXISTS RecoveryLog (
  id TEXT PRIMARY KEY, date TEXT UNIQUE, sleepHours REAL, sleepQuality INTEGER,
  waterIntake REAL, nutrition INTEGER, muscleSoreness INTEGER, fatigue INTEGER,
  mood INTEGER, preRunFuel TEXT, duringFuel TEXT, postRunFuel TEXT,
  notes TEXT, createdAt TEXT, updatedAt TEXT
);
CREATE TABLE IF NOT EXISTS PersonalRecord (
  id TEXT PRIMARY KEY, distance TEXT UNIQUE, distanceKm REAL, timeSec INTEGER,
  date TEXT, location TEXT, raceName TEXT, paceSec INTEGER, notes TEXT,
  createdAt TEXT, updatedAt TEXT
);
`// ---------- IndexedDB 持久化 ----------

function idbGet(key: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('paceon', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('store')
      req.onsuccess = () => {
        const idb = req.result
        const tx = idb.transaction('store', 'readonly')
        const g = tx.objectStore('store').get(key)
        g.onsuccess = () => resolve(g.result instanceof Uint8Array ? g.result : null)
        g.onerror = () => resolve(null)
      }
      req.onerror = () => reject(req.error)
    } catch {
      resolve(null)
    }
  })
}

function idbSet(key: string, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('paceon', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('store')
      req.onsuccess = () => {
        const idb = req.result
        const tx = idb.transaction('store', 'readwrite')
        tx.objectStore('store').put(data, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    } catch {
      resolve()
    }
  })
}

// ---------- 初始化 ----------

/** 检查表是否存在 */
function tableExists(name: string): boolean {
  if (!db) return false
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name])
  return res.length > 0 && res[0].values.length > 0
}

/** 检查列是否存在 */
function columnExists(table: string, column: string): boolean {
  if (!db) return false
  const res = db.exec(`PRAGMA table_info(${table})`)
  if (!res.length) return false
  const cols = res[0].columns
  const nameIdx = cols.indexOf('name')
  return res[0].values.some((row) => row[nameIdx] === column)
}

/**
 * 旧版离线库升级（保证覆盖安装后旧数据保留且新功能可用）：
 *  1. 补建 TrainingPlan 表（旧库没有）
 *  2. TrainingWeek 补 planId 列（旧库没有）
 *  3. 确保至少存在一个「当前启用」计划，并把无归属的遗留周归入其中
 * 幂等：新库执行无副作用。
 */
function migrateSchema(): void {
  if (!db) return
  if (!tableExists('TrainingPlan')) {
    db.run('CREATE TABLE IF NOT EXISTS TrainingPlan (id TEXT PRIMARY KEY, title TEXT, goal TEXT, targetRace TEXT, active INTEGER DEFAULT 1, startedAt TEXT, createdAt TEXT, updatedAt TEXT)')
  }
  if (!columnExists('TrainingWeek', 'planId')) {
    db.run('ALTER TABLE TrainingWeek ADD COLUMN planId TEXT')
  }
  const planRows = all('SELECT * FROM TrainingPlan ORDER BY createdAt ASC')
  if (planRows.length === 0) {
    const now = nowIso()
    run('INSERT INTO TrainingPlan (id, title, goal, targetRace, active, startedAt, createdAt, updatedAt) VALUES (?,?,?,?,1,?,?,?)', [uid(), '我的训练计划', null, null, now, now, now])
  }
  const orphan = get('SELECT COUNT(*) AS c FROM TrainingWeek WHERE planId IS NULL') as { c: number } | null
  if (orphan && Number(orphan.c) > 0) {
    const activePlan = get('SELECT * FROM TrainingPlan WHERE active = 1 ORDER BY createdAt ASC LIMIT 1') || get('SELECT * FROM TrainingPlan ORDER BY createdAt ASC LIMIT 1')
    if (activePlan) run('UPDATE TrainingWeek SET planId = ? WHERE planId IS NULL', [activePlan.id])
  }
}

export async function initOfflineDb(): Promise<Database> {
  if (db) return db
  const initSqlJs = (await import('sql.js')).default
  SQL = await initSqlJs({
    locateFile: (f: string) => (f.endsWith('.wasm') ? '/sql-wasm.wasm' : '/' + f),
  })
  const saved = await idbGet(DB_KEY)
  if (saved && saved.length > 0) {
    db = new SQL.Database(saved)
  } else {
    db = new SQL.Database()
    db.run(DDL)
  }
  // 旧库升级（新建库幂等）；升级结果随 flushPersist 回写 IndexedDB
  migrateSchema()
  await flushPersist()
  return db
}

export function getDb(): Database {
  if (!db) throw new Error('离线数据库尚未初始化')
  return db
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

async function flushPersist(): Promise<void> {
  if (!db) return
  const data = db.export()
  await idbSet(DB_KEY, data)
}

/** 数据变更后防抖持久化 */
export function persist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    flushPersist().catch((e) => console.error('[offline-db] 持久化失败:', e))
  }, 400)
}

export async function exportDbBytes(): Promise<Uint8Array> {
  if (!db) throw new Error('离线数据库尚未初始化')
  return db.export()
}

export async function importDbBytes(bytes: Uint8Array): Promise<void> {
  if (!SQL) {
    const initSqlJs = (await import('sql.js')).default
    SQL = await initSqlJs({ locateFile: (f) => (f.endsWith('.wasm') ? '/sql-wasm.wasm' : '/' + f) })
  }
  db = new SQL.Database(bytes)
  await flushPersist()
}// ---------- 查询辅助 ----------

export function all<T = Record<string, unknown>>(sql: string, params: BindParams = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

export function get<T = Record<string, unknown>>(sql: string, params: BindParams = []): T | null {
  const rows = all<T>(sql, params)
  return rows[0] ?? null
}

/** 执行写操作并触发持久化 */
export function run(sql: string, params: BindParams = []): void {
  getDb().run(sql, params)
  persist()
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export function nowIso(): string {
  return new Date().toISOString()
}