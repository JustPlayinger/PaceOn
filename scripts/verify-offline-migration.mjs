// 验证离线库升级迁移：模拟旧版 APK 的 IndexedDB 库（无 TrainingPlan / 无 planId 列）
// 升级后数据必须全部保留，且周自动归入默认周期。
import initSqlJs from 'sql.js'

const SQL = await initSqlJs({ locateFile: (f) => 'node_modules/sql.js/dist/' + f })
const db = new SQL.Database()

// ---- 旧版 schema（与旧 APK 完全一致） ----
db.run(`
CREATE TABLE Runner (id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER, gender TEXT, weight REAL, height INTEGER, restingHr INTEGER, maxHr INTEGER, vo2max REAL, experience TEXT, targetRace TEXT, targetDate TEXT, targetTime TEXT, weeklyMileage INTEGER, notes TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE TrainingWeek (id TEXT PRIMARY KEY, weekStart TEXT, weekEnd TEXT, weekNumber INTEGER, phase TEXT, goal TEXT, summary TEXT, createdAt TEXT, updatedAt TEXT);
CREATE TABLE TrainingSession (id TEXT PRIMARY KEY, weekId TEXT, date TEXT, dayOfWeek INTEGER, type TEXT, plannedDistance REAL, plannedDuration INTEGER, plannedPace TEXT, intensity TEXT, description TEXT, status TEXT DEFAULT 'pending', "order" INTEGER DEFAULT 0, createdAt TEXT, updatedAt TEXT);
CREATE TABLE TrainingCompletion (id TEXT PRIMARY KEY, sessionId TEXT UNIQUE, distance REAL, duration INTEGER, avgPace TEXT, avgPaceSec INTEGER, avgHr INTEGER, maxHr INTEGER, elevation INTEGER, cadence INTEGER, calories INTEGER, weather TEXT, temperature REAL, rpe INTEGER, feeling INTEGER, feelingNote TEXT, imageDataUrl TEXT, rawExtract TEXT, notes TEXT, shoeId TEXT, createdAt TEXT, updatedAt TEXT);
`)

// ---- 旧数据 ----
db.run(`INSERT INTO Runner (id, name, age, createdAt, updatedAt) VALUES ('r1', '老用户', 30, '2025-01-01', '2025-01-01')`)
db.run(`INSERT INTO TrainingWeek (id, weekStart, weekEnd, weekNumber, phase, goal, createdAt, updatedAt) VALUES ('w1', '2026-08-10T00:00:00.000Z', '2026-08-16T00:00:00.000Z', 1, 'base', '第 1 周', '2026-08-01', '2026-08-01')`)
db.run(`INSERT INTO TrainingWeek (id, weekStart, weekEnd, weekNumber, phase, goal, createdAt, updatedAt) VALUES ('w2', '2026-08-17T00:00:00.000Z', '2026-08-23T00:00:00.000Z', 2, 'build', '第 2 周', '2026-08-08', '2026-08-08')`)
db.run(`INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, "order", createdAt, updatedAt) VALUES ('s1', 'w1', '2026-08-10', 1, 'easy', 8, 0, '2026-08-01', '2026-08-01')`)
db.run(`INSERT INTO TrainingCompletion (id, sessionId, distance, duration, avgPace, createdAt, updatedAt) VALUES ('c1', 's1', 8.2, 3000, '5:40/km', '2026-08-11', '2026-08-11')`)

// ---- 新版 migrateSchema 逻辑（与 src/lib/offline/db.ts 一致） ----
const nowIso = () => new Date().toISOString()
const uid = () => 'id-' + Date.now().toString(36)

function tableExists(name) {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name])
  return res.length > 0 && res[0].values.length > 0
}
function columnExists(table, column) {
  const res = db.exec(`PRAGMA table_info(${table})`)
  if (!res.length) return false
  const cols = res[0].columns
  const nameIdx = cols.indexOf('name')
  return res[0].values.some((row) => row[nameIdx] === column)
}
function all(sql, params) {
  const stmt = db.prepare(sql)
  stmt.bind(params || [])
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}
function get(sql, params) {
  return all(sql, params)[0] || null
}

function migrateSchema() {
  if (!tableExists('TrainingPlan')) {
    db.run('CREATE TABLE IF NOT EXISTS TrainingPlan (id TEXT PRIMARY KEY, title TEXT, goal TEXT, targetRace TEXT, active INTEGER DEFAULT 1, startedAt TEXT, createdAt TEXT, updatedAt TEXT)')
  }
  if (!columnExists('TrainingWeek', 'planId')) {
    db.run('ALTER TABLE TrainingWeek ADD COLUMN planId TEXT')
  }
  const planRows = all('SELECT * FROM TrainingPlan ORDER BY createdAt ASC')
  if (planRows.length === 0) {
    const now = nowIso()
    db.run('INSERT INTO TrainingPlan (id, title, goal, targetRace, active, startedAt, createdAt, updatedAt) VALUES (?,?,?,?,1,?,?,?)', [uid(), '我的训练计划', null, null, now, now, now])
  }
  const orphan = get('SELECT COUNT(*) AS c FROM TrainingWeek WHERE planId IS NULL')
  if (orphan && Number(orphan.c) > 0) {
    const activePlan = get('SELECT * FROM TrainingPlan WHERE active = 1 ORDER BY createdAt ASC LIMIT 1') || get('SELECT * FROM TrainingPlan ORDER BY createdAt ASC LIMIT 1')
    if (activePlan) db.run('UPDATE TrainingWeek SET planId = ? WHERE planId IS NULL', [activePlan.id])
  }
}

// ---- 执行迁移 ----
migrateSchema()

// ---- 断言 ----
const runner = get('SELECT * FROM Runner WHERE id = ?', ['r1'])
const weeks = all('SELECT * FROM TrainingWeek ORDER BY weekStart ASC')
const sessions = all('SELECT * FROM TrainingSession')
const completions = all('SELECT * FROM TrainingCompletion')
const plans = all('SELECT * FROM TrainingPlan')
const weekPlanIds = weeks.map((w) => w.planId)

const fail = (msg) => { console.log('❌ ' + msg); process.exitCode = 1 }
if (!tableExists('TrainingPlan')) fail('TrainingPlan 表不存在')
else if (!columnExists('TrainingWeek', 'planId')) fail('planId 列不存在')
else if (!runner || runner.name !== '老用户') fail('Runner 数据丢失')
else if (weeks.length !== 2) fail('训练周数据丢失')
else if (sessions.length !== 1) fail('训练课数据丢失')
else if (completions.length !== 1 || completions[0].distance !== 8.2) fail('完成记录数据丢失')
else if (plans.length !== 1 || Number(plans[0].active) !== 1) fail('默认周期未正确创建')
else if (weekPlanIds.some((p) => p !== plans[0].id)) fail('训练周未归入默认周期')

if (process.exitCode) {
  console.log(JSON.stringify({ runner, weeks, sessions, completions, plans }, null, 2))
} else {
  console.log('✅ 离线迁移验证通过：旧数据全部保留，2 个训练周已归入默认周期（active=1），schema 已升级')
}
