/**
 * 离线 API - 统计计算 handler（stats / load / calendar / goal / achievements / search / compare / config）
 */
import { all, get, logsBetween } from '../db'
import type { ApiRequest, Handler } from '../types'
import { json, methodErr } from './core'

interface Comp { distance?: number | null; duration?: number | null; avgPaceSec?: number | null; avgHr?: number | null; maxHr?: number | null; elevation?: number | null; cadence?: number | null; rpe?: number | null; feeling?: number | null; [k: string]: unknown }

function completedSessionsOf(weekId: string): { session: Record<string, unknown>; comp: Comp }[] {
  const out: { session: Record<string, unknown>; comp: Comp }[] = []
  for (const s of all('SELECT * FROM TrainingSession WHERE weekId = ? ORDER BY "order" ASC', [weekId])) {
    if (s.status === 'completed') { const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]); if (c) out.push({ session: s, comp: c as Comp }) }
  }
  return out
}
function allWeeksAsc(): Record<string, unknown>[] { return all('SELECT * FROM TrainingWeek ORDER BY weekStart ASC') }

const statsHandler: Handler = async () => {
  const weeks = allWeeksAsc()
  const weeklyStats = weeks.map((w) => {
    const done = completedSessionsOf(w.id as string)
    const plannedDistance = all('SELECT COALESCE(SUM(plannedDistance),0) as s FROM TrainingSession WHERE weekId = ?', [w.id])[0].s as number
    const actualDistance = done.reduce((s, x) => s + (x.comp.distance || 0), 0)
    const totalDuration = done.reduce((s, x) => s + (x.comp.duration || 0), 0)
    const avgPaces = done.map((x) => x.comp.avgPaceSec).filter((v): v is number => v != null)
    const avgHrs = done.map((x) => x.comp.avgHr).filter((v): v is number => v != null)
    const elevations = done.map((x) => x.comp.elevation || 0)
    const rpes = done.map((x) => x.comp.rpe).filter((v): v is number => v != null)
    const feelings = done.map((x) => x.comp.feeling).filter((v): v is number => v != null)
    const completionRate = plannedDistance > 0 ? Math.min(100, Math.round((actualDistance / plannedDistance) * 100)) : 0
    return { weekId: w.id, weekNumber: w.weekNumber ?? 0, weekStart: w.weekStart, weekEnd: w.weekEnd, phase: w.phase || 'base', plannedDistance, actualDistance, totalDuration, completionRate, avgPaceSec: avgPaces.length > 0 ? Math.round(avgPaces.reduce((a, b) => a + b, 0) / avgPaces.length) : null, avgHr: avgHrs.length > 0 ? Math.round(avgHrs.reduce((a, b) => a + b, 0) / avgHrs.length) : null, totalElevation: elevations.reduce((a, b) => a + b, 0), avgRpe: rpes.length > 0 ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null, avgFeeling: feelings.length > 0 ? Math.round((feelings.reduce((a, b) => a + b, 0) / feelings.length) * 10) / 10 : null, completedCount: done.length, totalSessions: all('SELECT COUNT(*) as c FROM TrainingSession WHERE weekId = ?', [w.id])[0].c as number }
  })
  const typeStats: Record<string, { count: number; distance: number; duration: number }> = {}
  for (const w of weeks) for (const { session, comp } of completedSessionsOf(w.id as string)) {
    const t = session.type as string
    if (!typeStats[t]) typeStats[t] = { count: 0, distance: 0, duration: 0 }
    typeStats[t].count++; typeStats[t].distance += comp.distance || 0; typeStats[t].duration += comp.duration || 0
  }
  const runner = get('SELECT * FROM Runner LIMIT 1')
  const hrZoneDistribution = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0 }
  if (runner?.maxHr && runner?.restingHr) {
    const maxHr = runner.maxHr as number, restHr = runner.restingHr as number
    const zones = [
      { zone: 'Z1', min: restHr, max: restHr + (maxHr - restHr) * 0.5 },
      { zone: 'Z2', min: restHr + (maxHr - restHr) * 0.5, max: restHr + (maxHr - restHr) * 0.6 },
      { zone: 'Z3', min: restHr + (maxHr - restHr) * 0.6, max: restHr + (maxHr - restHr) * 0.7 },
      { zone: 'Z4', min: restHr + (maxHr - restHr) * 0.7, max: restHr + (maxHr - restHr) * 0.8 },
      { zone: 'Z5', min: restHr + (maxHr - restHr) * 0.8, max: maxHr },
    ]
    for (const w of weeks.slice(-4)) for (const { comp } of completedSessionsOf(w.id as string)) {
      const hr = comp.avgHr
      if (hr) for (const z of zones) { if (hr >= z.min && hr < z.max) { hrZoneDistribution[z.zone as keyof typeof hrZoneDistribution]++; break } }
    }
  }
  const totalDistance = weeklyStats.reduce((s, w) => s + w.actualDistance, 0)
  const totalDuration = weeklyStats.reduce((s, w) => s + w.totalDuration, 0)
  const totalRuns = weeklyStats.reduce((s, w) => s + w.completedCount, 0)
  const withPace = weeklyStats.filter((w) => w.avgPaceSec)
  const avgPaceOverall = withPace.length > 0 ? Math.round(withPace.reduce((s, w) => s + (w.avgPaceSec || 0), 0) / withPace.length) : null
  return json({ weeklyStats, typeStats: Object.entries(typeStats).map(([type, v]) => ({ type, ...v })), hrZoneDistribution, overall: { totalWeeks: weeks.length, totalDistance: Math.round(totalDistance * 10) / 10, totalDuration, totalRuns, avgPaceSec: avgPaceOverall, avgWeeklyDistance: weeks.length > 0 ? Math.round((totalDistance / weeks.length) * 10) / 10 : 0 } })
}
const intensityFactor: Record<string, number> = { easy: 1, recovery: 0.8, tempo: 1.5, interval: 2, long: 1.2, rest: 0, cross: 0.5 }
const loadHandler: Handler = async () => {
  const weeks = allWeeksAsc()
  const weeklyLoads = weeks.map((w) => {
    const done = completedSessionsOf(w.id as string)
    let load = 0, distance = 0, duration = 0, rpeLoad = 0
    for (const { session, comp } of done) {
      const dist = comp.distance || 0, factor = intensityFactor[session.type as string] || 1
      load += dist * factor; distance += dist; duration += comp.duration || 0
      if (comp.rpe && comp.duration) rpeLoad += comp.rpe * (comp.duration / 3600)
    }
    return { weekNumber: w.weekNumber ?? 0, weekStart: String(w.weekStart).slice(0, 10), weekEnd: String(w.weekEnd).slice(0, 10), phase: w.phase || 'base', load: Math.round(load * 10) / 10, rpeLoad: Math.round(rpeLoad * 10) / 10, distance: Math.round(distance * 10) / 10, duration, sessions: done.length }
  })
  const recent4 = weeklyLoads.slice(-4), recent1 = weeklyLoads.slice(-1)[0]
  let chronicLoad = 0, acuteLoad = 0, acwr = 0, loadStatus = 'no-data', riskLevel = 'unknown', advice = ''
  if (recent4.length > 0) chronicLoad = Math.round((recent4.reduce((s, w) => s + w.load, 0) / recent4.length) * 10) / 10
  if (recent1) acuteLoad = recent1.load
  if (chronicLoad > 0) {
    acwr = Math.round((acuteLoad / chronicLoad) * 100) / 100
    if (acwr < 0.8) { loadStatus = 'undertrained'; riskLevel = 'low'; advice = '训练负荷偏低，建议逐步增加跑量（每周增幅≤10%）。' }
    else if (acwr <= 1.3) { loadStatus = 'optimal'; riskLevel = 'safe'; advice = '训练负荷处于最佳区间，保持当前节奏，注意恢复。' }
    else if (acwr <= 1.5) { loadStatus = 'high'; riskLevel = 'caution'; advice = '训练负荷偏高，建议安排 1-2 天恢复跑或休息。' }
    else { loadStatus = 'dangerous'; riskLevel = 'danger'; advice = '⚠️ 训练负荷过高，伤病风险显著增加！建议立即减量。' }
  }
  const today = new Date(); today.setHours(23, 59, 59, 999)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000); sevenDaysAgo.setHours(0, 0, 0, 0)
  const twentyEightDaysAgo = new Date(today.getTime() - 28 * 86400000); twentyEightDaysAgo.setHours(0, 0, 0, 0)
  let acute7Days = 0, chronic28Days = 0
  for (const w of weeks) for (const { session, comp } of completedSessionsOf(w.id as string)) {
    const d = new Date(session.date as string), load = (comp.distance || 0) * (intensityFactor[session.type as string] || 1)
    if (d >= sevenDaysAgo && d <= today) acute7Days += load
    if (d >= twentyEightDaysAgo && d <= today) chronic28Days += load
  }
  chronic28Days = chronic28Days / 4
  const dailyACWR = chronic28Days > 0 ? Math.round((acute7Days / chronic28Days) * 100) / 100 : 0
  return json({ weeklyLoads: weeklyLoads.slice(-8), loadTrend: weeklyLoads.slice(-8).map((w) => ({ name: `W${w.weekNumber}`, load: w.load, distance: w.distance, phase: w.phase })), current: { acuteLoad: Math.round(acuteLoad * 10) / 10, chronicLoad, acwr, loadStatus, riskLevel, advice, acute7Days: Math.round(acute7Days * 10) / 10, chronic28Days: Math.round(chronic28Days * 10) / 10, dailyACWR }, summary: { totalWeeks: weeks.length, avgWeeklyLoad: weeklyLoads.length > 0 ? Math.round((weeklyLoads.reduce((s, w) => s + w.load, 0) / weeklyLoads.length) * 10) / 10 : 0, maxWeeklyLoad: weeklyLoads.length > 0 ? Math.max(...weeklyLoads.map((w) => w.load)) : 0 } })
}
const calendarHandler: Handler = async (req) => {
  const today = new Date()
  const year = req.query.get('year') ? parseInt(req.query.get('year') as string) : today.getFullYear()
  const month = req.query.get('month') ? parseInt(req.query.get('month') as string) - 1 : today.getMonth()
  const start = new Date(year, month, 1); start.setHours(0, 0, 0, 0)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  const days: Record<string, { date: string; sessions: unknown[]; totalDistance: number; completedCount: number }> = {}
  for (const w of all('SELECT * FROM TrainingWeek')) for (const s of all('SELECT * FROM TrainingSession WHERE weekId = ?', [w.id])) {
    const d = new Date(s.date as string)
    if (d < start || d > end) continue
    const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    if (!days[key]) days[key] = { date: key, sessions: [], totalDistance: 0, completedCount: 0 }
    const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id])
    const actual = c?.distance ?? null
    days[key].sessions.push({ id: s.id, type: s.type, status: s.status, plannedDistance: s.plannedDistance, actualDistance: actual, avgPace: c?.avgPace ?? null, avgHr: c?.avgHr ?? null, duration: c?.duration ?? null, intensity: s.intensity, weekId: w.id, sessionId: s.id, source: 'plan' })
    if (s.status === 'completed' && actual != null) { days[key].totalDistance += actual as number; days[key].completedCount++ }
  }
  // 合并独立历史训练记录（TrainingLog，补录数据）
  for (const log of logsBetween(start, end)) {
    const d = new Date(log.date)
    const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
    if (!days[key]) days[key] = { date: key, sessions: [], totalDistance: 0, completedCount: 0 }
    days[key].sessions.push({ id: log.id, type: 'log', status: 'completed', plannedDistance: null, actualDistance: log.distance ?? null, avgPace: log.avgPace ?? null, avgHr: log.avgHr ?? null, duration: log.duration ?? null, intensity: null, weekId: null, sessionId: null, source: 'log' })
    if (log.distance != null) { days[key].totalDistance += log.distance; days[key].completedCount++ }
  }
  const allDays = Object.values(days)
  const monthStats = { totalDistance: Math.round(allDays.reduce((s, d) => s + d.totalDistance, 0) * 10) / 10, totalRuns: allDays.reduce((s, d) => s + d.completedCount, 0), activeDays: allDays.filter((d) => d.completedCount > 0).length, totalDaysInMonth: new Date(year, month + 1, 0).getDate(), longestRun: Math.max(0, ...allDays.flatMap((d) => d.sessions.filter((s: { actualDistance: number | null }) => s.actualDistance != null).map((s: { actualDistance: number }) => s.actualDistance as number))) }
  return json({ year, month, monthLabel: `${year}年${month + 1}月`, days, monthStats })
}
const goalHandler: Handler = async () => {
  const runner = get('SELECT * FROM Runner LIMIT 1')
  if (!runner) return json({ error: '未找到跑者档案' }, 404)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let targetDate: Date | null = null, daysRemaining = 0, weeksRemaining = 0
  if (runner.targetDate) { targetDate = new Date(runner.targetDate as string); targetDate.setHours(0, 0, 0, 0); daysRemaining = Math.max(0, Math.ceil((targetDate.getTime() - today.getTime()) / 86400000)); weeksRemaining = Math.ceil(daysRemaining / 7) }
  const weeks = allWeeksAsc()
  const completed: { date: Date; distance: number; duration: number; avgPaceSec: number | null; avgHr: number | null }[] = []
  for (const w of weeks) for (const { session, comp } of completedSessionsOf(w.id as string)) completed.push({ date: new Date(session.date as string), distance: comp.distance || 0, duration: comp.duration || 0, avgPaceSec: comp.avgPaceSec ?? null, avgHr: comp.avgHr ?? null })
  const fourWeeksAgo = new Date(today.getTime() - 28 * 86400000)
  const recent = completed.filter((s) => s.date >= fourWeeksAgo)
  const recentDistance = recent.reduce((s, x) => s + x.distance, 0), recentDuration = recent.reduce((s, x) => s + x.duration, 0)
  const recentPaces = recent.map((s) => s.avgPaceSec).filter((v): v is number => v != null)
  const recentAvgPace = recentPaces.length > 0 ? Math.round(recentPaces.reduce((a, b) => a + b, 0) / recentPaces.length) : null
  const totalDistance = completed.reduce((s, x) => s + x.distance, 0), totalDuration = completed.reduce((s, x) => s + x.duration, 0), longestRun = completed.reduce((max, s) => Math.max(max, s.distance), 0)
  let estimatedMarathonSec: number | null = null, estimatedHalfSec: number | null = null, estimated10KSec: number | null = null
  if (completed.length > 0) {
    const benchmark = [...completed].filter((s) => s.distance >= 10 && s.duration > 0).sort((a, b) => b.date.getTime() - a.date.getTime())[0] || [...completed].sort((a, b) => b.date.getTime() - a.date.getTime())[0]
    if (benchmark && benchmark.distance > 0 && benchmark.duration > 0) {
      const riegel = (targetDist: number) => benchmark.duration * Math.pow(targetDist / benchmark.distance, 1.06)
      estimatedMarathonSec = Math.round(riegel(42.195)); estimatedHalfSec = Math.round(riegel(21.0975)); estimated10KSec = Math.round(riegel(10))
    }
  }
  let achievementProbability = 0, achievementAssessment = ''
  if (estimatedMarathonSec != null && runner.targetTime) {
    const m = String(runner.targetTime).match(/(\d+):(\d+):(\d+)/) || String(runner.targetTime).match(/(\d+):(\d+)/)
    if (m) {
      const targetSec = m.length === 4 ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) : parseInt(m[1]) * 3600 + parseInt(m[2]) * 60
      const ratio = targetSec / estimatedMarathonSec
      if (ratio >= 1.15) { achievementProbability = 90; achievementAssessment = '目标保守，达成概率高' }
      else if (ratio >= 1.05) { achievementProbability = 70; achievementAssessment = '目标合理，有望达成' }
      else if (ratio >= 0.95) { achievementProbability = 45; achievementAssessment = '目标有挑战，需全力以赴' }
      else if (ratio >= 0.85) { achievementProbability = 20; achievementAssessment = '目标偏激进，建议调整' }
      else { achievementProbability = 5; achievementAssessment = '目标过于激进，建议重新评估' }
    }
  }
  let suggestedPhase = '基础期', phaseAdvice = ''
  if (weeksRemaining > 16) { suggestedPhase = '基础期'; phaseAdvice = '有充足时间打有氧基础，循序渐进增加跑量' }
  else if (weeksRemaining > 8) { suggestedPhase = '强化期'; phaseAdvice = '增加质量课比例，提升乳酸阈值与最大摄氧量' }
  else if (weeksRemaining > 4) { suggestedPhase = '巅峰期'; phaseAdvice = '模拟比赛配速，最长距离接近 30km' }
  else if (weeksRemaining > 1) { suggestedPhase = '减量期'; phaseAdvice = '逐步减量保持强度，储备体能' }
  else { suggestedPhase = '比赛周'; phaseAdvice = '充分休息，保持轻松跑激活，准备参赛' }
  const weeklyDistances = weeks.map((w) => { const dist = completedSessionsOf(w.id as string).reduce((s, { comp }) => s + (comp.distance || 0), 0); return { week: w.weekNumber || 0, distance: Math.round(dist * 10) / 10, date: String(w.weekStart).slice(0, 10) } })
  return json({ runner: { name: runner.name, targetRace: runner.targetRace, targetDate: runner.targetDate, targetTime: runner.targetTime, weeklyMileage: runner.weeklyMileage }, timeline: { targetDate: targetDate?.toISOString() || null, daysRemaining, weeksRemaining, suggestedPhase, phaseAdvice }, recent: { distance4Weeks: Math.round(recentDistance * 10) / 10, duration4Weeks: recentDuration, avgPaceSec: recentAvgPace, sessionsCount: recent.length }, total: { distance: Math.round(totalDistance * 10) / 10, duration: totalDuration, sessions: completed.length, longestRun: Math.round(longestRun * 10) / 10 }, estimate: { marathonSec: estimatedMarathonSec, halfSec: estimatedHalfSec, tenKSec: estimated10KSec, marathonPaceSec: estimatedMarathonSec ? Math.round(estimatedMarathonSec / 42.195) : null }, target: { paceSec: null }, assessment: { probability: achievementProbability, text: achievementAssessment }, weeklyDistances: weeklyDistances.slice(-8) })
}
const achievementsHandler: Handler = async () => {
  const weeks = allWeeksAsc(), runner = get('SELECT * FROM Runner LIMIT 1'), shoes = all('SELECT * FROM Shoe'), records = all('SELECT * FROM PersonalRecord')
  const completed: { distance: number; duration: number }[] = []
  for (const w of weeks) for (const { comp } of completedSessionsOf(w.id as string)) completed.push({ distance: comp.distance || 0, duration: comp.duration || 0 })
  const totalDistance = completed.reduce((s, x) => s + x.distance, 0), totalDuration = completed.reduce((s, x) => s + x.duration, 0), totalRuns = completed.length, longestRun = completed.reduce((max, s) => Math.max(max, s.distance), 0), totalWeeks = weeks.length, maxStreak = totalRuns > 0 ? totalWeeks : 0
  const A = (id: string, category: string, icon: string, name: string, desc: string, target: number, current: number, unit: string, unlocked: boolean) => ({ id, category, icon, name, desc, target, current, unit, unlocked })
  const achievements = [
    A('first-run', 'distance', '🎯', '初次起跑', '完成第一次训练', 1, totalRuns, '次', totalRuns >= 1),
    A('runs-10', 'distance', '🏃', '十次训练', '累计完成 10 次训练', 10, totalRuns, '次', totalRuns >= 10),
    A('runs-50', 'distance', '🏃', '半百训练', '累计完成 50 次训练', 50, totalRuns, '次', totalRuns >= 50),
    A('runs-100', 'distance', '💯', '百次训练', '累计完成 100 次训练', 100, totalRuns, '次', totalRuns >= 100),
    A('dist-50', 'distance', '📍', '50 公里', '累计跑量达 50km', 50, Math.round(totalDistance), 'km', totalDistance >= 50),
    A('dist-100', 'distance', '🏅', '百公里', '累计跑量达 100km', 100, Math.round(totalDistance), 'km', totalDistance >= 100),
    A('dist-500', 'distance', '🥇', '五百公里', '累计跑量达 500km', 500, Math.round(totalDistance), 'km', totalDistance >= 500),
    A('dist-1000', 'distance', '🌟', '千公里', '累计跑量达 1000km', 1000, Math.round(totalDistance), 'km', totalDistance >= 1000),
    A('longest-10', 'distance', '🌄', '十公里长跑', '单次跑量达 10km', 10, Math.round(longestRun * 10) / 10, 'km', longestRun >= 10),
    A('longest-21', 'distance', '🏔', '半马距离', '单次跑量达 21.1km', 21.1, Math.round(longestRun * 10) / 10, 'km', longestRun >= 21.1),
    A('longest-42', 'distance', '🗻', '全马距离', '单次跑量达 42.2km', 42.2, Math.round(longestRun * 10) / 10, 'km', longestRun >= 42.2),
    A('streak-3', 'streak', '🔥', '三连训练', '连续 3 周有训练', 3, maxStreak, '周', maxStreak >= 3),
    A('streak-7', 'streak', '⚡', '七日连跑', '连续 7 天有训练', 7, maxStreak, '天', maxStreak >= 7),
    A('streak-30', 'streak', '🌟', '月度坚持', '连续 30 天有训练', 30, maxStreak, '天', maxStreak >= 30),
    A('weeks-4', 'streak', '📅', '一月训练', '完成 4 个训练周', 4, totalWeeks, '周', totalWeeks >= 4),
    A('weeks-12', 'streak', '📆', '季度训练', '完成 12 个训练周', 12, totalWeeks, '周', totalWeeks >= 12),
    A('weeks-26', 'streak', '🗓', '半年坚持', '完成 26 个训练周', 26, totalWeeks, '周', totalWeeks >= 26),
    A('time-10h', 'time', '⏰', '十小时训练', '累计训练 10 小时', 10, Math.round(totalDuration / 3600 * 10) / 10, 'h', totalDuration >= 36000),
    A('time-50h', 'time', '⌛', '五十小时训练', '累计训练 50 小时', 50, Math.round(totalDuration / 3600 * 10) / 10, 'h', totalDuration >= 180000),
    A('time-100h', 'time', '🕐', '百小时训练', '累计训练 100 小时', 100, Math.round(totalDuration / 3600 * 10) / 10, 'h', totalDuration >= 360000),
    A('shoes-1', 'special', '👟', '跑鞋管理', '添加第一双跑鞋', 1, shoes.length, '双', shoes.length >= 1),
    A('shoes-3', 'special', '👞', '跑鞋收藏家', '添加 3 双跑鞋', 3, shoes.length, '双', shoes.length >= 3),
    A('pb-1', 'special', '🥇', '首个 PB', '记录第一个个人最好成绩', 1, records.length, '项', records.length >= 1),
    A('pb-all', 'special', '📋', 'PB 大满贯', '记录全部 6 个距离的 PB', 6, records.length, '项', records.length >= 6),
    A('vo2max-50', 'special', '💪', 'VO2max 50+', 'VO2max 达到 50', 50, runner?.vo2max || 0, '', (runner?.vo2max || 0) >= 50),
    A('vo2max-60', 'special', '🔥', 'VO2max 60+', 'VO2max 达到 60（精英级）', 60, runner?.vo2max || 0, '', (runner?.vo2max || 0) >= 60),
  ]
  const unlockedCount = achievements.filter((a) => a.unlocked).length
  const categories = { distance: { label: '距离里程', icon: '🏃', achievements: achievements.filter((a) => a.category === 'distance') }, streak: { label: '坚持训练', icon: '🔥', achievements: achievements.filter((a) => a.category === 'streak') }, time: { label: '训练时长', icon: '⏰', achievements: achievements.filter((a) => a.category === 'time') }, special: { label: '特殊成就', icon: '🏆', achievements: achievements.filter((a) => a.category === 'special') } }
  return json({ achievements, categories, summary: { unlocked: unlockedCount, total: achievements.length, percent: Math.round((unlockedCount / achievements.length) * 100), totalDistance: Math.round(totalDistance * 10) / 10, totalRuns, totalWeeks, maxStreak, longestRun: Math.round(longestRun * 10) / 10, totalHours: Math.round(totalDuration / 3600 * 10) / 10 } })
}
const searchHandler: Handler = async (req) => {
  const q = (req.query.get('q') || '').trim().toLowerCase()
  if (!q) return json({ results: [], query: q, total: 0 })
  const like = `%${q}%`
  const results: { type: string; id: string; title: string; subtitle: string; meta: string; icon: string }[] = []
  for (const w of all('SELECT * FROM TrainingWeek WHERE goal LIKE ? OR phase LIKE ? OR summary LIKE ?', [like, like, like]).slice(0, 5)) {
    const cnt = all('SELECT COUNT(*) as c FROM TrainingSession WHERE weekId = ?', [w.id])[0].c as number
    const done = all("SELECT COUNT(*) as c FROM TrainingSession WHERE weekId = ? AND status = 'completed'", [w.id])[0].c as number
    results.push({ type: 'week', id: w.id as string, title: `第 ${w.weekNumber} 周 · ${w.phase || '训练周'}`, subtitle: String(w.goal || '训练周').slice(0, 60), meta: `${cnt} 节训练 · ${done} 完成`, icon: '📅' })
  }
  for (const s of all('SELECT * FROM TrainingSession WHERE type LIKE ? OR description LIKE ? OR intensity LIKE ?', [like, like, like]).slice(0, 8)) {
    const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]), w = get('SELECT * FROM TrainingWeek WHERE id = ?', [s.weekId])
    const labels: Record<string, string> = { easy: '轻松跑', tempo: '节奏跑', interval: '间歇跑', long: '长距离', recovery: '恢复跑', rest: '休息', cross: '交叉训练' }
    results.push({ type: 'session', id: s.id as string, title: `${labels[s.type as string] || s.type} · 第 ${w?.weekNumber || '?'} 周`, subtitle: String(s.description || '').slice(0, 60), meta: c ? `已完成 · ${c.distance}km @ ${c.avgPace || '-'}` : `${s.plannedDistance || 0}km · 待完成`, icon: s.status === 'completed' ? '✅' : '⏳' })
  }
  for (const sh of all('SELECT * FROM Shoe WHERE name LIKE ? OR brand LIKE ? OR model LIKE ?', [like, like, like]).slice(0, 5)) {
    const total = all('SELECT COALESCE(SUM(distance),0) as s FROM ShoeUsage WHERE shoeId = ?', [sh.id])[0].s as number
    results.push({ type: 'shoe', id: sh.id as string, title: `${sh.name}${sh.brand ? ` · ${sh.brand}` : ''}`, subtitle: (sh.model as string) || (sh.retired ? '已退役' : '在役'), meta: `${Math.round(total)}km / ${sh.lifespan}km (${Math.round((total / (sh.lifespan || 1)) * 100)}%)`, icon: '👟' })
  }
  for (const l of all('SELECT * FROM RecoveryLog WHERE notes LIKE ? OR preRunFuel LIKE ? OR duringFuel LIKE ? OR postRunFuel LIKE ?', [like, like, like, like]).slice(0, 5)) results.push({ type: 'recovery', id: l.id as string, title: `恢复记录 · ${String(l.date).slice(0, 10)}`, subtitle: String(l.notes || l.preRunFuel || '恢复记录').slice(0, 60), meta: `${l.sleepHours || '?'}h 睡眠 · ${l.waterIntake || '?'}L 饮水`, icon: '💚' })
  for (const r of all('SELECT * FROM PersonalRecord WHERE raceName LIKE ? OR location LIKE ? OR distance LIKE ?', [like, like, like]).slice(0, 5)) {
    const h = Math.floor((r.timeSec as number) / 3600), m = Math.floor(((r.timeSec as number) % 3600) / 60), s = (r.timeSec as number) % 60
    const t = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
    results.push({ type: 'record', id: r.id as string, title: `PB · ${r.distance} · ${t}`, subtitle: (r.raceName as string) || (r.location as string) || `${r.distanceKm}km 个人最好`, meta: `${String(r.date).slice(0, 10)}${r.raceName ? ' · ' + r.raceName : ''}`, icon: '🏆' })
  }
  return json({ results, query: q, total: results.length })
}

const configHandler: Handler = async () => {
  const { getDeepseekConfig } = await import('../config')
  const cfg = getDeepseekConfig()
  return json({ configured: !!cfg.apiKey, source: cfg.apiKey ? '本地配置（离线模式）' : '未配置', baseUrl: cfg.apiUrl, hasApiKey: !!cfg.apiKey })
}

const compareHandler: Handler = async (req) => {
  const id1 = req.query.get('id1'), id2 = req.query.get('id2')
  if (!id1 || !id2) return json({ error: '缺少 id1/id2' }, 400)
  const load = (id: string) => {
    const s = get('SELECT * FROM TrainingSession WHERE id = ?', [id])
    if (!s) return null
    const c = get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [id]), w = get('SELECT * FROM TrainingWeek WHERE id = ?', [s.weekId])
    let raw: Record<string, unknown> = {}
    if (c?.rawExtract) { try { raw = JSON.parse(c.rawExtract as string) } catch {} }
    return { id: s.id, date: s.date, weekNumber: w?.weekNumber || 0, phase: w?.phase || 'base', type: s.type, completion: { distance: c?.distance ?? null, avgPace: c?.avgPace ?? null, avgPaceSec: c?.avgPaceSec ?? null, duration: c?.duration ?? null, avgHr: c?.avgHr ?? null, maxHr: c?.maxHr ?? null, cadence: c?.cadence ?? null, elevation: c?.elevation ?? null, calories: c?.calories ?? null, hrCurve: raw.hrCurve ?? null, paceCurve: raw.paceCurve ?? null } }
  }
  const a = load(id1), b = load(id2)
  if (!a || !b) return json({ error: '训练不存在' }, 404)
  const num = (x: unknown): number | null => (typeof x === 'number' ? x : null)
  const d = (k: 'distance' | 'avgPaceSec' | 'duration' | 'avgHr' | 'maxHr' | 'cadence' | 'elevation' | 'calories') => { const av = num(a.completion[k]), bv = num(b.completion[k]); return av != null && bv != null ? (k === 'distance' || k === 'elevation' ? Math.round((bv - av) * 10) / 10 : bv - av) : null }
  return json({ session1: a, session2: b, diff: { distance: d('distance'), paceSec: d('avgPaceSec'), duration: d('duration'), avgHr: d('avgHr'), maxHr: d('maxHr'), cadence: d('cadence'), elevation: d('elevation'), calories: d('calories') } })
}

export function registerComputeHandlers(map: Map<string, Handler>): void {
  map.set('GET /api/stats', statsHandler)
  map.set('GET /api/load', loadHandler)
  map.set('GET /api/calendar', calendarHandler)
  map.set('GET /api/goal', goalHandler)
  map.set('GET /api/achievements', achievementsHandler)
  map.set('GET /api/search', searchHandler)
  map.set('GET /api/config', configHandler)
  map.set('GET /api/compare', compareHandler)
}