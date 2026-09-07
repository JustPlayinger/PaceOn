/**
 * 在线（Prisma）周课表重建 replan：保留「已完成训练天 + 指定休息天（默认今天）」，其余天由 AI 重排。
 */
import { db } from '@/lib/db'
import { generateNextWeekPlan, generatePlanFromChat, type RunnerProfile, type RecentTrainingLog } from '@/lib/ai'

export interface ReplanOpts { fixedRestDays?: number[]; chatHistory?: { role: string; content: string }[] }

export async function replanWeek(weekId: string, runner: RunnerProfile, opts: ReplanOpts = {}) {
  const week = await db.trainingWeek.findUnique({
    where: { id: weekId },
    include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
  })
  if (!week) throw new Error('未找到该周课表')

  // 近期实际训练（补录历史）
  const recentLogs: RecentTrainingLog[] = (await db.trainingLog.findMany({
    where: { date: { gte: new Date(Date.now() - 13 * 86400000) } },
    orderBy: { date: 'asc' },
  })).map((l) => ({ date: l.date.toISOString().slice(0, 10), distance: l.distance, duration: l.duration, avgPace: l.avgPace, avgHr: l.avgHr, elevation: l.elevation, rpe: l.rpe, feeling: l.feeling, notes: l.notes }))

  // 1. 收集已完成天（含完成记录），后续原样保留
  const kept = week.sessions.filter((s) => s.completion)
  const keptLogs: RecentTrainingLog[] = kept.map((s) => ({ date: s.date.toISOString().slice(0, 10), distance: s.completion!.distance, duration: s.completion!.duration, avgPace: s.completion!.avgPace, avgHr: s.completion!.avgHr, elevation: s.completion!.elevation, rpe: s.completion!.rpe, feeling: s.completion!.feeling, notes: s.completion!.notes }))

  // 2. 清空该周原有训练课（周记录保留）
  await db.trainingCompletion.deleteMany({ where: { session: { weekId } } })
  await db.trainingSession.deleteMany({ where: { weekId } })

  // 3. AI 重排整周（已完成天并入近期实跑上下文）
  const chatMsgs = (opts.chatHistory || []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  const weekNumber = week.weekNumber ?? 1
  const logs = [...recentLogs, ...keptLogs]
  const plan = chatMsgs.length ? await generatePlanFromChat(runner, chatMsgs, [], null, logs) : await generateNextWeekPlan(runner, [], null, weekNumber, logs)

  // 4. 组装每天：保留天 > 固定休息天 > AI 生成天
  const keptByDay = new Map<number, typeof kept[number]>()
  kept.forEach((s) => keptByDay.set(s.dayOfWeek, s))
  const todayDow = new Date().getDay()
  const restDays = new Set<number>((opts.fixedRestDays && opts.fixedRestDays.length ? opts.fixedRestDays : [todayDow]).filter((d) => d >= 0 && d <= 6 && !keptByDay.has(d)))
  const finalByDay = new Map<number, { kind: 'kept'; s: typeof kept[number] } | { kind: 'rest' } | { kind: 'planned'; p: { dayOfWeek: number; type: string; plannedDistance: number | null; plannedDuration: number | null; plannedPace: string | null; intensity: string | null; description: string } }>()
  kept.forEach((s) => finalByDay.set(s.dayOfWeek, { kind: 'kept', s }))
  plan.sessions.forEach((p) => { if (!finalByDay.has(p.dayOfWeek)) finalByDay.set(p.dayOfWeek, { kind: 'planned', p }) })
  restDays.forEach((d) => { if (!finalByDay.has(d)) finalByDay.set(d, { kind: 'rest' }) })

  // 5. 写回训练课（周一→周日排序）
  const weekStart = new Date(week.weekStart)
  const dayDate = (dow: number) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + (dow === 0 ? 6 : dow - 1)); return d }
  let order = 0
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const row = finalByDay.get(dow)
    if (!row) continue
    if (row.kind === 'kept') {
      const s = row.s
      await db.trainingSession.create({ data: { id: s.id, weekId, date: s.date, dayOfWeek: dow, type: s.type, plannedDistance: s.plannedDistance, plannedDuration: s.plannedDuration, plannedPace: s.plannedPace, intensity: s.intensity, description: s.description, status: 'completed', order } })
      const c = s.completion!
      await db.trainingCompletion.create({ data: { id: c.id, sessionId: s.id, distance: c.distance, duration: c.duration, avgPace: c.avgPace, avgPaceSec: c.avgPaceSec, avgHr: c.avgHr, maxHr: c.maxHr, elevation: c.elevation, cadence: c.cadence, calories: c.calories, weather: c.weather, temperature: c.temperature, rpe: c.rpe, feeling: c.feeling, feelingNote: c.feelingNote, imageDataUrl: c.imageDataUrl, rawExtract: c.rawExtract, notes: c.notes, shoeId: c.shoeId } })
    } else if (row.kind === 'rest') {
      await db.trainingSession.create({ data: { weekId, date: dayDate(dow), dayOfWeek: dow, type: 'rest', intensity: 'rest', description: '休息日，充分恢复，不安排训练。', status: 'pending', order } })
    } else {
      const p = row.p
      await db.trainingSession.create({ data: { weekId, date: dayDate(dow), dayOfWeek: dow, type: p.type, plannedDistance: p.plannedDistance, plannedDuration: p.plannedDuration, plannedPace: p.plannedPace, intensity: p.intensity, description: p.description, status: 'pending', order } })
    }
    order++
  }

  // 6. 更新周信息 + 保存对话记录
  await db.trainingWeek.update({ where: { id: weekId }, data: { phase: plan.phase, goal: plan.weekGoal, summary: plan.summary } })
  if (chatMsgs.length) await db.aIReview.create({ data: { weekId, type: 'chat_plan', content: chatMsgs.map((m) => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n\n') } })

  const full = await db.trainingWeek.findUnique({ where: { id: weekId }, include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } } })
  return { week: full, plan }
}