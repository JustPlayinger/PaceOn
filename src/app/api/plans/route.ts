import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 获取所有训练周期（含其下的周与训练课）
export async function GET() {
  try {
    // 兜底迁移：无周期但有训练周时，自动创建默认周期并把遗留周归入
    const weekCount = await db.trainingWeek.count()
    const planCount = await db.trainingPlan.count()
    if (weekCount > 0 && planCount === 0) {
      await db.trainingPlan.updateMany({ where: { active: true }, data: { active: false } })
      const plan = await db.trainingPlan.create({ data: { title: '我的训练计划', active: true } })
      await db.trainingWeek.updateMany({ where: { planId: null }, data: { planId: plan.id } })
    }

    const plans = await db.trainingPlan.findMany({
      include: {
        weeks: {
          include: {
            sessions: { include: { completion: true }, orderBy: { order: 'asc' } },
            reviews: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { weekStart: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ plans })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 新建训练周期（同时置为当前启用；其余计划自动取消启用）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const title = body.title ? String(body.title) : '我的训练计划'

    await db.trainingPlan.updateMany({ where: { active: true }, data: { active: false } })
    const plan = await db.trainingPlan.create({
      data: {
        title,
        goal: body.goal ? String(body.goal) : null,
        targetRace: body.targetRace ? String(body.targetRace) : null,
        active: true,
      },
    })
    return NextResponse.json({ plan })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
