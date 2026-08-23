import { db } from '@/lib/db'

/** 下周一的 0 点 */
export function nextMondayOf(today = new Date()): Date {
  const day = today.getDay()
  const nextMonday = new Date(today)
  const diff = day === 0 ? 1 : 8 - day
  nextMonday.setDate(today.getDate() + diff)
  nextMonday.setHours(0, 0, 0, 0)
  return nextMonday
}

/** 本周一的 0 点（今天所在周的周一） */
export function thisMondayOf(today = new Date()): Date {
  const day = today.getDay()
  const monday = new Date(today)
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(today.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/** 按「周一日期」查找已存在的训练周（防重复创建的关键） */
export async function findWeekStartingOn(nextMonday: Date) {
  const start = new Date(nextMonday)
  const end = new Date(start.getTime() + 86400000)
  return db.trainingWeek.findFirst({
    where: { weekStart: { gte: start, lt: end } },
    include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
  })
}

/**
 * 获取当前启用计划；若不存在则把其它计划全部置为非启用后新建。
 * 保证全局同一时间只有一个 active=true 的计划。
 */
export async function getOrCreateActivePlan(): Promise<{ id: string; title: string }> {
  let plan = await db.trainingPlan.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } })
  if (plan) return { id: plan.id, title: plan.title }
  await db.trainingPlan.updateMany({ where: { active: true }, data: { active: false } })
  const runner = await db.runner.findFirst()
  plan = await db.trainingPlan.create({
    data: {
      title: '我的训练计划',
      goal: runner?.notes ?? null,
      targetRace: runner?.targetRace ?? null,
      active: true,
    },
  })
  return { id: plan.id, title: plan.title }
}
