/**
 * 离线课表操作执行器：教练对话中解析出的 actions（改某天训练 / 删除某天安排 / 改本周目标）在此落库。
 * 已完成训练天会被保护：不覆盖、不删除（其数据保留在日历中）。
 */
import { all, get, run, uid, nowIso } from '../db'

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

function dayDate(weekStart: Date, dow: number): Date {
  const d = new Date(weekStart)
  d.setDate(weekStart.getDate() + (dow === 0 ? 6 : dow - 1))
  return d
}

function desc(a: AiWeekAction, typeLabel: string): string {
  if (a.type === 'rest') return '休息日，不安排训练。'
  const parts: string[] = []
  if (a.km) parts.push(a.km + 'km')
  if (a.pace) parts.push('配速 ' + a.pace)
  if (a.note) parts.push(a.note)
  if (!parts.length) parts.push(typeLabel)
  return parts.join('，')
}

export function applyWeekActions(weekId: string, actions: AiWeekAction[]): { done: string[]; skipped: string[] } {
  const week = get('SELECT * FROM TrainingWeek WHERE id = ?', [weekId])
  if (!week) throw new Error('未找到该周课表')
  const res: { done: string[]; skipped: string[] } = { done: [], skipped: [] }
  const now = nowIso()
  const start = new Date(String(week.weekStart))

  for (const a of actions) {
    if (a.op === 'goal') {
      run('UPDATE TrainingWeek SET goal = ?, updatedAt = ? WHERE id = ?', [a.text || null, now, weekId])
      res.done.push('本周目标已改为：' + (a.text || ''))
      continue
    }
    const dow = a.day
    if (dow === undefined || dow < 0 || dow > 6) {
      res.skipped.push('有一条操作缺少有效的日期，已跳过')
      continue
    }
    const s = get('SELECT * FROM TrainingSession WHERE weekId = ? AND dayOfWeek = ?', [weekId, dow]) || null
    const c = s ? get('SELECT * FROM TrainingCompletion WHERE sessionId = ?', [s.id]) || null : null
    const dayLabel = DAY_TXT[dow]

    if (a.op === 'clear') {
      if (!s) { res.skipped.push(dayLabel + '本来就没有训练安排，无需删除'); continue }
      if (c) { res.skipped.push(dayLabel + '已有完成的训练，已保留到日历，未删除课表安排'); continue }
      run('DELETE FROM TrainingSession WHERE id = ?', [s.id])
      res.done.push('已取消 ' + dayLabel + ' 的训练安排')
      continue
    }

    // op === 'set'
    const type = a.type || 'easy'
    if (type !== 'rest' && !TYPE_LABEL[type]) {
      res.skipped.push(dayLabel + '：不认识的训练类型 ' + type + '，已跳过')
      continue
    }
    if (c) {
      res.skipped.push(dayLabel + '已有完成的训练，已保留到日历，未改动课表')
      continue
    }
    const label = type === 'rest' ? '休息' : TYPE_LABEL[type]
    const noteText = desc(a, label)
    const intensity = type === 'rest' ? 'rest' : TYPE_INT[type]
    const planDist = type === 'rest' ? null : (typeof a.km === 'number' ? a.km : null)
    if (s) {
      run('UPDATE TrainingSession SET type = ?, plannedDistance = ?, plannedPace = ?, intensity = ?, description = ?, status = ?, updatedAt = ? WHERE id = ?', [type, planDist, a.pace || null, intensity, noteText, 'pending', now, s.id])
    } else {
      run('INSERT INTO TrainingSession (id, weekId, date, dayOfWeek, type, plannedDistance, plannedDuration, plannedPace, intensity, description, status, "order", createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [uid(), weekId, dayDate(start, dow).toISOString(), dow, type, planDist, null, a.pace || null, intensity, noteText, 'pending', 0, now, now])
    }
    res.done.push(dayLabel + ' 已安排为' + (type === 'rest' ? '休息' : label) + (typeof a.km === 'number' ? '（' + a.km + 'km）' : ''))
  }

  // 统一重排 order（按周一→周日）
  const sessions = all('SELECT * FROM TrainingSession WHERE weekId = ?', [weekId])
  sessions.sort((x, y) => ((x.dayOfWeek === 0 ? 7 : (x.dayOfWeek as number)) - (y.dayOfWeek === 0 ? 7 : (y.dayOfWeek as number))))
  sessions.forEach((sess, idx) => run('UPDATE TrainingSession SET "order" = ? WHERE id = ?', [idx, sess.id]))
  return res
}
