import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatWithCoach, generatePlanFromChat, type ChatMessage, type RunnerProfile, type SessionForReview, type RecentTrainingLog } from '@/lib/ai'
import { nextMondayOf, findWeekStartingOn, getOrCreateActivePlan } from '@/lib/plan-utils'

// 对话式课表生成
// POST /api/chat-plan  body: { action: 'chat', message, history }  -> AI 教练回复
// POST /api/chat-plan  body: { action: 'generate', history, fromWeekId? }  -> 生成课表

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body as { action: 'chat' | 'generate' }

    const runner = await db.runner.findFirst()
    const runnerProfile: RunnerProfile | null = runner ? {
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
    } : null

    // 近期实际训练记录（补录历史），供 AI 参考跑者当前状态
    const recentLogs: RecentTrainingLog[] = (await db.trainingLog.findMany({
      where: { date: { gte: new Date(Date.now() - 13 * 86400000) } },
      orderBy: { date: 'asc' },
    })).map((l) => ({
      date: l.date.toISOString().slice(0, 10),
      distance: l.distance,
      duration: l.duration,
      avgPace: l.avgPace,
      avgHr: l.avgHr,
      elevation: l.elevation,
      rpe: l.rpe,
      feeling: l.feeling,
      notes: l.notes,
    }))

    if (action === 'chat') {
      // 对话模式
      const { message, history } = body as { message: string; history: ChatMessage[] }
      if (!message) return NextResponse.json({ error: '请输入消息' }, { status: 400 })

      const result = await chatWithCoach(runnerProfile, history || [], message)
      return NextResponse.json(result)
    }

    if (action === 'generate') {
      // 生成课表模式
      const { history, fromWeekId } = body as { history: ChatMessage[]; fromWeekId?: string }

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
                }
              : null,
          }))
        }
      }

      // 防重复：下周课表已存在则直接复用
      const nextMonday = nextMondayOf()
      const existingWeek = await findWeekStartingOn(nextMonday)
      if (existingWeek) {
        return NextResponse.json({
          week: existingWeek,
          plan: { phase: existingWeek.phase, weekGoal: existingWeek.goal, summary: existingWeek.summary },
          reused: true,
        })
      }

      // 唯一启用计划
      const activePlan = await getOrCreateActivePlan()
      if (!fromWeekFound) {
        const maxNum = await db.trainingWeek.aggregate({
          where: { planId: activePlan.id },
          _max: { weekNumber: true },
        })
        weekNumber = (maxNum._max.weekNumber ?? 0) + 1
      }

      const plan = await generatePlanFromChat(runnerProfile, history || [], lastWeekSessions, lastReview, recentLogs)

      // 创建下周（归入当前启用计划）
      const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)

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

      // 保存对话记录到 AIReview
      await db.aIReview.create({
        data: {
          weekId: newWeek.id,
          type: 'chat_plan',
          content: history.map(m => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n\n'),
        },
      })

      const fullWeek = await db.trainingWeek.findUnique({
        where: { id: newWeek.id },
        include: { sessions: { include: { completion: true }, orderBy: { order: 'asc' } } },
      })

      return NextResponse.json({ week: fullWeek, plan })
    }

    return NextResponse.json({ error: '未知 action' }, { status: 400 })
  } catch (e) {
    console.error('Chat plan error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
