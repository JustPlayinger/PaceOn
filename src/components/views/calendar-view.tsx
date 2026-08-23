'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, ChevronLeft, ChevronRight, TrendingUp, Activity, Flame, Mountain, Loader2, Footprints, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { SESSION_TYPES } from '@/lib/training'

interface DaySession {
  id: string
  type: string
  status: string
  plannedDistance: number | null
  actualDistance: number | null
  avgPace: string | null
  avgHr: number | null
  duration: number | null
  intensity: string | null
  weekId: string | null
  sessionId: string | null
  source: string
}

interface DayData {
  date: string
  sessions: DaySession[]
  totalDistance: number
  completedCount: number
}

interface CalendarData {
  year: number
  month: number
  monthLabel: string
  days: Record<string, DayData>
  monthStats: {
    totalDistance: number
    totalRuns: number
    activeDays: number
    totalDaysInMonth: number
    longestRun: number
  }
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

// 强度颜色（基于训练类型 + 完成状态）
function getDayColor(day: DayData | undefined): { bg: string; border: string; text: string } {
  if (!day || day.sessions.length === 0) {
    return { bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-300' }
  }
  const completed = day.sessions.filter(s => s.status === 'completed')
  const hasRest = day.sessions.some(s => s.type === 'rest')
  if (completed.length === 0) {
    // 待完成
    return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' }
  }
  if (hasRest && completed.length === 0) {
    return { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-500' }
  }
  // 根据距离决定颜色深浅
  const dist = day.totalDistance
  if (dist >= 20) return { bg: 'bg-emerald-600', border: 'border-emerald-700', text: 'text-white' }
  if (dist >= 15) return { bg: 'bg-emerald-500', border: 'border-emerald-600', text: 'text-white' }
  if (dist >= 10) return { bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-white' }
  if (dist >= 5) return { bg: 'bg-emerald-300', border: 'border-emerald-400', text: 'text-emerald-900' }
  return { bg: 'bg-emerald-200', border: 'border-emerald-300', text: 'text-emerald-800' }
}

export function CalendarView({ onAddLog }: { onAddLog?: (date: string) => void }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const loadCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/calendar?year=${year}&month=${month + 1}`)
      const d = await res.json()
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    loadCalendar()
  }, [loadCalendar])

  const goPrevMonth = () => {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
    setSelectedDay(null)
  }
  const goNextMonth = () => {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
    setSelectedDay(null)
  }
  const goToday = () => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth())
    setSelectedDay(null)
  }

  // 生成日历网格（含月初空白）
  const firstDay = new Date(year, month, 1)
  // 周一=0, 周日=6
  const firstDayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (string | null)[] = []
  for (let i = 0; i < firstDayOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
    cells.push(key)
  }
  // 补齐到 7 的倍数
  while (cells.length % 7 !== 0) cells.push(null)

  const todayKey = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 头部 + 月份导航 */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">训练日历</h2>
              <p className="text-xs text-slate-500">月度训练强度热力图 · 点击日期查看详情</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrevMonth} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-3 py-1 rounded-lg bg-white border border-slate-200 min-w-[120px] text-center">
              <span className="text-sm font-semibold text-slate-800">{data?.monthLabel || `${year}-${month + 1}`}</span>
            </div>
            <Button variant="outline" size="sm" onClick={goNextMonth} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToday} className="h-8 text-xs text-slate-600">今天</Button>
          </div>
        </div>

        {/* 月度统计 */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MonthStat icon={<TrendingUp className="h-4 w-4" />} label="月总距离" value={`${data.monthStats.totalDistance}`} unit="km" color="emerald" />
            <MonthStat icon={<Footprints className="h-4 w-4" />} label="训练次数" value={`${data.monthStats.totalRuns}`} unit="次" color="sky" />
            <MonthStat icon={<Activity className="h-4 w-4" />} label="活跃天数" value={`${data.monthStats.activeDays}`} unit={`/ ${data.monthStats.totalDaysInMonth} 天`} color="orange" />
            <MonthStat icon={<Flame className="h-4 w-4" />} label="最长单次" value={`${data.monthStats.longestRun}`} unit="km" color="purple" />
          </div>
        )}
      </div>

      {/* 日历网格 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/* 星期表头 */}
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={i} className={`text-center text-xs font-medium py-1 ${i >= 5 ? 'text-rose-400' : 'text-slate-400'}`}>
              {w}
            </div>
          ))}
        </div>
        {/* 日期格子 */}
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((key, i) => {
            if (!key) return <div key={i} className="aspect-square" />
            const day = data?.days[key]
            const dayNum = parseInt(key.split('-')[2])
            const isToday = key === todayKey
            const colors = getDayColor(day)
            const isSelected = selectedDay === key
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                className={`aspect-square rounded-lg border ${colors.bg} ${colors.border} ${colors.text} p-1 flex flex-col items-center justify-start transition-all hover:scale-105 hover:shadow-md hover:z-10 ${
                  isToday ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                } ${isSelected ? 'ring-2 ring-slate-900' : ''}`}
                title={day ? `${day.totalDistance.toFixed(1)}km · ${day.sessions.length} 节` : '无训练'}
              >
                <span className={`text-xs font-medium ${day?.completedCount ? '' : 'opacity-60'}`}>{dayNum}</span>
                {day && day.sessions.length > 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center mt-0.5">
                    {day.totalDistance > 0 ? (
                      <>
                        <span className="text-[10px] font-bold leading-none">{day.totalDistance.toFixed(day.totalDistance < 10 ? 1 : 0)}</span>
                        <span className="text-[8px] opacity-80 leading-none">km</span>
                      </>
                    ) : day.sessions.some(s => s.type === 'rest') ? (
                      <span className="text-xs opacity-60">😴</span>
                    ) : (
                      <span className="text-[8px] opacity-70 leading-tight text-center">{SESSION_TYPES[day.sessions[0].type]?.icon}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* 图例 */}
        <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-50 border border-slate-200" />无训练</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100 border border-amber-200" />待完成</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-200 border border-emerald-300" />&lt;5km</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-300 border border-emerald-400" />5-10km</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-400 border border-emerald-500" />10-15km</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500 border border-emerald-600" />15-20km</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-600 border border-emerald-700" />≥20km</span>
        </div>
      </div>

      {/* 选中日期详情 */}
      {selectedDay && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              {selectedDay} 详情
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)} className="h-7 text-xs">×</Button>
          </div>

          <Button
            size="sm"
            onClick={() => onAddLog?.(selectedDay)}
            className="mb-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 h-9"
          >
            <Plus className="h-4 w-4 mr-1" />补录该日训练
          </Button>

          <div className="space-y-2">
            {(data?.days[selectedDay]?.sessions || []).map((s) => {
              const isLog = s.source === 'log'
              const cfg = SESSION_TYPES[s.type] || SESSION_TYPES.easy
              return (
                <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isLog ? 'bg-violet-50 border-violet-100' : 'bg-slate-50 border-slate-100'}`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${cfg.bg} border`}>
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${cfg.color}`}>{isLog ? '历史训练' : cfg.label}</span>
                      {isLog && <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">补录</Badge>}
                      {!isLog && (
                        <Badge variant="outline" className={`text-[10px] ${s.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                          {s.status === 'completed' ? '✓ 已完成' : '待完成'}
                        </Badge>
                      )}
                      {s.intensity && s.intensity !== 'rest' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">{s.intensity}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                      {s.actualDistance != null ? (
                        <span className="font-medium text-emerald-700">{isLog ? '实跑' : '实际'} {s.actualDistance}km</span>
                      ) : s.plannedDistance != null ? (
                        <span>计划 {s.plannedDistance}km</span>
                      ) : null}
                      {s.avgPace && <span>· {s.avgPace}</span>}
                      {s.avgHr && <span>· {s.avgHr}bpm</span>}
                      {s.duration && <span>· {Math.round(s.duration / 60)}min</span>}
                    </div>
                  </div>
                  {isLog && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-rose-500 shrink-0" onClick={async () => {
                      if (!confirm('删除这条补录记录？')) return
                      await fetch(`/api/log/${s.id}`, { method: 'DELETE' })
                      loadCalendar()
                    }}>删除</Button>
                  )}
                </div>
              )
            })}
            {!data?.days[selectedDay]?.sessions.length && (
              <div className="text-center text-xs text-slate-400 py-4">该日暂无训练记录，可点击上方按钮补录</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MonthStat({ icon, label, value, unit, color }: { icon: React.ReactNode; label: string; value: string; unit: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className={`inline-flex items-center justify-center h-7 w-7 rounded-lg mb-1.5 ${colorMap[color]}`}>{icon}</div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-lg font-bold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}
