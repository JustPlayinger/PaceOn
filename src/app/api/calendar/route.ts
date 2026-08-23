import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 获取月度日历数据：某月每天的训练情况
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')

    const today = new Date()
    const year = yearParam ? parseInt(yearParam) : today.getFullYear()
    // 前端传 1-12，转为 0-11
    const month = monthParam ? parseInt(monthParam) - 1 : today.getMonth()

    // 当月起止
    const start = new Date(year, month, 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

    // 查询覆盖当月的所有周（可能跨月）
    const weeks = await db.trainingWeek.findMany({
      where: {
        OR: [
          { weekStart: { gte: start, lte: end } },
          { weekEnd: { gte: start, lte: end } },
          { AND: [{ weekStart: { lte: start } }, { weekEnd: { gte: end } }] },
        ],
      },
      include: {
        sessions: { include: { completion: true } },
      },
    })

    // 汇总每天的 sessions
    const days: Record<string, {
      date: string
      sessions: Array<{
        id: string
        type: string
        status: string
        plannedDistance: number | null
        actualDistance: number | null
        avgPace: string | null
        avgHr: number | null
        duration: number | null
        intensity: string | null
        weekId: string | null
        sessionId: string | null
        source: string // plan | log
      }>
      totalDistance: number
      completedCount: number
    }> = {}

    for (const w of weeks) {
      for (const s of w.sessions) {
        const d = new Date(s.date)
        // 仅归入当月
        if (d < start || d > end) continue
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
        if (!days[key]) {
          days[key] = {
            date: key,
            sessions: [],
            totalDistance: 0,
            completedCount: 0,
          }
        }
        const actual = s.completion?.distance ?? null
        days[key].sessions.push({
          id: s.id,
          type: s.type,
          status: s.status,
          plannedDistance: s.plannedDistance,
          actualDistance: actual,
          avgPace: s.completion?.avgPace ?? null,
          avgHr: s.completion?.avgHr ?? null,
          duration: s.completion?.duration ?? null,
          intensity: s.intensity,
          weekId: w.id,
          sessionId: s.id,
          source: 'plan',
        })
        if (s.status === 'completed' && actual != null) {
          days[key].totalDistance += actual
          days[key].completedCount++
        }
      }
    }

    // 合并独立历史训练记录（TrainingLog，补录数据）
    const logs = await db.trainingLog.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    })
    for (const log of logs) {
      const d = new Date(log.date)
      const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
      if (!days[key]) {
        days[key] = {
          date: key,
          sessions: [],
          totalDistance: 0,
          completedCount: 0,
        }
      }
      days[key].sessions.push({
        id: log.id,
        type: 'log',
        status: 'completed',
        plannedDistance: null,
        actualDistance: log.distance ?? null,
        avgPace: log.avgPace ?? null,
        avgHr: log.avgHr ?? null,
        duration: log.duration ?? null,
        intensity: null,
        weekId: null,
        sessionId: null,
        source: 'log',
      })
      if (log.distance != null) {
        days[key].totalDistance += log.distance
        days[key].completedCount++
      }
    }

    // 月度统计
    const allDays = Object.values(days)
    const monthStats = {
      totalDistance: Math.round(allDays.reduce((s, d) => s + d.totalDistance, 0) * 10) / 10,
      totalRuns: allDays.reduce((s, d) => s + d.completedCount, 0),
      activeDays: allDays.filter(d => d.completedCount > 0).length,
      totalDaysInMonth: new Date(year, month + 1, 0).getDate(),
      longestRun: Math.max(0, ...allDays.flatMap(d => d.sessions.filter(s => s.actualDistance != null).map(s => s.actualDistance as number))),
    }

    return NextResponse.json({
      year,
      month, // 0-11
      monthLabel: `${year}年${month + 1}月`,
      days,
      monthStats,
    })
  } catch (e) {
    console.error('Calendar error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
