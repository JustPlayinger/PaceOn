/**
 * 离线周课表重建 replan：保留「已完成训练天 + 指定休息天（默认今天）」，其余天由 AI 重排。
 */
import { all, get, run, uid, nowIso, logsRecentDays } from '../db'
import { generateNextWeekPlan, generatePlanFromChat, type RunnerProfile, type RecentTrainingLog, type PlannedSession } from '../ai'

function runnerProfile(): RunnerProfile | null {
  const r = get('SELECT * FROM Runner LIMIT 1')
  if (!r) return null
  return { name: (r.name as string) || '跑者', age: r.age as number, gender: r.gender as string, weight: r.weight as number, restingHr: r.restingHr as number, maxHr: r.maxHr as number, vo2max: r.vo2max as number, experience: r.experience as string, targetRace: r.targetRace as string, targetDate: r.targetDate as string, targetTime: r.targetTime as string, weeklyMileage: r.weeklyMileage as number, notes: r.notes as string }
}

function recentLogsForAi(): RecentTrainingLog[] {
  return logsRecentDays(14).map((l) => ({
    date: (l.date as string).slice(0, 10), distance: l.distance, duration: l.duration, avgPace: l.avgPace,
    avgHr: l.avgHr, elevation: l.elevation, rpe: l.rpe, feeling: l.feeling, notes: l.notes,
  }))
}

interface ReplanOpts { fixedRestDays?: number[]; chatHistory?: { role: string; content: string }[] }

function insertSession(weekId: string, weekStart: Date, dow: number, type: string, planned: Partial<PlannedSession>, status: string, order: number, now: string, id: string | null, createdAt?: string): string {
  const date = new Date(weekStart)
  date.setDate(weekStart.getDate() + (dow === 0 ? 6 : dow - 1))
  const sid = id || uid()
  run('INSERT OR REPLACE INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [sid, weekId, date.toISOString(), dow, type, planned.plannedDistance ?? null, planned.plannedDuration ?? null, planned.plannedPace ?? null, planned.intensity ?? null, planned.description || '', status, order, createdAt || now, now])
  return sid
}

/**
 * 重建一个训练周：
 * - 有完成记录的训练课（已完成天）保留不动；
 * - 固定休息天（默认今天，若今天已有完成训练则尊重训练）置为休息；
 * - 其余天调用 AI（quick=generateNextWeekPlan / chat=generatePlanFromChat）重新设计。
 */
export async function replanWeek(weekId: string, opts: ReplanOpts = {}) {
  const week = get('SELECT * FROM TrainingWeek WHERE id = ?', [weekId])
  if (!week) throw new Error('未找到该周课表')
  const runner = runnerProfile()
  if (!runner) throw new Error('请先填写跑者档案')

  // 1. 收集已完成天（含完成记录），稍后原样保留
  const kept: { s: Record<string, unknown>; c: Record<string, unknown> }[] = []
  const keptLogs: RecentTrainingLog[] = []
  for (const s of all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [weekId])) {
    const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]) || null
    if (c) {
      kept.push({ s, c })
      keptLogs.push({
        date: String(s.date).slice(0, 10),
        distance: (c.distance as number | null) ?? null, duration: (c.duration as number | null) ?? null,
        avgPace: (c.avgPace as string | null) ?? null, avgHr: (c.avgHr as number | null) ?? null,
        elevation: (c.elevation as number | null) ?? null, rpe: (c.rpe as number | null) ?? null,
        feeling: (c.feeling as number | null) ?? null, notes: (c.notes as string | null) ?? null,
      })
    }
  }

  // 2. 清空该周原有训练课（周记录本身保留）
  run('DELETE FROM TrainingCompletion WHERE sessionId IN (SELECT id FROM TrainingSession WHERE weekId = ?)', [weekId])
  run('DELETE FROM TrainingSession WHERE weekId = ?', [weekId])

  // 3. AI 重新生成整周（已完成天并入“近期实际训练”上下文，帮助评估疲劳与强度）
  const recentLogs = [...recentLogsForAi(), ...keptLogs]
  const chatMsgs = (opts.chatHistory || []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  const weekNumber = ((week.weekNumber as number) || 1)
  const plan = chatMsgs.length
    ? await generatePlanFromChat(runner, chatMsgs, [], null, recentLogs)
    : await generateNextWeekPlan(runner, [], null, weekNumber, recentLogs)

  // 4. 组装每天：保留天 > 固定休息天 > AI 生成天
  const keptByDay = new Map<number, { s: Record<string, unknown>; c: Record<string, unknown> }>()
  kept.forEach((k) => keptByDay.set(k.s.dayOfWeek as number, k))
  const todayDow = new Date().getDay()
  const restDays = new Set<number>((opts.fixedRestDays && opts.fixedRestDays.length ? opts.fixedRestDays : [todayDow]).filter((d) => d >= 0 && d <= 6 && !keptByDay.has(d)))
  const finalByDay = new Map<number, { kind: 'kept'; s: Record<string, unknown>; c: Record<string, unknown> } | { kind: 'rest' } | { kind: 'planned'; p: PlannedSession }>()
  kept.forEach((k) => finalByDay.set(k.s.dayOfWeek as number, { kind: 'kept', s: k.s, c: k.c }))
  plan.sessions.forEach((p) => { if (!finalByDay.has(p.dayOfWeek)) finalByDay.set(p.dayOfWeek, { kind: 'planned', p }) })
  restDays.forEach((d) => { if (!finalByDay.has(d)) finalByDay.set(d, { kind: 'rest' }) })

  // 5. 写回训练课（周一→周日排序）
  const weekStart = new Date(String(week.weekStart))
  const now = nowIso()
  let order = 0
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const row = finalByDay.get(dow)
    if (!row) continue
    if (row.kind === 'kept') {
      const c = row.c
      const sid = insertSession(weekId, weekStart, dow, String(row.s.type), { plannedDistance: row.s.plannedDistance as number | null, plannedDuration: row.s.plannedDuration as number | null, plannedPace: row.s.plannedPace as string | null, intensity: row.s.intensity as string | null, description: row.s.description as string | null }, 'completed', order, now, String(row.s.id), row.s.createdAt as string | null)
      run('INSERT OR REPLACE INTO TrainingCompletion (id, sessionId, distance, duration, avgPace, avgPaceSec, avgHr, maxHr, elevation, cadence, calories, weather, temperature, rpe, feeling, feelingNote, imageDataUrl, rawExtract, notes, shoeId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [c.id || uid(), sid, c.distance ?? null, c.duration ?? null, c.avgPace ?? null, c.avgPaceSec ?? null, c.avgHr ?? null, c.maxHr ?? null, c.elevation ?? null, c.cadence ?? null, c.calories ?? null, c.weather ?? null, c.temperature ?? null, c.rpe ?? null, c.feeling ?? null, c.feelingNote ?? null, c.imageDataUrl ?? null, c.rawExtract ?? null, c.notes ?? null, c.shoeId ?? null, c.createdAt || now, now])
    } else if (row.kind === 'rest') {
      insertSession(weekId, weekStart, dow, 'rest', { intensity: 'rest', description: '休息日，充分恢复，不安排训练。' }, 'pending', order, now, null)
    } else {
      insertSession(weekId, weekStart, dow, row.p.type, { plannedDistance: row.p.plannedDistance, plannedDuration: row.p.plannedDuration, plannedPace: row.p.plannedPace, intensity: row.p.intensity, description: row.p.description }, 'pending', order, now, null)
    }
    order++
  }

  // 6. 更新周信息 + 保存对话
  run('UPDATE TrainingWeek SET phase = ?, goal = ?, summary = ?, updatedAt = ? WHERE id = ?', [plan.phase, plan.weekGoal, plan.summary, now, weekId])
  if (chatMsgs.length) run('INSERT INTO AIReview (id, weekId, type, content, createdAt) VALUES (?,?,?,?,?)', [uid(), weekId, 'chat_plan', chatMsgs.map((m) => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n\n'), now])

  const updated = get('SELECT * FROM TrainingWeek WHERE id = ?', [weekId])
  const sessions = all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [weekId]).map((s) => ({ ...s, completion: get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]) || null }))
  return { week: { ...updated, sessions }, plan }
}