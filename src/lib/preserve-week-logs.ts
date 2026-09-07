/**
 * 删除训练周期/周前，把其中已完成训练保留为独立 TrainingLog（日历数据与课表解耦，不被级联删除）
 */
import { db } from '@/lib/db'

export async function preserveWeekLogs(weekIds: string[]): Promise<number> {
  if (!weekIds.length) return 0
  const sessions = await db.trainingSession.findMany({ where: { weekId: { in: weekIds } }, include: { completion: true } })
  let n = 0
  for (const s of sessions) {
    const c = s.completion
    if (!c) continue
    const dup = await db.trainingLog.findFirst({ where: { date: s.date, distance: c.distance, duration: c.duration, source: 'preserved' } })
    if (dup) continue
    await db.trainingLog.create({
      data: {
        date: s.date,
        distance: c.distance, duration: c.duration, avgPace: c.avgPace, avgPaceSec: c.avgPaceSec,
        avgHr: c.avgHr, maxHr: c.maxHr, elevation: c.elevation, cadence: c.cadence, calories: c.calories,
        weather: c.weather, temperature: c.temperature, rpe: c.rpe, feeling: c.feeling, feelingNote: c.feelingNote,
        imageDataUrl: c.imageDataUrl, rawExtract: c.rawExtract, notes: c.notes, shoeId: c.shoeId,
        source: 'preserved',
      },
    })
    n++
  }
  return n
}
