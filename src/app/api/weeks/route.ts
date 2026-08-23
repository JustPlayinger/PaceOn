import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { thisMondayOf, getOrCreateActivePlan } from '@/lib/plan-utils'

// 获取所有训练周（含 sessions 和 completion）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const current = searchParams.get('current')

    let weeks = await db.trainingWeek.findMany({
      include: {
        sessions: {
          include: { completion: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { weekStart: 'desc' },
    })

    if (current === 'true' && weeks.length > 0) {
      const monday = thisMondayOf()

      // 优先返回「当前启用计划」中的当前周 / 最近一周
      const activePlan = await db.trainingPlan.findFirst({ where: { active: true } })
      if (activePlan) {
        const planWeeks = weeks.filter((w) => w.planId === activePlan.id)
        if (planWeeks.length > 0) {
          const planCurrentWeek = planWeeks.find((w) => {
            const ws = new Date(w.weekStart)
            ws.setHours(0, 0, 0, 0)
            return ws.getTime() === monday.getTime()
          })
          if (planCurrentWeek) return NextResponse.json({ week: planCurrentWeek })
          return NextResponse.json({ week: planWeeks[0] })
        }
      }

      // 兜底：包含今天的周；仍无则取最新周
      const currentWeek = weeks.find((w) => {
        const ws = new Date(w.weekStart)
        ws.setHours(0, 0, 0, 0)
        return ws.getTime() === monday.getTime()
      })
      return NextResponse.json({ week: currentWeek || weeks[0] })
    }

    return NextResponse.json({ weeks })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 创建新训练周
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const weekStart = new Date(body.weekStart)
    const weekEnd = new Date(body.weekEnd || new Date(weekStart.getTime() + 6 * 86400000))

    // 归入当前启用计划
    const activePlan = await getOrCreateActivePlan()

    const week = await db.trainingWeek.create({
      data: {
        planId: activePlan.id,
        weekStart,
        weekEnd,
        weekNumber: body.weekNumber ?? null,
        phase: body.phase ?? null,
        goal: body.goal ?? null,
        summary: body.summary ?? null,
      },
    })

    // 批量创建 sessions
    if (Array.isArray(body.sessions) && body.sessions.length > 0) {
      await db.trainingSession.createMany({
        data: body.sessions.map((s: {
          dayOfWeek: number
          type: string
          plannedDistance?: number | null
          plannedDuration?: number | null
          plannedPace?: string | null
          intensity?: string | null
          description?: string
        }, idx: number) => {
          const date = new Date(weekStart)
          date.setDate(weekStart.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
          return {
            weekId: week.id,
            date,
            dayOfWeek: s.dayOfWeek,
            type: s.type,
            plannedDistance: s.plannedDistance ?? null,
            plannedDuration: s.plannedDuration ?? null,
            plannedPace: s.plannedPace ?? null,
            intensity: s.intensity ?? null,
            description: s.description ?? '',
            order: idx,
          }
        }),
      })
    }

    const fullWeek = await db.trainingWeek.findUnique({
      where: { id: week.id },
      include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
    })
    return NextResponse.json({ week: fullWeek })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
