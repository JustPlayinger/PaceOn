/**
 * 在线（Prisma）课表操作执行器：对话中解析出的 actions（改某天 / 删某天安排 / 改本周目标）落库。
 * 已完成训练天会被保护：不覆盖、不删除。
 */
import { db } from '@/lib/db'

export interface AiWeekAction {
  op: 'set' | 'clear' | 'goal'
  day?: number
  type?: string
  km?: number | null
  pace?: string | null
  note?: string | null
  text?: string | null
}

const DAY_TXT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const TYPE_LABEL: Record<string, string> = { easy: '轻松跑', tempo: '节奏跑', interval: '间歇跑', long: '长距离', recovery: '恢复跑', cross: '交叉训练', rest: '休息' }
const TYPE_INT: Record<string, string> = { easy: 'Z2', tempo: 'Z3-Z4', interval: 'Z4-Z5', long: 'Z2', recovery: 'Z1', cross: 'Z1-Z2', rest: 'rest' }

export async function applyWeekActions(weekId: string, actions: AiWeekAction[]): Promise<{ done: string[]; skipped: string[] }> {
  const week = await db.trainingWeek.findUnique({ where: { id: weekId }, include: { sessions: { include: { completion: true } } } })
  if (!week) throw new Error('未找到该周课表')
  const res: { done: string[]; skipped: string[] } = { done: [], skipped: [] }
  const start = new Date(week.weekStart)
  const dayDate = (dow: number) => { const d = new Date(start); d.setDate(start.getDate() + (dow === 0 ? 6 : dow - 1)); return d }

  for (const a of actions) {
    if (a.op === 'goal') {
      await db.trainingWeek.update({ where: { id: weekId }, data: { goal: a.text || null } })
      res.done.push('本周目标已改为：' + (a.text || ''))
      continue
    }
    const dow = a.day
    if (dow === undefined || dow < 0 || dow > 6) { res.skipped.push('有一条操作缺少有效的日期，已跳过'); continue }
    const s = week.sessions.find((x) => x.dayOfWeek === dow)
    const dayLabel = DAY_TXT[dow]

    if (a.op === 'clear') {
      if (!s) { res.skipped.push(dayLabel + '本来就没有训练安排，无需删除'); continue }
      if (s.completion) { res.skipped.push(dayLabel + '已有完成的训练，已保留到日历，未删除课表安排'); continue }
      await db.trainingSession.delete({ where: { id: s.id } })
      res.done.push('已取消 ' + dayLabel + ' 的训练安排')
      continue
    }

    const type = a.type || 'easy'
    if (type !== 'rest' && !TYPE_LABEL[type]) { res.skipped.push(dayLabel + '：不认识的训练类型 ' + type + '，已跳过'); continue }
    if (s?.completion) { res.skipped.push(dayLabel + '已有完成的训练，已保留到日历，未改动课表'); continue }
    const label = type === 'rest' ? '休息' : TYPE_LABEL[type]
    const parts: string[] = []
    if (a.km) parts.push(String(a.km) + 'km')
    if (a.pace) parts.push('配速 ' + a.pace)
    if (a.note) parts.push(a.note)
    const noteText = type === 'rest' ? '休息日，不安排训练。' : (parts.length ? parts.join('，') : label)
    const intensity = type === 'rest' ? 'rest' : TYPE_INT[type]
    const planDist = type === 'rest' ? null : (typeof a.km === 'number' ? a.km : null)
    const data = { type, plannedDistance: planDist, plannedPace: a.pace || null, intensity, description: noteText, status: 'pending' as const }
    if (s) await db.trainingSession.update({ where: { id: s.id }, data })
    else await db.trainingSession.create({ data: { ...data, weekId, date: dayDate(dow), dayOfWeek: dow } })
    res.done.push(dayLabel + ' 已安排为' + (type === 'rest' ? '休息' : label) + (typeof a.km === 'number' ? '（' + a.km + 'km）' : ''))
  }

  // 统一重排 order
  const sessions = await db.trainingSession.findMany({ where: { weekId }, orderBy: { date: 'asc' } })
  for (let i = 0; i < sessions.length; i++) await db.trainingSession.update({ where: { id: sessions[i].id }, data: { order: i } })
  return res
}
