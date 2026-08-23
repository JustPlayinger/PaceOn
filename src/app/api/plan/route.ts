import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateNextWeekPlan, generateInitialPlan, type SessionForReview, type RunnerProfile } from '@/lib/ai'
import { nextMondayOf, findWeekStartingOn, getOrCreateActivePlan } from '@/lib/plan-utils'

// 生成下周课表
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fromWeekId } = body as { fromWeekId?: string }

    const runner = await db.runner.findFirst()
    if (!runner) return NextResponse.json({ error: 'Runner profile not found. 请先在「跑者档案」中填写信息。' }, { status: 400 })

    const runnerProfile: RunnerProfile = {
      name: runner.name,
      age: runner.age,
      gender: runner.gender,
      weight: runner.weight,
      restingHr: runner.restingHr,
      maxHr: runner.maxHr,
      vo2max: runner.vo2max,
      experience: runner.experience,
      targetRace: runner.targetRace,
      targetDate: runner.targetDate,
      targetTime: runner.targetTime,
      weeklyMileage: runner.weeklyMileage,
      notes: runner.notes,
    }

    // 计算下周
    const nextMonday = nextMondayOf()
    const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)

    // 防重复：下周课表已存在则直接复用，不再重复创建
    const existingWeek = await findWeekStartingOn(nextMonday)
    if (existingWeek) {
      return NextResponse.json({
        week: existingWeek,
        plan: { phase: existingWeek.phase, weekGoal: existingWeek.goal, summary: existingWeek.summary },
        reused: true,
      })
    }

    // 唯一启用计划：全局同一时间只有一个 active=true
    const activePlan = await getOrCreateActivePlan()

    let plan
    let weekNumber = 1
    let lastReview: string | null = null
    let lastWeekSessions: SessionForReview[] = []
    let fromWeekFound = false

    if (fromWeekId) {
      const fromWeek = await db.trainingWeek.findUnique({
        where: { id: fromWeekId },
        include: {
          sessions: { include: { completion: true }, orderBy: { order: 'asc' } },
          reviews: { where: { type: 'weekly_review' }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      })
      if (fromWeek) {
        fromWeekFound = true
        weekNumber = (fromWeek.weekNumber ?? 1) + 1
        lastReview = fromWeek.reviews[0]?.content ?? null
        lastWeekSessions = fromWeek.sessions.map((s) => ({
          date: s.date.toISOString(),
          dayOfWeek: s.dayOfWeek,
          type: s.type,
          plannedDistance: s.plannedDistance,
          plannedDuration: s.plannedDuration,
          plannedPace: s.plannedPace,
          intensity: s.intensity,
          description: s.description,
          status: s.status,
          completion: s.completion
            ? {
                distance: s.completion.distance,
                duration: s.completion.duration,
                avgPace: s.completion.avgPace,
                avgPaceSec: s.completion.avgPaceSec,
                avgHr: s.completion.avgHr,
                maxHr: s.completion.maxHr,
                elevation: s.completion.elevation,
                cadence: s.completion.cadence,
                rpe: s.completion.rpe,
                feeling: s.completion.feeling,
                feelingNote: s.completion.feelingNote,
                weather: s.completion.weather,
                temperature: s.completion.temperature,
              }
            : null,
        }))
        plan = await generateNextWeekPlan(runnerProfile, lastWeekSessions, lastReview, weekNumber)
      }
    }

    if (!fromWeekFound) {
      // 无续接周：按当前启用计划内已有周数继续，否则从第 1 周开始
      const maxNum = await db.trainingWeek.aggregate({
        where: { planId: activePlan.id },
        _max: { weekNumber: true },
      })
      weekNumber = (maxNum._max.weekNumber ?? 0) + 1
    }

    if (!plan) {
      plan = await generateInitialPlan(runnerProfile)
    }

    // 创建下周（归入当前启用计划）
    const newWeek = await db.trainingWeek.create({
      data: {
        planId: activePlan.id,
        weekStart: nextMonday,
        weekEnd: nextSunday,
        weekNumber,
        phase: plan.phase,
        goal: plan.weekGoal,
        summary: plan.summary,
      },
    })

    // 创建 sessions
    for (let idx = 0; idx < plan.sessions.length; idx++) {
      const s = plan.sessions[idx]
      const date = new Date(nextMonday)
      date.setDate(nextMonday.getDate() + (s.dayOfWeek === 0 ? 6 : s.dayOfWeek - 1))
      await db.trainingSession.create({
        data: {
          weekId: newWeek.id,
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

    // 保存 plan_generation 记录
    await db.aIReview.create({
      data: {
        weekId: newWeek.id,
        type: 'plan_generation',
        content: plan.summary,
      },
    })

    const fullWeek = await db.trainingWeek.findUnique({
      where: { id: newWeek.id },
      include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
    })

    return NextResponse.json({ week: fullWeek, plan })
  } catch (e) {
    console.error('Plan error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
