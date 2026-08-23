'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { History, TrendingUp, Timer, Heart, Mountain, ChevronRight, ChevronDown, ArrowLeft, BrainCircuit, Activity, ExternalLink, Trash2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SESSION_TYPES, STATUS_LABELS, DAY_LABELS, PHASE_LABELS, formatDuration, formatDate, getWeekRange } from '@/lib/training'
import { SessionDetailDialog } from './session-detail-dialog'
import type { Week, Plan } from './types'

interface Props {
  weeks: Week[]
  plans: Plan[]
  onSelectWeek: (w: Week) => void
  onSwitchToReview: () => void
  onChanged: () => void
}

export function HistoryViewImpl({ weeks, plans, onSelectWeek, onSwitchToReview, onChanged }: Props) {
  const [selected, setSelected] = useState<Week | null>(null)
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({})

  if (selected) {
    return <WeekDetailView week={selected} onBack={() => setSelected(null)} onSwitchToReview={onSwitchToReview} onDeleted={onChanged} />
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
        <History className="mx-auto h-10 w-10 text-slate-300 mb-3" />
        <p className="text-slate-500">暂无历史课表</p>
      </div>
    )
  }

  // 按训练周期分组（无归属的周归入「未分组」）
  const grouped = new Set<string>()
  const groups: { plan: Plan | null; weeks: Week[] }[] = []
  for (const p of plans) {
    const pWeeks = weeks.filter(w => w.planId === p.id)
    if (pWeeks.length === 0) continue
    pWeeks.forEach(w => grouped.add(w.id))
    groups.push({ plan: p, weeks: pWeeks })
  }
  const orphanWeeks = weeks.filter(w => !grouped.has(w.id))
  if (orphanWeeks.length > 0) groups.push({ plan: null, weeks: orphanWeeks })

  const togglePlan = (id: string) => setExpandedPlans(prev => ({ ...prev, [id]: !prev[id] }))

  const handleDeleteWeek = async (w: Week) => {
    if (!window.confirm(`确定删除第 ${w.weekNumber ?? '?'} 周课表吗？\n其下 ${w.sessions.length} 节训练课及完成记录将一并删除。`)) return
    const res = await fetch(`/api/weeks/${w.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (d.error) throw new Error(d.error)
    onChanged()
  }

  const handleDeletePlan = async (p: Plan) => {
    const count = weeks.filter(w => w.planId === p.id).length
    if (!window.confirm(`确定删除训练周期「${p.title}」吗？\n其下 ${count} 个训练周（含训练课、完成记录、点评）将一并删除。`)) return
    const res = await fetch(`/api/plans/${p.id}`, { method: 'DELETE' })
    const d = await res.json()
    if (d.error) throw new Error(d.error)
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">历史课表归档</h2>
        <p className="text-sm text-slate-500">共 {weeks.length} 个训练周 · {plans.length} 个训练周期，点击查看详情</p>
      </div>

      {groups.map(group => {
        const plan = group.plan
        const gid = plan ? plan.id : '__orphan'
        const expanded = expandedPlans[gid] !== false
        const groupWeeks = [...group.weeks].sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())

        return (
          <div key={gid} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* 周期头部（可折叠） */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-emerald-50/60 to-transparent border-b border-slate-100">
              <button onClick={() => togglePlan(gid)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                {expanded ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                <Layers className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-800 truncate">{plan?.title || '未分组课表'}</span>
                {plan?.active && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">当前启用</Badge>}
                <span className="text-xs text-slate-400 shrink-0">{groupWeeks.length} 周</span>
              </button>
              {plan && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-rose-500 hover:bg-rose-50 hover:text-rose-600 shrink-0" onClick={() => handleDeletePlan(plan).catch((e) => alert('删除失败：' + (e as Error).message))}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />删除周期
                </Button>
              )}
            </div>

            {expanded && (
              <div className="p-3 grid gap-3">
                {groupWeeks.map(w => (
                  <div key={w.id} className="relative">
                    <WeekCard week={w} onOpen={() => { setSelected(w); onSelectWeek(w) }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteWeek(w).catch((err) => alert('删除失败：' + (err as Error).message)) }}
                      className="absolute top-2 right-2 z-10 h-7 w-7 rounded-lg bg-white/90 border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 flex items-center justify-center shadow-sm"
                      title="删除该周课表"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WeekCard({ week: w, onOpen }: { week: Week; onOpen: () => void }) {
  const sessions = [...w.sessions].sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek))
  const completed = sessions.filter(s => s.status === 'completed')
  const plannedTotal = sessions.reduce((sum, s) => sum + (s.plannedDistance || 0), 0)
  const actualTotal = completed.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)
  const rate = plannedTotal > 0 ? Math.min(100, Math.round((actualTotal / plannedTotal) * 100)) : 0
  const review = w.reviews?.find(r => r.type === 'weekly_review')

  return (
    <button
      onClick={onOpen}
      className="group text-left w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900">第 {w.weekNumber ?? '?'} 周</span>
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            {PHASE_LABELS[w.phase || ''] || w.phase || '-'}
          </Badge>
          <Badge variant="outline" className="text-slate-500">{getWeekRange(w.weekStart, w.weekEnd)}</Badge>
          {review && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{review.rating}/100</Badge>}
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
      </div>

      <p className="text-xs text-slate-500 mb-3 line-clamp-1">{w.goal || '本周训练课表'}</p>

      <div className="flex items-center gap-4 text-xs text-slate-600 mb-2">
        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-500" />{actualTotal.toFixed(1)}/{plannedTotal.toFixed(0)} km</span>
        <span className="flex items-center gap-1"><Activity className="h-3 w-3 text-sky-500" />{completed.length}/{sessions.length} 完成</span>
        <span className="flex items-center gap-1"><Timer className="h-3 w-3 text-orange-500" />{formatDuration(completed.reduce((s, x) => s + (x.completion?.duration || 0), 0))}</span>
      </div>

      <div className="flex items-center gap-2">
        <Progress value={rate} className="h-1.5 flex-1" />
        <span className="text-xs text-slate-500 w-9 text-right">{rate}%</span>
      </div>

      {/* 一周完成缩略 */}
      <div className="flex gap-1 mt-3">
        {sessions.map(s => {
          const cfg = SESSION_TYPES[s.type] || SESSION_TYPES.easy
          return (
            <div
              key={s.id}
              className={`flex-1 h-6 rounded text-center text-[9px] flex items-center justify-center border ${cfg.bg} ${cfg.color}`}
              title={`${DAY_LABELS[s.dayOfWeek]} ${cfg.label}${s.completion ? ' ✓' : ''}`}
            >
              {cfg.icon}
            </div>
          )
        })}
      </div>
    </button>
  )
}

function WeekDetailView({ week, onBack, onSwitchToReview, onDeleted }: { week: Week; onBack: () => void; onSwitchToReview: () => void; onDeleted: () => void }) {
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`确定删除第 ${week.weekNumber ?? '?'} 周课表吗？\n其下 ${week.sessions.length} 节训练课及完成记录将一并删除。`)) return
    try {
      const res = await fetch(`/api/weeks/${week.id}`, { method: 'DELETE' })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      onDeleted()
    } catch (e) {
      alert('删除失败：' + (e as Error).message)
    }
  }
  const sessions = [...week.sessions].sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek))
  const completed = sessions.filter(s => s.status === 'completed')
  const plannedTotal = sessions.reduce((sum, s) => sum + (s.plannedDistance || 0), 0)
  const actualTotal = completed.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)
  const avgHr = completed.length > 0 ? Math.round(completed.reduce((s, x) => s + (x.completion?.avgHr || 0), 0) / completed.length) : 0
  const totalElev = completed.reduce((s, x) => s + (x.completion?.elevation || 0), 0)
  const review = week.reviews?.find(r => r.type === 'weekly_review')

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-600 -ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />返回列表
      </Button>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900">第 {week.weekNumber ?? '?'} 周</h2>
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              {PHASE_LABELS[week.phase || ''] || week.phase || '-'}
            </Badge>
            <Badge variant="outline" className="text-slate-500">{getWeekRange(week.weekStart, week.weekEnd)}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={onSwitchToReview} className="border-emerald-200 text-emerald-700">
              <BrainCircuit className="h-3.5 w-3.5 mr-1" />前往 AI 点评
            </Button>
            <Button size="sm" variant="outline" onClick={handleDelete} className="border-rose-200 text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除该周
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-600">{week.goal}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <MiniStat icon={<TrendingUp className="h-4 w-4" />} label="总距离" value={`${actualTotal.toFixed(1)} km`} sub={`计划 ${plannedTotal.toFixed(0)} km`} color="emerald" />
          <MiniStat icon={<Timer className="h-4 w-4" />} label="总时长" value={formatDuration(completed.reduce((s, x) => s + (x.completion?.duration || 0), 0))} sub={`${completed.length} 次完成`} color="orange" />
          <MiniStat icon={<Heart className="h-4 w-4" />} label="平均心率" value={avgHr > 0 ? `${avgHr} bpm` : '-'} sub="已完成训练" color="rose" />
          <MiniStat icon={<Mountain className="h-4 w-4" />} label="累计爬升" value={`${totalElev} m`} sub="本周总爬升" color="sky" />
        </div>
      </div>

      {/* AI 点评 */}
      {review && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-gradient-to-r from-amber-50/60 to-transparent">
            <BrainCircuit className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold text-slate-800 flex-1">本周 AI 点评</h3>
            <Badge className="bg-amber-100 text-amber-700 border-amber-200">{review.rating}/100</Badge>
          </div>
          <div className="p-4 prose prose-sm prose-slate max-w-none">
            <ReactMarkdown>{review.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 每日详情 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">每日训练详情</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {sessions.map(s => {
            const cfg = SESSION_TYPES[s.type] || SESSION_TYPES.easy
            const c = s.completion
            return (
              <div key={s.id} className="p-4 hover:bg-slate-50/50">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl border text-lg ${cfg.bg}`}>{cfg.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-800">{DAY_LABELS[s.dayOfWeek]}</span>
                      <span className="text-xs text-slate-400">{formatDate(s.date)}</span>
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${STATUS_LABELS[s.status]?.color || ''}`}>
                        {STATUS_LABELS[s.status]?.label || s.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">{s.description}</p>

                    {/* 计划 vs 实际 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-50 rounded p-1.5">
                        <div className="text-slate-400 text-[10px]">计划距离</div>
                        <div className="font-medium text-slate-700">{s.plannedDistance != null ? `${s.plannedDistance} km` : '-'}</div>
                      </div>
                      <div className="bg-slate-50 rounded p-1.5">
                        <div className="text-slate-400 text-[10px]">实际距离</div>
                        <div className="font-medium text-emerald-700">{c?.distance != null ? `${c.distance} km` : '-'}</div>
                      </div>
                      <div className="bg-slate-50 rounded p-1.5">
                        <div className="text-slate-400 text-[10px]">计划/实际配速</div>
                        <div className="font-medium text-slate-700">{s.plannedPace || '-'} / {c?.avgPace || '-'}</div>
                      </div>
                      <div className="bg-slate-50 rounded p-1.5">
                        <div className="text-slate-400 text-[10px]">心率/爬升</div>
                        <div className="font-medium text-slate-700">{c?.avgHr ? `${c.avgHr}` : '-'} / {c?.elevation ? `${c.elevation}m` : '-'}</div>
                      </div>
                    </div>

                    {c?.feelingNote && (
                      <div className="mt-2 text-xs text-slate-500 italic bg-amber-50/50 rounded p-2">
                        💬 {c.feelingNote}
                      </div>
                    )}

                    {s.status === 'completed' && (
                      <button
                        onClick={() => { setDetailSessionId(s.id); setDetailOpen(true) }}
                        className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" />查看完整详情与 AI 分析
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 单次训练详情对话框 */}
      <SessionDetailDialog
        sessionId={detailSessionId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}

function MiniStat({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    rose: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
  }
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className={`inline-flex items-center justify-center h-7 w-7 rounded-lg mb-1.5 ${colorMap[color]}`}>{icon}</div>
      <div className="text-base font-bold text-slate-900 leading-tight">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-[10px] text-slate-400">{sub}</div>
    </div>
  )
}
