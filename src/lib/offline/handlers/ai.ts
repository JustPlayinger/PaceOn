/**
 * 离线 API - AI handler（extract / review / plan / chat-plan / adjust / 单次分析 / 数据导入导出）
 */
import { all, get, run, uid, nowIso } from '../db'
import { parseFieldsFromText, detectAppSource } from '@/lib/ocr/parse'
import { ocrImageBrowser, toDataUrl } from '../ocr'
import { getDeepseekConfig } from '../config'
import { callDeepseekApi, OCR_PARSE_PROMPT, parseExtractedFields, generateWeeklyReview, generateNextWeekPlan, generateInitialPlan, generatePlanFromChat, chatWithCoach, generateMicroAdjust, analyzeSingleSession, type RunnerProfile, type SessionForReview } from '../ai'
import type { ApiRequest, Handler } from '../types'
import { json, methodErr, nextMondayOf, findWeekStartingOn, getOrCreateActivePlan, weekFull } from './core'

function runnerProfile(): RunnerProfile | null {
  const r = get('SELECT * FROM Runner LIMIT 1')
  if (!r) return null
  return { name: (r.name as string) || '跑者', age: r.age as number, gender: r.gender as string, weight: r.weight as number, restingHr: r.restingHr as number, maxHr: r.maxHr as number, vo2max: r.vo2max as number, experience: r.experience as string, targetRace: r.targetRace as string, targetDate: r.targetDate as string, targetTime: r.targetTime as string, weeklyMileage: r.weeklyMileage as number, notes: r.notes as string }
}

function sessionsForReview(weekId: string): SessionForReview[] {
  return all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [weekId]).map((s) => {
    const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id])
    let completion: Record<string, unknown> | null = null
    if (c) {
      completion = { distance: c.distance, duration: c.duration, avgPace: c.avgPace, avgPaceSec: c.avgPaceSec, avgHr: c.avgHr, maxHr: c.maxHr, elevation: c.elevation, cadence: c.cadence, rpe: c.rpe, feeling: c.feeling, feelingNote: c.feelingNote, weather: c.weather, temperature: c.temperature }
      if (c.rawExtract) { try { const raw = JSON.parse(c.rawExtract as string); completion = { ...completion, paceCurve: raw.paceCurve, hrCurve: raw.hrCurve, elevationCurve: raw.elevationCurve, cadenceCurve: raw.cadenceCurve, splitPaces: raw.splitPaces, curveAnalysis: raw.curveAnalysis, vo2max: raw.vo2max, hrRecovery: raw.hrRecovery, groundContactTime: raw.groundContactTime, verticalOscillation: raw.verticalOscillation, leftRightBalance: raw.leftRightBalance, strideLength: raw.strideLength } } catch {} }
    }
    return { date: new Date(s.date as string).toISOString(), dayOfWeek: s.dayOfWeek as number, type: s.type as string, plannedDistance: s.plannedDistance as number, plannedDuration: s.plannedDuration as number, plannedPace: s.plannedPace as string, intensity: s.intensity as string, description: s.description as string, status: s.status as string, completion }
  })
}

const extractHandler: Handler = async (req) => {
  const { imageBase64, mimeType } = (req.body || {}) as { imageBase64?: string; mimeType?: string }
  if (!imageBase64) return json({ error: 'imageBase64 is required' }, 400)
  const dataUrl = toDataUrl(imageBase64, mimeType || 'image/jpeg')
  const { text } = await ocrImageBrowser(dataUrl)
  const fields = parseFieldsFromText(text)
  const appSource = detectAppSource(text)
  const hasCore = fields.distance != null || fields.duration != null || fields.avgPace != null
  let llm: Record<string, unknown> | null = null
  let useLlm = false
  if (!hasCore && text.trim() && getDeepseekConfig().apiKey) {
    try {
      const resp = await callDeepseekApi(`${OCR_PARSE_PROMPT}\n\n== OCR 识别文字 ==\n${text.slice(0, 8000)}`)
      llm = parseExtractedFields(resp) as unknown as Record<string, unknown>
      useLlm = true
    } catch (e) { console.warn('[offline-extract] DeepSeek 文本解析失败:', (e as Error).message) }
  }
  const pick = <T>(a: T | undefined | null, b: unknown): T | null => (a ?? (b as T | null)) as T | null
  const result = {
    distance: pick(fields.distance, llm?.distance), duration: pick(fields.duration, llm?.duration),
    avgPace: pick(fields.avgPace, llm?.avgPace), avgPaceSec: pick(fields.avgPaceSec, llm?.avgPaceSec),
    avgHr: pick(fields.avgHr, llm?.avgHr), maxHr: pick(fields.maxHr, llm?.maxHr),
    elevation: pick(fields.elevation, llm?.elevation), descent: fields.descent ?? null,
    cadence: pick(fields.cadence, llm?.cadence), strideLength: fields.strideLength ?? null,
    steps: pick(fields.steps, llm?.steps), calories: pick(fields.calories, llm?.calories),
    avgSpeed: pick(fields.avgSpeed, llm?.avgSpeed), vo2max: null, hrRecovery: null,
    groundContactTime: null, verticalOscillation: null, leftRightBalance: null,
    weather: pick(fields.weather, llm?.weather), temperature: pick(fields.temperature, llm?.temperature),
    paceCurve: null, hrCurve: null, elevationCurve: null, cadenceCurve: null, splitPaces: null, hrZones: null,
    curveAnalysis: hasCore || useLlm ? '本次训练数据由手机端本地 OCR 识别。因 DeepSeek 无多模态能力，折线图曲线数据无法从静态截图自动提取。' : null,
    rawText: text,
    notes: useLlm ? '识别方式：手机端 OCR + DeepSeek 文本解析' : '识别方式：手机端本地 OCR',
    appSource: appSource ?? llm?.appSource ?? null,
  }
  return json({ data: result })
}
const reviewHandler: Handler = async (req) => {
  const { weekId } = (req.body || {}) as { weekId?: string }
  const week = get('SELECT * FROM TrainingWeek WHERE id = ?', [weekId])
  if (!week) return json({ error: 'Week not found' }, 404)
  const runner = runnerProfile()
  if (!runner) return json({ error: 'Runner profile not found' }, 404)
  const result = await generateWeeklyReview(runner, week.goal as string | null, week.phase as string | null, sessionsForReview(weekId as string))
  const id = uid()
  const now = nowIso()
  run('INSERT INTO AIReview (id, weekId, type, content, rating, suggestions, createdAt) VALUES (?,?,?,?,?,?,?)', [id, weekId, 'weekly_review', result.content, result.rating, JSON.stringify(result.suggestions), now])
  run('UPDATE TrainingWeek SET summary = ?, updatedAt = ? WHERE id = ?', [`本周评分 ${result.rating}/100。${result.content.slice(0, 200)}`, now, weekId])
  return json({ review: get('SELECT * FROM AIReview WHERE id = ?', [id]), rating: result.rating, content: result.content, suggestions: result.suggestions })
}

const planHandler: Handler = async (req) => {
  const { fromWeekId } = (req.body || {}) as { fromWeekId?: string }
  const runner = runnerProfile()
  if (!runner) return json({ error: '请先填写跑者档案' }, 400)

  const nextMonday = nextMondayOf()

  // 防重复：下周课表已存在则直接复用
  const existing = findWeekStartingOn(nextMonday)
  if (existing) {
    return json({ week: weekFull(existing.id as string), plan: { phase: existing.phase, weekGoal: existing.goal, summary: existing.summary }, reused: true })
  }

  const activePlan = getOrCreateActivePlan()

  let plan
  let weekNumber = 1
  let lastReview: string | null = null
  let lastWeekSessions: SessionForReview[] = []
  let fromWeekFound = false
  if (fromWeekId) {
    const fromWeek = get('SELECT * FROM TrainingWeek WHERE id = ?', [fromWeekId])
    if (fromWeek) { fromWeekFound = true; weekNumber = ((fromWeek.weekNumber as number) || 1) + 1; lastReview = (fromWeek.summary as string) || null; lastWeekSessions = sessionsForReview(fromWeekId) }
  }
  if (!fromWeekFound) {
    const maxNum = get('SELECT MAX(weekNumber) AS m FROM TrainingWeek WHERE planId = ?', [activePlan.id]) as { m: number | null } | null
    weekNumber = ((maxNum?.m as number) || 0) + 1
  }
  plan = fromWeekFound ? await generateNextWeekPlan(runner, lastWeekSessions, lastReview, weekNumber) : await generateInitialPlan(runner)
  const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)
  const id = uid()
  const now = nowIso()
  run('INSERT INTO TrainingWeek (id, planId, weekStart, weekEnd, weekNumber, phase, goal, summary, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, activePlan.id, nextMonday.toISOString(), nextSunday.toISOString(), weekNumber, plan.phase, plan.weekGoal, plan.summary, now, now])
  plan.sessions.forEach((s, idx) => {
    const date = new Date(nextMonday)
    date.setDate(nextMonday.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
    run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), id, date.toISOString(), s.dayOfWeek, s.type, s.plannedDistance, s.plannedDuration, s.plannedPace, s.intensity, s.description, 'pending', idx, now, now])
  })
  const week = get('SELECT * FROM TrainingWeek WHERE id = ?', [id])
  const sessions = all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [id]).map((s) => ({ ...s, completion: get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]) || null }))
  return json({ week: { ...week, sessions }, plan })
}

const chatPlanHandler: Handler = async (req) => {
  const { action } = (req.body || {}) as { action?: string }
  const runner = runnerProfile()
  if (action === 'chat') {
    const { message, history } = (req.body || {}) as { message?: string; history?: { role: string; content: string }[] }
    if (!message) return json({ error: '请输入消息' }, 400)
    return json(await chatWithCoach(runner, (history || []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })), message))
  }
  if (action === 'generate') {
    const { history, fromWeekId } = (req.body || {}) as { history?: { role: string; content: string }[]; fromWeekId?: string }
    const nextMonday = nextMondayOf()

    // 防重复：下周课表已存在则直接复用
    const existing = findWeekStartingOn(nextMonday)
    if (existing) {
      return json({ week: weekFull(existing.id as string), plan: { phase: existing.phase, weekGoal: existing.goal, summary: existing.summary }, reused: true })
    }

    const activePlan = getOrCreateActivePlan()

    let weekNumber = 1
    let lastReview: string | null = null
    let lastWeekSessions: SessionForReview[] = []
    let fromWeekFound = false
    if (fromWeekId) {
      const fromWeek = get('SELECT * FROM TrainingWeek WHERE id = ?', [fromWeekId])
      if (fromWeek) { fromWeekFound = true; weekNumber = ((fromWeek.weekNumber as number) || 1) + 1; lastReview = (fromWeek.summary as string) || null; lastWeekSessions = sessionsForReview(fromWeekId) }
    }
    if (!fromWeekFound) {
      const maxNum = get('SELECT MAX(weekNumber) AS m FROM TrainingWeek WHERE planId = ?', [activePlan.id]) as { m: number | null } | null
      weekNumber = ((maxNum?.m as number) || 0) + 1
    }
    const plan = await generatePlanFromChat(runner, (history || []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })), lastWeekSessions, lastReview)
    const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)
    const id = uid()
    const now = nowIso()
    run('INSERT INTO TrainingWeek (id, planId, weekStart, weekEnd, weekNumber, phase, goal, summary, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [id, activePlan.id, nextMonday.toISOString(), nextSunday.toISOString(), weekNumber, plan.phase, plan.weekGoal, plan.summary, now, now])
    plan.sessions.forEach((s, idx) => {
      const date = new Date(nextMonday)
      date.setDate(nextMonday.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
      run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), id, date.toISOString(), s.dayOfWeek, s.type, s.plannedDistance, s.plannedDuration, s.plannedPace, s.intensity, s.description, 'pending', idx, now, now])
    })
    run('INSERT INTO AIReview (id, weekId, type, content, createdAt) VALUES (?,?,?,?,?)', [uid(), id, 'chat_plan', (history || []).map((m) => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n\n'), now])
    const week = get('SELECT * FROM TrainingWeek WHERE id = ?', [id])
    const sessions = all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [id]).map((s) => ({ ...s, completion: get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]) || null }))
    return json({ week: { ...week, sessions }, plan })
  }
  return json({ error: '未知 action' }, 400)
}
const adjustHandler: Handler = async (req) => {
  const { weekId, userNote } = (req.body || {}) as { weekId?: string; userNote?: string }
  const runner = runnerProfile()
  if (!runner) return json({ error: 'Runner profile not found' }, 404)
  const sessions = sessionsForReview(weekId as string)
  const content = await generateMicroAdjust(runner, sessions.filter((s) => !s.completion), sessions.filter((s) => s.completion), userNote || '')
  run('INSERT INTO AIReview (id, weekId, type, content, createdAt) VALUES (?,?,?,?,?)', [uid(), weekId, 'micro_adjust', content, nowIso()])
  return json({ content })
}

const sessionDetailAiHandler: Handler = async (req) => {
  const id = req.params.id
  const session = get('SELECT * FROM TrainingSession WHERE id = ?', [id])
  if (!session) return json({ error: 'Session not found' }, 404)
  const runner = runnerProfile()
  if (!runner) return json({ error: 'Runner profile not found' }, 404)
  const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [id]) || null
  const week = c || get('SELECT * FROM TrainingWeek WHERE id = ?', [session.weekId as string]) || null
  if (req.method === 'GET') {
    let curves: { paceCurve?: unknown; hrCurve?: unknown; elevationCurve?: unknown } = {}
    if (c && c.rawExtract) {
      try {
        const raw = JSON.parse(c.rawExtract as string)
        curves = { paceCurve: raw.paceCurve || null, hrCurve: raw.hrCurve || null, elevationCurve: raw.elevationCurve || null }
      } catch { /* ignore */ }
    }
    return json({
      session: {
        id: session.id,
        date: session.date,
        dayOfWeek: session.dayOfWeek,
        type: session.type,
        plannedDistance: session.plannedDistance,
        plannedDuration: session.plannedDuration,
        plannedPace: session.plannedPace,
        intensity: session.intensity,
        description: session.description,
        status: session.status,
        week: week && week.id ? { id: week.id, weekNumber: week.weekNumber, phase: week.phase, goal: week.goal } : null,
      },
      completion: c,
      curves,
    })
  }
  if (!c) return json({ error: '该训练尚未上传完成数据' }, 400)
  const planned = { type: session.type, plannedDistance: session.plannedDistance, plannedDuration: session.plannedDuration, plannedPace: session.plannedPace, intensity: session.intensity, description: session.description }
  const content = await analyzeSingleSession(runner, planned, c ? { ...c } : {})
  return json({ analysis: content })
}

const dataExportHandler: Handler = async () => {
  const data = { exportedAt: new Date().toISOString(), version: 1, plans: all('SELECT * FROM TrainingPlan').map((p) => ({ ...p, active: Boolean(p.active) })), runner: get('SELECT * FROM Runner LIMIT 1') || null, weeks: all('SELECT * FROM TrainingWeek').map((w) => ({ ...w, sessions: all('SELECT * FROM TrainingSession WHERE weekId = ?', [w.id]).map((s) => ({ ...s, completion: get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]) || null })), reviews: all('SELECT * FROM AIReview WHERE weekId = ?', [w.id]) })), shoes: all('SELECT * FROM Shoe'), usages: all('SELECT * FROM ShoeUsage'), recoveryLogs: all('SELECT * FROM RecoveryLog'), records: all('SELECT * FROM PersonalRecord') }
  return json(data)
}

const dataImportHandler: Handler = async (req) => {
  const { data, mode } = (req.body || {}) as { data?: Record<string, any>; mode?: string }
  if (!data) return json({ error: '缺少数据' }, 400)
  if (mode === 'replace') for (const t of ['TrainingCompletion', 'TrainingSession', 'TrainingWeek', 'TrainingPlan', 'AIReview', 'ShoeUsage', 'Shoe', 'RecoveryLog', 'PersonalRecord', 'Runner']) run(`DELETE FROM ${t}`)
  const now = nowIso()
  const mergeRunner = (r: any) => {
    if (!r) return
    const existing = get('SELECT * FROM Runner LIMIT 1')
    const vals = [r.name || '跑者', r.age ?? null, r.gender ?? null, r.weight ?? null, r.height ?? null, r.restingHr ?? null, r.maxHr ?? null, r.vo2max ?? null, r.experience ?? null, r.targetRace ?? null, r.targetDate ?? null, r.targetTime ?? null, r.weeklyMileage ?? null, r.notes ?? null]
    if (existing) run('UPDATE Runner SET name=?, age=?, gender=?, weight=?, height=?, restingHr=?, maxHr=?, vo2max=?, experience=?, targetRace=?, targetDate=?, targetTime=?, weeklyMileage=?, notes=?, updatedAt=? WHERE id=?', [...vals, now, existing.id])
    else run('INSERT INTO Runner (id, name, age, gender, weight, height, restingHr, maxHr, vo2max, experience, targetRace, targetDate, targetTime, weeklyMileage, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), ...vals, now, now])
  }
  mergeRunner(data.runner)

  // 导入训练周期（无 plans 的旧备份会自动按周 planId 兜底重建）
  if (Array.isArray(data.plans)) for (const p of data.plans) {
    const pid = p.id || uid()
    const existingPlan = get('SELECT * FROM TrainingPlan WHERE id = ?', [pid])
    if (existingPlan) {
      run('UPDATE TrainingPlan SET title=?, goal=?, targetRace=?, active=?, updatedAt=? WHERE id=?', [p.title || existingPlan.title, p.goal ?? existingPlan.goal, p.targetRace ?? existingPlan.targetRace, p.active ? 1 : 0, now, pid])
    } else {
      run('INSERT INTO TrainingPlan (id, title, goal, targetRace, active, startedAt, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)', [pid, p.title || '我的训练计划', p.goal ?? null, p.targetRace ?? null, p.active ? 1 : 0, p.startedAt || now, p.createdAt || now, now])
    }
  }

  let weekCount = 0, sessionCount = 0
  if (Array.isArray(data.weeks)) for (const w of data.weeks) {
    const wid = w.id || uid()
    const existing = get('SELECT * FROM TrainingWeek WHERE id = ?', [wid])
    // 归入训练周期：周带 planId 时确保该周期存在；否则归入当前启用计划
    let widPlanId: string | null = w.planId ? String(w.planId) : null
    if (widPlanId) {
      if (!get('SELECT * FROM TrainingPlan WHERE id = ?', [widPlanId])) {
        run('INSERT INTO TrainingPlan (id, title, goal, targetRace, active, startedAt, createdAt, updatedAt) VALUES (?,?,?,?,0,?,?,?)', [widPlanId, '我的训练计划', null, null, now, now, now])
      }
    } else {
      widPlanId = getOrCreateActivePlan().id as string
    }
    const vals = [widPlanId, w.weekStart || now, w.weekEnd || now, w.weekNumber ?? null, w.phase ?? null, w.goal ?? null, w.summary ?? null, now]
    if (existing) run('UPDATE TrainingWeek SET planId=?, weekStart=?, weekEnd=?, weekNumber=?, phase=?, goal=?, summary=?, updatedAt=? WHERE id=?', [...vals, wid])
    else run('INSERT INTO TrainingWeek (id, planId, weekStart, weekEnd, weekNumber, phase, goal, summary, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)', [wid, ...vals, now])
    if (Array.isArray(w.sessions)) for (const s of w.sessions) {
      const sid = s.id || uid()
      run('INSERT OR REPLACE INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [sid, wid, s.date || now, s.dayOfWeek ?? 1, s.type || 'easy', s.plannedDistance ?? null, s.plannedDuration ?? null, s.plannedPace ?? null, s.intensity ?? null, s.description || '', s.status || 'pending', s.order ?? 0, s.createdAt || now, now])
      if (s.completion) { const c = s.completion; run('INSERT OR REPLACE INTO TrainingCompletion (id, sessionId, distance, duration, avgPace, avgPaceSec, avgHr, maxHr, elevation, cadence, calories, weather, temperature, rpe, feeling, feelingNote, imageDataUrl, rawExtract, notes, shoeId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [c.id || uid(), sid, c.distance ?? null, c.duration ?? null, c.avgPace ?? null, c.avgPaceSec ?? null, c.avgHr ?? null, c.maxHr ?? null, c.elevation ?? null, c.cadence ?? null, c.calories ?? null, c.weather ?? null, c.temperature ?? null, c.rpe ?? null, c.feeling ?? null, c.feelingNote ?? null, c.imageDataUrl ?? null, c.rawExtract ?? null, c.notes ?? null, c.shoeId ?? null, c.createdAt || now, now]) }
      sessionCount++
    }
    weekCount++
  }
  if (Array.isArray(data.shoes)) for (const sh of data.shoes) run('INSERT OR REPLACE INTO Shoe (id, name, brand, model, type, color, purchasedAt, lifespan, retired, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [sh.id || uid(), sh.name || '跑鞋', sh.brand ?? null, sh.model ?? null, sh.type ?? 'daily', sh.color ?? null, sh.purchasedAt || now, sh.lifespan ?? 800, sh.retired ? 1 : 0, sh.notes ?? null, sh.createdAt || now, now])
  if (Array.isArray(data.recoveryLogs)) for (const l of data.recoveryLogs) run('INSERT OR REPLACE INTO RecoveryLog (id, date, sleepHours, sleepQuality, waterIntake, nutrition, muscleSoreness, fatigue, mood, preRunFuel, duringFuel, postRunFuel, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [l.id || uid(), l.date || now.slice(0, 10), l.sleepHours ?? null, l.sleepQuality ?? null, l.waterIntake ?? null, l.nutrition ?? null, l.muscleSoreness ?? null, l.fatigue ?? null, l.mood ?? null, l.preRunFuel ?? null, l.duringFuel ?? null, l.postRunFuel ?? null, l.notes ?? null, l.createdAt || now, now])
  if (Array.isArray(data.records)) for (const r of data.records) run('INSERT OR REPLACE INTO PersonalRecord (id, distance, distanceKm, timeSec, date, location, raceName, paceSec, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [r.id || uid(), r.distance, r.distanceKm, r.timeSec, r.date || now, r.location ?? null, r.raceName ?? null, r.paceSec ?? null, r.notes ?? null, r.createdAt || now, now])
  return json({ ok: true, runner: data.runner ? 1 : 0, weeks: weekCount, sessions: sessionCount, shoes: data.shoes?.length || 0, usages: 0, recovery: data.recoveryLogs?.length || 0, reviews: 0 })
}

export function registerAiHandlers(map: Map<string, Handler>): void {
  map.set('POST /api/extract', extractHandler)
  map.set('POST /api/review', reviewHandler)
  map.set('POST /api/plan', planHandler)
  map.set('POST /api/chat-plan', chatPlanHandler)
  map.set('POST /api/adjust', adjustHandler)
  map.set('GET /api/sessions/[id]/detail', sessionDetailAiHandler)
  map.set('POST /api/sessions/[id]/detail', sessionDetailAiHandler)
  map.set('GET /api/data/export', dataExportHandler)
  map.set('POST /api/data/import', dataImportHandler)
}