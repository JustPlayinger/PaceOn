import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { TRAINING_TEMPLATES } from '@/lib/templates'
import { nextMondayOf, findWeekStartingOn, getOrCreateActivePlan } from '@/lib/plan-utils'

// 获取所有模板
export async function GET() {
  try {
    return NextResponse.json({ templates: TRAINING_TEMPLATES })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 应用模板：生成新一周课表（基于模板的 sampleWeek）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { templateId, weekNumber } = body as { templateId: string; weekNumber?: number }

    const template = TRAINING_TEMPLATES.find(t => t.id === templateId)
    if (!template) {
      return NextResponse.json({ error: '模板不存在' }, { status: 404 })
    }

    const runner = await db.runner.findFirst()
    if (!runner) {
      return NextResponse.json({ error: '请先在跑者档案中填写信息' }, { status: 400 })
    }

    // 计算下周的周一
    const nextMonday = nextMondayOf()
    const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)

    // 防重复：下周课表已存在则直接复用
    const existingWeek = await findWeekStartingOn(nextMonday)
    if (existingWeek) {
      return NextResponse.json({ week: existingWeek, template, reused: true })
    }

    // 唯一启用计划
    const activePlan = await getOrCreateActivePlan()

    // 确定 weekNumber
    const maxNum = await db.trainingWeek.aggregate({
      where: { planId: activePlan.id },
      _max: { weekNumber: true },
    })
    const wNum = weekNumber ?? (maxNum._max.weekNumber ?? 0) + 1

    // 创建训练周（归入当前启用计划）
    const week = await db.trainingWeek.create({
      data: {
        planId: activePlan.id,
        weekStart: nextMonday,
        weekEnd: nextSunday,
        weekNumber: wNum,
        phase: template.sampleWeek.phase,
        goal: template.sampleWeek.weekGoal,
        summary: `基于模板「${template.name}」生成。${template.description}`,
      },
    })

    // 创建 sessions
    for (let idx = 0; idx < template.sampleWeek.sessions.length; idx++) {
      const s = template.sampleWeek.sessions[idx]
      const date = new Date(nextMonday)
      date.setDate(nextMonday.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
      await db.trainingSession.create({
        data: {
          weekId: week.id,
          date,
          dayOfWeek: s.dayOfWeek,
          type: s.type,
          plannedDistance: s.plannedDistance,
          plannedDuration: s.plannedDuration,
          plannedPace: s.plannedPace,
          intensity: s.intensity,
          description: s.description,
          status: 'pending',
          order: idx,
        },
      })
    }

    const fullWeek = await db.trainingWeek.findUnique({
      where: { id: week.id },
      include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
    })

    return NextResponse.json({ week: fullWeek, template })
  } catch (e) {
    console.error('Template apply error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
