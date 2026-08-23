/**
 * 离线 API - 核心 CRUD handler（runner / weeks / sessions / shoes / recovery / records / templates / seed）
 */
import { all, get, run, uid, nowIso } from '../db'
import type { ApiRequest, Handler } from '../types'
import { TRAINING_TEMPLATES } from '@/lib/templates'

function sessionsOf(weekId: string): Record<string, unknown>[] {
  return all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [weekId]).map((s) => ({ ...s, completion: getCompletion(s.id as string) }))
}

function getCompletion(sessionId: string): Record<string, unknown> | null {
  const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [sessionId])
  return c || null
}

function weeksAll(): Record<string, unknown>[] {
  return all('SELECT * FROM TrainingWeek ORDER BY weekStart DESC').map((w) => ({ ...w, sessions: sessionsOf(w.id as string) }))
}

export function weekFull(id: string): Record<string, unknown> | null {
  const w = get('SELECT * FROM TrainingWeek WHERE id = ?', [id])
  if (!w) return null
  return { ...w, sessions: sessionsOf(id), reviews: all('SELECT * FROM AIReview WHERE weekId = ? ORDER BY createdAt DESC', [id]) }
}

/** 删除一个训练周（含其训练课、完成记录、点评） */
function deleteWeek(id: string): void {
  run('DELETE FROM TrainingCompletion WHERE sessionId IN (SELECT id FROM TrainingSession WHERE weekId = ?)', [id])
  run('DELETE FROM TrainingSession WHERE weekId = ?', [id])
  run('DELETE FROM AIReview WHERE weekId = ?', [id])
  run('DELETE FROM TrainingWeek WHERE id = ?', [id])
}

// ---------- 训练周期（计划）辅助 ----------

export function thisMondayOf(): Date {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(today.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function nextMondayOf(): Date {
  const today = new Date()
  const day = today.getDay()
  const nextMonday = new Date(today)
  const diff = day === 0 ? 1 : 8 - day
  nextMonday.setDate(today.getDate() + diff)
  nextMonday.setHours(0, 0, 0, 0)
  return nextMonday
}

/** 按「周一日期」查找已存在的训练周（防重复创建的关键） */
export function findWeekStartingOn(nextMonday: Date): Record<string, unknown> | null {
  const start = new Date(nextMonday)
  const end = new Date(start.getTime() + 86400000)
  const rows = all('SELECT * FROM TrainingWeek WHERE weekStart >= ? AND weekStart < ? ORDER BY createdAt ASC LIMIT 1', [start.toISOString(), end.toISOString()])
  return rows[0] || null
}

/** 获取当前启用计划；若不存在则把其它计划置为非启用后新建（全局仅一个 active=true） */
export function getOrCreateActivePlan(): Record<string, unknown> {
  const existing = get('SELECT * FROM TrainingPlan WHERE active = 1 ORDER BY createdAt ASC LIMIT 1')
  if (existing) return existing
  run('UPDATE TrainingPlan SET active = 0 WHERE active = 1')
  const now = nowIso()
  run('INSERT INTO TrainingPlan (id, title, goal, targetRace, active, startedAt, createdAt, updatedAt) VALUES (?,?,?,?,1,?,?,?)', [uid(), '我的训练计划', null, null, now, now, now])
  return get('SELECT * FROM TrainingPlan WHERE active = 1 ORDER BY createdAt ASC LIMIT 1')!
}

function runnerProfile(): Record<string, unknown> | null {
  return get('SELECT * FROM Runner LIMIT 1') || null
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

function methodErr(m: string): Response {
  return json({ error: `Method ${m} not allowed` }, 405)
}

const runnerHandler: Handler = async (req) => {
  if (req.method === 'GET') return json({ runner: runnerProfile() })
  if (req.method === 'POST') {
    const b = req.body || {}

const existing = runnerProfile()
    const now = nowIso()
    const vals = [b.name ?? '跑者', b.age ?? null, b.gender ?? null, b.weight ?? null, b.height ?? null, b.restingHr ?? null, b.maxHr ?? null, b.vo2max ?? null, b.experience ?? null, b.targetRace ?? null, b.targetDate ?? null, b.targetTime ?? null, b.weeklyMileage ?? null, b.notes ?? null]
    if (existing) run('UPDATE Runner SET name=?, age=?, gender=?, weight=?, height=?, restingHr=?, maxHr=?, vo2max=?, experience=?, targetRace=?, targetDate=?, targetTime=?, weeklyMileage=?, notes=?, updatedAt=? WHERE id=?', [...vals, now, existing.id])
    else run('INSERT INTO Runner (id, name, age, gender, weight, height, restingHr, maxHr, vo2max, experience, targetRace, targetDate, targetTime, weeklyMileage, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), ...vals, now, now])
    return json({ runner: runnerProfile() })
  }
  return methodErr(req.method)
}

const weeksHandler: Handler = async (req) => {
  if (req.method === 'GET') {
    const weeks = weeksAll()
    if (req.query.get('current') === 'true' && weeks.length > 0) {
      const monday = thisMondayOf()

      // 优先返回「当前启用计划」中的当前周 / 最近一周
      const activePlan = get('SELECT * FROM TrainingPlan WHERE active = 1 LIMIT 1')
      if (activePlan) {
        const planWeeks = weeks.filter((w) => w.planId === activePlan.id)
        if (planWeeks.length > 0) {
          const planCurrentWeek = planWeeks.find((w) => { const ws = new Date(w.weekStart as string); ws.setHours(0, 0, 0, 0); return ws.getTime() === monday.getTime() })
          if (planCurrentWeek) return json({ week: planCurrentWeek })
          return json({ week: planWeeks[0] })
        }
      }

      const currentWeek = weeks.find((w) => { const ws = new Date(w.weekStart as string); ws.setHours(0, 0, 0, 0); return ws.getTime() === monday.getTime() })
      return json({ week: currentWeek || weeks[0] })
    }
    return json({ weeks })
  }
  if (req.method === 'POST') {
    const b = req.body || {}
    const weekStart = new Date(b.weekStart)

    // 防重复：同一起始周一已有课表则直接复用
    const existing = findWeekStartingOn(weekStart)
    if (existing) return json({ week: weekFull(existing.id as string), reused: true })

    const weekEnd = new Date(b.weekEnd || new Date(weekStart.getTime() + 6 * 86400000))
    const id = uid()
    const now = nowIso()
    const plan = getOrCreateActivePlan()
    run('INSERT INTO TrainingWeek (id, planId, weekStart, weekEnd, weekNumber, phase, goal, summary, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, plan.id, weekStart.toISOString(), weekEnd.toISOString(), b.weekNumber ?? null, b.phase ?? null, b.goal ?? null, b.summary ?? null, now, now])
    if (Array.isArray(b.sessions)) {
      b.sessions.forEach((s: { dayOfWeek: number; type: string; plannedDistance?: number | null; plannedDuration?: number | null; plannedPace?: string | null; intensity?: string | null; description?: string }, idx: number) => {
        const date = new Date(weekStart)
        date.setDate(weekStart.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
        run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), id, date.toISOString(), s.dayOfWeek, s.type, s.plannedDistance ?? null, s.plannedDuration ?? null, s.plannedPace ?? null, s.intensity ?? null, s.description ?? '', 'pending', idx, now, now])
      })
    }
    return json({ week: weekFull(id) })
  }
  return methodErr(req.method)
}

const weekDetailHandler: Handler = async (req) => {
  const id = req.params.id
  if (req.method === 'GET') {
    const week = weekFull(id)
    if (!week) return json({ error: 'Not found' }, 404)
    return json({ week })
  }
  if (req.method === 'PATCH') {
    const b = req.body || {}
    run('UPDATE TrainingWeek SET goal=?, phase=?, summary=?, weekNumber=?, updatedAt=? WHERE id=?', [b.goal ?? null, b.phase ?? null, b.summary ?? null, b.weekNumber ?? null, nowIso(), id])
    return json({ week: weekFull(id) })
  }
  if (req.method === 'DELETE') {
    deleteWeek(id)
    return json({ success: true })
  }
  return methodErr(req.method)
}

const weekReviewsHandler: Handler = async (req) => {
  const id = req.params.id
  return json({ reviews: all('SELECT * FROM AIReview WHERE weekId = ? ORDER BY createdAt DESC', [id]) })
}

const sessionsListHandler: Handler = async (req) => {
  if (req.method === 'GET') {
    const weekId = req.query.get('weekId')
    const rows = weekId ? all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [weekId]) : all('SELECT * FROM TrainingSession ORDER BY date DESC')
    return json({ sessions: rows.map((s) => ({ ...s, completion: getCompletion(s.id as string) })) })
  }
  if (req.method === 'POST') {
    const b = req.body || {}

const id = uid()
    const now = nowIso()
    const weekId = b.weekId || null
    const date = b.date ? new Date(b.date).toISOString() : now
    run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, weekId, date, b.dayOfWeek ?? 1, b.type ?? 'easy', b.plannedDistance ?? null, b.plannedDuration ?? null, b.plannedPace ?? null, b.intensity ?? null, b.description ?? '', b.status ?? 'pending', b.order ?? 0, now, now])
    return json({ session: { ...get('SELECT * FROM TrainingSession WHERE id = ?', [id]), completion: null } })
  }
  return methodErr(req.method)
}

const sessionDetailHandler: Handler = async (req) => {
  const id = req.params.id
  const session = get('SELECT * FROM TrainingSession WHERE id = ?', [id])
  if (!session) return json({ error: 'Not found' }, 404)
  const completion = getCompletion(id)
  if (req.method === 'GET') return json({ session: { ...session, completion } })
  if (req.method === 'PATCH') {
    const b = req.body || {}
    run('UPDATE TrainingSession SET date=?, dayOfWeek=?, type=?, plannedDistance=?, plannedDuration=?, plannedPace=?, intensity=?, description=?, status=?, "order"=?, updatedAt=? WHERE id=?', [b.date ? new Date(b.date).toISOString() : session.date, b.dayOfWeek ?? session.dayOfWeek, b.type ?? session.type, b.plannedDistance ?? session.plannedDistance, b.plannedDuration ?? session.plannedDuration, b.plannedPace ?? session.plannedPace, b.intensity ?? session.intensity, b.description ?? session.description, b.status ?? session.status, b.order ?? session.order, nowIso(), id])
    return json({ session: { ...get('SELECT * FROM TrainingSession WHERE id = ?', [id]), completion } })
  }
  if (req.method === 'DELETE') {
    run('DELETE FROM TrainingCompletion WHERE sessionId = ?', [id])
    run('DELETE FROM TrainingSession WHERE id = ?', [id])
    return json({ success: true })
  }
  return methodErr(req.method)
}

const sessionCompleteHandler: Handler = async (req) => {
  if (req.method !== 'POST') return methodErr(req.method)
  const sessionId = req.params.id
  if (!get('SELECT * FROM TrainingSession WHERE id = ?', [sessionId])) return json({ error: 'Session not found' }, 404)
  const b = req.body || {}

const existing = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [sessionId])
  const now = nowIso()
  const compId = existing?.id || uid()
  const data = [compId, sessionId, b.distance ?? null, b.duration ?? null, b.avgPace ?? null, b.avgPaceSec ?? null, b.avgHr ?? null, b.maxHr ?? null, b.elevation ?? null, b.cadence ?? null, b.calories ?? null, b.weather ?? null, b.temperature ?? null, b.rpe ?? null, b.feeling ?? null, b.feelingNote ?? null, b.imageDataUrl ?? null, b.rawExtract ?? null, b.notes ?? null, b.shoeId ?? null, now, now]
  if (existing) run('UPDATE TrainingCompletion SET sessionId=?, distance=?, duration=?, avgPace=?, avgPaceSec=?, avgHr=?, maxHr=?, elevation=?, cadence=?, calories=?, weather=?, temperature=?, rpe=?, feeling=?, feelingNote=?, imageDataUrl=?, rawExtract=?, notes=?, shoeId=?, updatedAt=? WHERE id=?', [...data.slice(1), now, compId])
  else run('INSERT INTO TrainingCompletion (id, sessionId, distance, duration, avgPace, avgPaceSec, avgHr, maxHr, elevation, cadence, calories, weather, temperature, rpe, feeling, feelingNote, imageDataUrl, rawExtract, notes, shoeId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', data)
  run('UPDATE TrainingSession SET status = ?, updatedAt = ? WHERE id = ?', [b.status ?? 'completed', now, sessionId])
  if (b.shoeId && b.distance) {
    const shoe = get('SELECT * FROM Shoe WHERE id = ?', [b.shoeId])
    if (shoe) run('UPDATE Shoe SET totalDistance = ?, updatedAt = ? WHERE id = ?', [((shoe.totalDistance as number) || 0) + (b.distance as number), now, b.shoeId])
  }
  return json({ completion: getCompletion(sessionId) })
}

const shoesHandler: Handler = async (req) => {
  if (req.method === 'GET') return json({ shoes: all('SELECT * FROM Shoe ORDER BY createdAt DESC') })
  if (req.method === 'POST') {
    const b = req.body || {}

const id = uid()
    const now = nowIso()
    run('INSERT INTO Shoe (id, name, brand, model, type, color, purchasedAt, lifespan, retired, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id, b.name || '未命名跑鞋', b.brand ?? null, b.model ?? null, b.type ?? 'daily', b.color ?? null, b.purchasedAt ?? now, b.lifespan ?? 800, b.retired ? 1 : 0, b.notes ?? null, now, now])
    return json({ shoe: get('SELECT * FROM Shoe WHERE id = ?', [id]) })
  }
  return methodErr(req.method)
}

const shoeDetailHandler: Handler = async (req) => {
  const id = req.params.id
  const shoe = get('SELECT * FROM Shoe WHERE id = ?', [id])
  if (!shoe) return json({ error: 'Not found' }, 404)
  if (req.method === 'PATCH') {
    const b = req.body || {}
    run('UPDATE Shoe SET name=?, brand=?, model=?, type=?, color=?, purchasedAt=?, lifespan=?, retired=?, notes=?, updatedAt=? WHERE id=?', [b.name ?? shoe.name, b.brand ?? shoe.brand, b.model ?? shoe.model, b.type ?? shoe.type, b.color ?? shoe.color, b.purchasedAt ?? shoe.purchasedAt, b.lifespan ?? shoe.lifespan, b.retired ? 1 : 0, b.notes ?? shoe.notes, nowIso(), id])
    return json({ shoe: get('SELECT * FROM Shoe WHERE id = ?', [id]) })
  }
  if (req.method === 'DELETE') {
    run('DELETE FROM ShoeUsage WHERE shoeId = ?', [id])
    run('DELETE FROM Shoe WHERE id = ?', [id])
    return json({ success: true })
  }
  return methodErr(req.method)
}

const recoveryHandler: Handler = async (req) => {
  if (req.method === 'GET') return json({ logs: all('SELECT * FROM RecoveryLog ORDER BY date DESC') })
  if (req.method === 'POST') {
    const b = req.body || {}

const date = b.date || new Date().toISOString().slice(0, 10)
    const now = nowIso()
    const existing = get('SELECT * FROM RecoveryLog WHERE date = ?', [date])
    const data = [b.sleepHours ?? null, b.sleepQuality ?? null, b.waterIntake ?? null, b.nutrition ?? null, b.muscleSoreness ?? null, b.fatigue ?? null, b.mood ?? null, b.preRunFuel ?? null, b.duringFuel ?? null, b.postRunFuel ?? null, b.notes ?? null, now]
    if (existing) run('UPDATE RecoveryLog SET sleepHours=?, sleepQuality=?, waterIntake=?, nutrition=?, muscleSoreness=?, fatigue=?, mood=?, preRunFuel=?, duringFuel=?, postRunFuel=?, notes=?, updatedAt=? WHERE id=?', [...data, existing.id])
    else { const id = uid(); run('INSERT INTO RecoveryLog (id, date, sleepHours, sleepQuality, waterIntake, nutrition, muscleSoreness, fatigue, mood, preRunFuel, duringFuel, postRunFuel, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id, date, ...data, now]) }
    return json({ log: get('SELECT * FROM RecoveryLog WHERE date = ?', [date]) })
  }
  return methodErr(req.method)
}

const recordsHandler: Handler = async (req) => {
  if (req.method === 'GET') return json({ records: all('SELECT * FROM PersonalRecord ORDER BY distanceKm ASC') })
  if (req.method === 'POST') {
    const b = req.body || {}

const id = uid()
    const now = nowIso()
    run('INSERT INTO PersonalRecord (id, distance, distanceKm, timeSec, date, location, raceName, paceSec, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id, b.distance, b.distanceKm, b.timeSec, b.date ? new Date(b.date).toISOString() : now, b.location ?? null, b.raceName ?? null, b.paceSec ?? null, b.notes ?? null, now, now])
    return json({ record: get('SELECT * FROM PersonalRecord WHERE id = ?', [id]) })
  }
  return methodErr(req.method)
}

const templatesHandler: Handler = async () => json({ templates: TRAINING_TEMPLATES })

const templatesApplyHandler: Handler = async (req) => {
  const { templateId } = (req.body || {}) as { templateId?: string }

const template = TRAINING_TEMPLATES.find((t) => t.id === templateId)
  if (!template) return json({ error: '模板不存在' }, 404)
  if (!runnerProfile()) return json({ error: '请先在跑者档案中填写信息' }, 400)
  const nextMonday = nextMondayOf()

  // 防重复：下周课表已存在则直接复用
  const existing = findWeekStartingOn(nextMonday)
  if (existing) return json({ week: weekFull(existing.id as string), template, reused: true })

  const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)
  const plan = getOrCreateActivePlan()
  const maxNum = get('SELECT MAX(weekNumber) AS m FROM TrainingWeek WHERE planId = ?', [plan.id]) as { m: number | null } | null
  const wNum = ((maxNum?.m as number) || 0) + 1
  const id = uid()
  const now = nowIso()
  run('INSERT INTO TrainingWeek (id, planId, weekStart, weekEnd, weekNumber, phase, goal, summary, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, plan.id, nextMonday.toISOString(), nextSunday.toISOString(), wNum, template.sampleWeek.phase, template.sampleWeek.weekGoal, `基于模板「${template.name}」生成。${template.description}`, now, now])
  template.sampleWeek.sessions.forEach((s, idx) => {
    const date = new Date(nextMonday)
    date.setDate(nextMonday.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
    run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), id, date.toISOString(), s.dayOfWeek, s.type, s.plannedDistance, s.plannedDuration, s.plannedPace, s.intensity, s.description, 'pending', idx, now, now])
  })
  return json({ week: weekFull(id), template })
}

const seedHandler: Handler = async () => {
  if (runnerProfile()) return json({ ok: true, seeded: false })
  const now = nowIso()
  run('INSERT INTO Runner (id, name, age, gender, weight, height, restingHr, maxHr, vo2max, experience, targetRace, targetDate, targetTime, weeklyMileage, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), '跑者', 28, 'male', 65, 175, 58, 190, 50, 'intermediate', '半马', null, '1:45:00', 40, null, now, now])
  const weekId = uid()
  const monday = thisMondayOf()
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const plan = getOrCreateActivePlan()
  run('INSERT INTO TrainingWeek (id, planId, weekStart, weekEnd, weekNumber, phase, goal, summary, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [weekId, plan.id, monday.toISOString(), sunday.toISOString(), 1, 'base', '建立有氧基础，周跑量 40km', '基础期第 1 周', now, now])
  const seedSessions = [
    { dayOfWeek: 1, type: 'easy', d: 8, dur: 50, pace: '6:00/km', z: 'Z2', desc: '轻松跑 8km，注意呼吸与放松。' },
    { dayOfWeek: 2, type: 'rest', d: null, dur: null, pace: null, z: 'rest', desc: '休息日，可拉伸或进行低强度活动。' },
    { dayOfWeek: 3, type: 'tempo', d: 12, dur: 72, pace: '5:30/km', z: 'Z3', desc: '节奏跑 12km，前后各 2km 热身/冷身。' },
    { dayOfWeek: 4, type: 'easy', d: 6, dur: 38, pace: '6:20/km', z: 'Z2', desc: '恢复跑 6km，保持轻松配速。' },
    { dayOfWeek: 5, type: 'rest', d: null, dur: null, pace: null, z: 'rest', desc: '休息日，可做柔韧性训练。' },
    { dayOfWeek: 6, type: 'long', d: 16, dur: 100, pace: '5:45/km', z: 'Z2', desc: '长跑 16km，保持稳定节奏。' },
    { dayOfWeek: 0, type: 'recovery', d: 5, dur: 32, pace: '6:40/km', z: 'Z1', desc: '恢复跑 5km，轻松完成。' },
  ]
  seedSessions.forEach((s, idx) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
    run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), weekId, date.toISOString(), s.dayOfWeek, s.type, s.d, s.dur, s.pace, s.z, s.desc, 'pending', idx, now, now])
  })
  return json({ ok: true, seeded: true })
}

const plansHandler: Handler = async (req) => {
  if (req.method === 'GET') {
    // 兜底迁移：无周期但有训练周时，自动创建默认周期并把遗留周归入
    const weekCount = get('SELECT COUNT(*) AS c FROM TrainingWeek') as { c: number }
    const planCount = get('SELECT COUNT(*) AS c FROM TrainingPlan') as { c: number }
    if (Number(weekCount.c) > 0 && Number(planCount.c) === 0) {
      const plan = getOrCreateActivePlan()
      run('UPDATE TrainingWeek SET planId = ? WHERE planId IS NULL', [plan.id])
    }
    const plans = all('SELECT * FROM TrainingPlan ORDER BY createdAt ASC').map((p) => ({
      ...p,
      active: Boolean(p.active),
      weeks: all('SELECT * FROM TrainingWeek WHERE planId = ? ORDER BY weekStart ASC', [p.id]).map((w) => weekFull(w.id as string)),
    }))
    return json({ plans })
  }
  if (req.method === 'POST') {
    const b = req.body || {}
    run('UPDATE TrainingPlan SET active = 0 WHERE active = 1')
    const now = nowIso()
    const id = uid()
    run('INSERT INTO TrainingPlan (id, title, goal, targetRace, active, startedAt, createdAt, updatedAt) VALUES (?,?,?,?,1,?,?,?)', [id, b.title || '我的训练计划', b.goal ?? null, b.targetRace ?? null, now, now, now])
    return json({ plan: get('SELECT * FROM TrainingPlan WHERE id = ?', [id]) })
  }
  return methodErr(req.method)
}

const planDetailHandler: Handler = async (req) => {
  const id = req.params.id
  if (req.method === 'PATCH') {
    const b = req.body || {}
    if (b.active === true) {
      run('UPDATE TrainingPlan SET active = 0 WHERE active = 1')
      run('UPDATE TrainingPlan SET active = 1, updatedAt = ? WHERE id = ?', [nowIso(), id])
    } else if (b.title) {
      run('UPDATE TrainingPlan SET title = ?, updatedAt = ? WHERE id = ?', [String(b.title), nowIso(), id])
    }
    const plan = get('SELECT * FROM TrainingPlan WHERE id = ?', [id])
    return json({ plan: plan ? { ...plan, active: Boolean(plan.active) } : null })
  }
  if (req.method === 'DELETE') {
    const weekIds = all('SELECT id FROM TrainingWeek WHERE planId = ?', [id]).map((r) => r.id)
    for (const wid of weekIds) deleteWeek(wid as string)
    run('DELETE FROM TrainingPlan WHERE id = ?', [id])
    return json({ success: true })
  }
  return methodErr(req.method)
}

export function registerCoreHandlers(map: Map<string, Handler>): void {
  map.set('GET /api/runner', runnerHandler)
  map.set('POST /api/runner', runnerHandler)
  map.set('GET /api/weeks', weeksHandler)
  map.set('POST /api/weeks', weeksHandler)
  map.set('GET /api/templates', templatesHandler)
  map.set('POST /api/templates', templatesApplyHandler)
  map.set('POST /api/seed', seedHandler)
  map.set('GET /api/plans', plansHandler)
  map.set('POST /api/plans', plansHandler)
  map.set('GET /api/plans/[id]', planDetailHandler)
  map.set('PATCH /api/plans/[id]', planDetailHandler)
  map.set('DELETE /api/plans/[id]', planDetailHandler)
}

export function registerWeekSessionHandlers(map: Map<string, Handler>): void {
  map.set('GET /api/weeks/[id]', weekDetailHandler)
  map.set('PATCH /api/weeks/[id]', weekDetailHandler)
  map.set('DELETE /api/weeks/[id]', weekDetailHandler)
  map.set('GET /api/weeks/[id]/reviews', weekReviewsHandler)
  map.set('GET /api/sessions', sessionsListHandler)
  map.set('POST /api/sessions', sessionsListHandler)
  map.set('GET /api/sessions/[id]', sessionDetailHandler)
  map.set('PATCH /api/sessions/[id]', sessionDetailHandler)
  map.set('DELETE /api/sessions/[id]', sessionDetailHandler)
  map.set('POST /api/sessions/[id]/complete', sessionCompleteHandler)
  map.set('GET /api/shoes', shoesHandler)
  map.set('POST /api/shoes', shoesHandler)
  map.set('PATCH /api/shoes/[id]', shoeDetailHandler)
  map.set('DELETE /api/shoes/[id]', shoeDetailHandler)
  map.set('GET /api/recovery', recoveryHandler)
  map.set('POST /api/recovery', recoveryHandler)
  map.set('GET /api/records', recordsHandler)
  map.set('POST /api/records', recordsHandler)
}