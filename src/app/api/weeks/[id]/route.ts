import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { preserveWeekLogs } from '@/lib/preserve-week-logs'

// 获取单个训练周详情
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const week = await db.trainingWeek.findUnique({
      where: { id },
      include: {
        sessions: { include: { completion: true }, orderBy: { order: 'asc' } },
        reviews: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!week) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ week })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 更新训练周元信息（goal/phase/summary）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const week = await db.trainingWeek.update({
      where: { id },
      data: {
        goal: body.goal ?? undefined,
        phase: body.phase ?? undefined,
        summary: body.summary ?? undefined,
        weekNumber: body.weekNumber ?? undefined,
      },
    })
    return NextResponse.json({ week })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 删除训练周
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // 先保留该周已完成训练为独立历史记录，再删除课表（日历数据不被级联删除）
    await preserveWeekLogs([id])
    await db.trainingWeek.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
