import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 切换训练周期启用状态（全局仅一个启用）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    if (body.active === true) {
      await db.trainingPlan.updateMany({ where: { active: true }, data: { active: false } })
      await db.trainingPlan.update({ where: { id }, data: { active: true } })
    } else if (body.title) {
      await db.trainingPlan.update({ where: { id }, data: { title: String(body.title) } })
    }

    const plan = await db.trainingPlan.findUnique({
      where: { id },
      include: {
        weeks: { include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } } },
      },
    })
    return NextResponse.json({ plan })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 删除训练周期（连同其下所有周、训练课、完成记录、点评）
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const plan = await db.trainingPlan.findUnique({ where: { id } })
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const weekIds = (await db.trainingWeek.findMany({ where: { planId: id }, select: { id: true } })).map((w) => w.id)
    if (weekIds.length > 0) {
      await db.trainingCompletion.deleteMany({ where: { session: { weekId: { in: weekIds } } } })
      await db.trainingSession.deleteMany({ where: { weekId: { in: weekIds } } })
      await db.aIReview.deleteMany({ where: { weekId: { in: weekIds } } })
      await db.trainingWeek.deleteMany({ where: { id: { in: weekIds } } })
    }
    await db.trainingPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
