import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateActivePlan } from '@/lib/plan-utils'

// 种子数据初始化：示例跑者 + 本周基础课表
export async function POST() {
  try {
    // 检查是否已有数据
    const existingRunner = await db.runner.findFirst()
    if (existingRunner) {
      return NextResponse.json({ message: '数据已存在，跳过种子初始化', runner: existingRunner })
    }

    // 创建示例跑者
    const runner = await db.runner.create({
      data: {
        name: '示例跑者',
        age: 30,
        gender: 'male',
        weight: 65,
        height: 175,
        restingHr: 50,
        maxHr: 190,
        vo2max: 52.5,
        experience: 'intermediate',
        targetRace: '全马',
        targetDate: '2026-12-06',
        targetTime: '3:45:00',
        weeklyMileage: 50,
        notes: '已完成 2 次半马，目标完成首个全马 sub 3:45。',
      },
    })

    // 本周课表（周一到周日）
    const today = new Date()
    const day = today.getDay()
    const monday = new Date(today)
    const diff = day === 0 ? -6 : 1 - day
    monday.setDate(today.getDate() + diff)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday.getTime() + 6 * 86400000)

    // 当前启用计划（唯一）
    const activePlan = await getOrCreateActivePlan()

    const week = await db.trainingWeek.create({
      data: {
        planId: activePlan.id,
        weekStart: monday,
        weekEnd: sunday,
        weekNumber: 1,
        phase: 'base',
        goal: '基础有氧打底，建立周跑量 50km 节奏，包含 1 次长跑与 1 次节奏跑。',
        summary: '第 1 周基础期课表。本周以 Z2 有氧为主，长跑 18km，节奏跑 8km。',
      },
    })

    const sessionsData = [
      { dow: 1, type: 'easy', dist: 8, dur: 50, pace: '5:40/km', intensity: 'Z2', desc: '轻松跑 8km，配速 5:40，保持鼻吸口呼，结束后 10 分钟拉伸。' },
      { dow: 2, type: 'rest', dist: null, dur: null, pace: null, intensity: 'rest', desc: '休息日，可选 20 分钟泡沫轴放松或瑜伽。' },
      { dow: 3, type: 'tempo', dist: 12, dur: 70, pace: '5:00/km', intensity: 'Z3-Z4', desc: '热身 2km → 节奏跑 8km @ 5:00/km → 冷身 2km。注意节奏段心率控制在 165-175。' },
      { dow: 4, type: 'easy', dist: 6, dur: 38, pace: '5:50/km', intensity: 'Z2', desc: '恢复跑 6km，配速 5:50，专注放松与步频 180+。' },
      { dow: 5, type: 'rest', dist: null, dur: null, pace: null, intensity: 'rest', desc: '休息日，建议轻度核心训练 15 分钟。' },
      { dow: 6, type: 'long', dist: 18, dur: 110, pace: '5:30/km', intensity: 'Z2', desc: '长跑 18km，配速 5:30，前 10km Z2，后 8km 可加速至 Z3 下限。补给：每 7km 一次能量胶。' },
      { dow: 0, type: 'recovery', dist: 5, dur: 32, pace: '6:10/km', intensity: 'Z1', desc: '恢复跑 5km，配速 6:10，促进排酸。可改为交叉训练（骑车/游泳）。' },
    ]

    for (let idx = 0; idx < sessionsData.length; idx++) {
      const s = sessionsData[idx]
      const date = new Date(monday)
      date.setDate(monday.getDate() + (s.dow === 0 ? 6 : s.dow - 1))
      await db.trainingSession.create({
        data: {
          weekId: week.id,
          date,
          dayOfWeek: s.dow,
          type: s.type,
          plannedDistance: s.dist,
          plannedDuration: s.dur,
          plannedPace: s.pace,
          intensity: s.intensity,
          description: s.desc,
          status: 'pending',
          order: idx,
        },
      })
    }

    const fullWeek = await db.trainingWeek.findUnique({
      where: { id: week.id },
      include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
    })

    return NextResponse.json({ runner, week: fullWeek, message: '种子数据初始化成功' })
  } catch (e) {
    console.error('Seed error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
