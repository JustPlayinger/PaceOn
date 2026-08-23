import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 导出所有训练数据为 JSON（备份）
export async function GET() {
  try {
    const runner = await db.runner.findFirst()
    const plans = await db.trainingPlan.findMany({
      orderBy: { createdAt: 'asc' },
    })
    const weeks = await db.trainingWeek.findMany({
      include: {
        sessions: {
          include: { completion: true },
          orderBy: { order: 'asc' },
        },
        reviews: true,
      },
      orderBy: { weekStart: 'asc' },
    })
    const shoes = await db.shoe.findMany({
      include: { usages: true },
      orderBy: { createdAt: 'asc' },
    })
    const recoveryLogs = await db.recoveryLog.findMany({
      orderBy: { date: 'asc' },
    })

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      plans: plans.map(p => ({
        ...p,
        startedAt: p.startedAt.toISOString(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      runner,
      weeks: weeks.map(w => ({
        ...w,
        weekStart: w.weekStart.toISOString(),
        weekEnd: w.weekEnd.toISOString(),
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
        sessions: w.sessions.map(s => ({
          ...s,
          date: s.date.toISOString(),
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          completion: s.completion ? {
            ...s.completion,
            createdAt: s.completion.createdAt.toISOString(),
            updatedAt: s.completion.updatedAt.toISOString(),
          } : null,
        })),
        reviews: w.reviews.map(r => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      })),
      shoes: shoes.map(s => ({
        ...s,
        purchasedAt: s.purchasedAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        usages: s.usages.map(u => ({
          ...u,
          date: u.date.toISOString(),
          createdAt: u.createdAt.toISOString(),
        })),
      })),
      recoveryLogs: recoveryLogs.map(l => ({
        ...l,
        date: l.date.toISOString(),
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
    }

    return NextResponse.json(exportData)
  } catch (e) {
    console.error('Export error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
