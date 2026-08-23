import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 导入训练数据（JSON 格式，从备份恢复）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { data, mode } = body as { data: Record<string, unknown>; mode?: 'merge' | 'replace' }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: '无效的导入数据' }, { status: 400 })
    }

    const importMode = mode || 'merge'
    let imported = { runner: 0, weeks: 0, sessions: 0, completions: 0, shoes: 0, usages: 0, recovery: 0, reviews: 0 }

    // replace 模式：先清空所有数据
    if (importMode === 'replace') {
      await db.shoeUsage.deleteMany()
      await db.recoveryLog.deleteMany()
      await db.aIReview.deleteMany()
      await db.trainingCompletion.deleteMany()
      await db.trainingSession.deleteMany()
      await db.trainingWeek.deleteMany()
      await db.trainingPlan.deleteMany()
      await db.shoe.deleteMany()
      await db.runner.deleteMany()
    }

    // 导入 Runner
    const runnerData = data.runner as Record<string, unknown> | null
    if (runnerData && runnerData.name) {
      const existing = await db.runner.findFirst()
      if (!existing || importMode === 'replace') {
        await db.runner.create({
          data: {
            name: String(runnerData.name),
            age: runnerData.age != null ? Number(runnerData.age) : null,
            gender: runnerData.gender ? String(runnerData.gender) : null,
            weight: runnerData.weight != null ? Number(runnerData.weight) : null,
            height: runnerData.height != null ? Number(runnerData.height) : null,
            restingHr: runnerData.restingHr != null ? Number(runnerData.restingHr) : null,
            maxHr: runnerData.maxHr != null ? Number(runnerData.maxHr) : null,
            vo2max: runnerData.vo2max != null ? Number(runnerData.vo2max) : null,
            experience: runnerData.experience ? String(runnerData.experience) : null,
            targetRace: runnerData.targetRace ? String(runnerData.targetRace) : null,
            targetDate: runnerData.targetDate ? String(runnerData.targetDate) : null,
            targetTime: runnerData.targetTime ? String(runnerData.targetTime) : null,
            weeklyMileage: runnerData.weeklyMileage != null ? Number(runnerData.weeklyMileage) : null,
            notes: runnerData.notes ? String(runnerData.notes) : null,
          },
        })
        imported.runner = 1
      }
    }

    // 导入训练周期（旧备份无 plans 时，按周 planId 兜底重建）
    const plansData = data.plans as Array<Record<string, unknown>> | undefined
    if (Array.isArray(plansData)) {
      for (const p of plansData) {
        const pid = p.id ? String(p.id) : undefined
        const existingPlan = pid ? await db.trainingPlan.findUnique({ where: { id: pid } }) : null
        if (existingPlan) {
          if (p.title) await db.trainingPlan.update({ where: { id: existingPlan.id }, data: { title: String(p.title) } })
        } else {
          await db.trainingPlan.create({
            data: {
              id: pid || undefined,
              title: p.title ? String(p.title) : '我的训练计划',
              goal: p.goal ? String(p.goal) : null,
              targetRace: p.targetRace ? String(p.targetRace) : null,
              active: p.active != null ? Boolean(p.active) : false,
              startedAt: p.startedAt ? new Date(String(p.startedAt)) : new Date(),
            },
          })
        }
      }
    }

    // 导入 Weeks + Sessions + Completions + Reviews
    const weeksData = data.weeks as Array<Record<string, unknown>> | undefined
    if (Array.isArray(weeksData)) {
      for (const w of weeksData) {
        const weekStart = new Date(String(w.weekStart))
        const existingWeek = await db.trainingWeek.findFirst({
          where: { weekStart },
        })
        if (existingWeek && importMode === 'merge') continue

        // 确定周所属的训练周期
        let planId: string | null = w.planId ? String(w.planId) : null
        if (planId) {
          const p = await db.trainingPlan.findUnique({ where: { id: planId } })
          if (!p) {
            await db.trainingPlan.create({
              data: { id: planId, title: '我的训练计划', active: false },
            })
          }
        } else {
          const activePlan = await db.trainingPlan.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } })
          if (activePlan) planId = activePlan.id
        }

        const newWeek = await db.trainingWeek.create({
          data: {
            planId,
            weekStart,
            weekEnd: new Date(String(w.weekEnd)),
            weekNumber: w.weekNumber != null ? Number(w.weekNumber) : null,
            phase: w.phase ? String(w.phase) : null,
            goal: w.goal ? String(w.goal) : null,
            summary: w.summary ? String(w.summary) : null,
          },
        })
        imported.weeks++

        const sessionsData = w.sessions as Array<Record<string, unknown>> | undefined
        if (Array.isArray(sessionsData)) {
          for (const s of sessionsData) {
            const newSession = await db.trainingSession.create({
              data: {
                weekId: newWeek.id,
                date: new Date(String(s.date)),
                dayOfWeek: Number(s.dayOfWeek),
                type: String(s.type),
                plannedDistance: s.plannedDistance != null ? Number(s.plannedDistance) : null,
                plannedDuration: s.plannedDuration != null ? Number(s.plannedDuration) : null,
                plannedPace: s.plannedPace ? String(s.plannedPace) : null,
                intensity: s.intensity ? String(s.intensity) : null,
                description: s.description ? String(s.description) : '',
                status: String(s.status || 'pending'),
                order: Number(s.order || 0),
              },
            })
            imported.sessions++

            const c = s.completion as Record<string, unknown> | null
            if (c && c.distance != null) {
              await db.trainingCompletion.create({
                data: {
                  sessionId: newSession.id,
                  distance: c.distance != null ? Number(c.distance) : null,
                  duration: c.duration != null ? Number(c.duration) : null,
                  avgPace: c.avgPace ? String(c.avgPace) : null,
                  avgPaceSec: c.avgPaceSec != null ? Number(c.avgPaceSec) : null,
                  avgHr: c.avgHr != null ? Number(c.avgHr) : null,
                  maxHr: c.maxHr != null ? Number(c.maxHr) : null,
                  elevation: c.elevation != null ? Number(c.elevation) : null,
                  cadence: c.cadence != null ? Number(c.cadence) : null,
                  calories: c.calories != null ? Number(c.calories) : null,
                  weather: c.weather ? String(c.weather) : null,
                  temperature: c.temperature != null ? Number(c.temperature) : null,
                  rpe: c.rpe != null ? Number(c.rpe) : null,
                  feeling: c.feeling != null ? Number(c.feeling) : null,
                  feelingNote: c.feelingNote ? String(c.feelingNote) : null,
                  imageDataUrl: c.imageDataUrl ? String(c.imageDataUrl) : null,
                  rawExtract: c.rawExtract ? String(c.rawExtract) : null,
                  notes: c.notes ? String(c.notes) : null,
                  shoeId: c.shoeId ? String(c.shoeId) : null,
                },
              })
              imported.completions++
            }
          }
        }

        const reviewsData = w.reviews as Array<Record<string, unknown>> | undefined
        if (Array.isArray(reviewsData)) {
          for (const r of reviewsData) {
            await db.aIReview.create({
              data: {
                weekId: newWeek.id,
                type: String(r.type),
                content: String(r.content),
                rating: r.rating != null ? Number(r.rating) : null,
                suggestions: r.suggestions ? String(r.suggestions) : null,
              },
            })
            imported.reviews++
          }
        }
      }
    }

    // 导入 Shoes + Usages
    const shoesData = data.shoes as Array<Record<string, unknown>> | undefined
    if (Array.isArray(shoesData)) {
      for (const sh of shoesData) {
        const newShoe = await db.shoe.create({
          data: {
            name: String(sh.name),
            brand: sh.brand ? String(sh.brand) : null,
            model: sh.model ? String(sh.model) : null,
            type: String(sh.type || 'daily'),
            color: sh.color ? String(sh.color) : null,
            purchasedAt: sh.purchasedAt ? new Date(String(sh.purchasedAt)) : new Date(),
            lifespan: sh.lifespan != null ? Number(sh.lifespan) : 800,
            retired: Boolean(sh.retired),
            notes: sh.notes ? String(sh.notes) : null,
          },
        })
        imported.shoes++

        const usagesData = sh.usages as Array<Record<string, unknown>> | undefined
        if (Array.isArray(usagesData)) {
          for (const u of usagesData) {
            await db.shoeUsage.create({
              data: {
                shoeId: newShoe.id,
                distance: Number(u.distance),
                date: u.date ? new Date(String(u.date)) : new Date(),
                note: u.note ? String(u.note) : null,
              },
            })
            imported.usages++
          }
        }
      }
    }

    // 导入 RecoveryLogs
    const recoveryData = data.recoveryLogs as Array<Record<string, unknown>> | undefined
    if (Array.isArray(recoveryData)) {
      for (const l of recoveryData) {
        const date = new Date(String(l.date))
        const existing = await db.recoveryLog.findUnique({ where: { date } })
        if (existing && importMode === 'merge') continue
        await db.recoveryLog.create({
          data: {
            date,
            sleepHours: l.sleepHours != null ? Number(l.sleepHours) : null,
            sleepQuality: l.sleepQuality != null ? Number(l.sleepQuality) : null,
            waterIntake: l.waterIntake != null ? Number(l.waterIntake) : null,
            nutrition: l.nutrition != null ? Number(l.nutrition) : null,
            muscleSoreness: l.muscleSoreness != null ? Number(l.muscleSoreness) : null,
            fatigue: l.fatigue != null ? Number(l.fatigue) : null,
            mood: l.mood != null ? Number(l.mood) : null,
            preRunFuel: l.preRunFuel ? String(l.preRunFuel) : null,
            duringFuel: l.duringFuel ? String(l.duringFuel) : null,
            postRunFuel: l.postRunFuel ? String(l.postRunFuel) : null,
            notes: l.notes ? String(l.notes) : null,
          },
        })
        imported.recovery++
      }
    }

    return NextResponse.json({ success: true, imported })
  } catch (e) {
    console.error('Import error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
