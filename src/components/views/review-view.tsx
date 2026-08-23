'use client'

import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { BrainCircuit, Sparkles, Loader2, Star, Lightbulb, Wand2, RefreshCw, CalendarPlus, Sliders, MessageSquare, TrendingUp, ChevronRight, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { PHASE_LABELS, SESSION_TYPES, DAY_LABELS, getWeekRange } from '@/lib/training'
import { ChatPlanView } from './chat-plan-view'
import type { Week, Runner, AIReview } from './types'

interface Props {
  week: Week | null
  runner: Runner | null
  refresh: () => void
}

export function ReviewViewImpl({ week, runner, refresh }: Props) {
  const { toast } = useToast()
  const [reviewing, setReviewing] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [latestReview, setLatestReview] = useState<AIReview | null>(null)
  const [latestAdjust, setLatestAdjust] = useState<AIReview | null>(null)
  const [adjustNote, setAdjustNote] = useState('')
  const [showAdjust, setShowAdjust] = useState(false)
  const [chatMode, setChatMode] = useState(false)

  const loadReviews = useCallback(async () => {
    if (!week) return
    const res = await fetch(`/api/weeks/${week.id}/reviews`)
    const data = await res.json()
    const reviews: AIReview[] = data.reviews || []
    setLatestReview(reviews.find(r => r.type === 'weekly_review') || null)
    setLatestAdjust(reviews.find(r => r.type === 'micro_adjust') || null)
  }, [week])

  useEffect(() => {
    loadReviews()
  }, [loadReviews])

  const handleReview = async () => {
    if (!week) return
    setReviewing(true)
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId: week.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLatestReview({
        id: data.review.id,
        weekId: week.id,
        type: 'weekly_review',
        content: data.content,
        rating: data.rating,
        suggestions: JSON.stringify(data.suggestions),
        createdAt: data.review.createdAt,
      })
      toast({ title: '✅ AI 点评已生成', description: `本周评分 ${data.rating}/100` })
      refresh()
    } catch (e) {
      toast({ title: '点评生成失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setReviewing(false)
    }
  }

  const handlePlan = async () => {
    if (!week) return
    setPlanning(true)
    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromWeekId: week.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast({
        title: '✅ 下周课表已生成',
        description: `${data.week.phase || ''} · ${data.week.sessions?.length || 0} 节训练课`,
      })
      refresh()
    } catch (e) {
      toast({ title: '课表生成失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setPlanning(false)
    }
  }

  const handleAdjust = async () => {
    if (!week) return
    setAdjusting(true)
    try {
      const res = await fetch('/api/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId: week.id, userNote: adjustNote }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLatestAdjust({
        id: Date.now().toString(),
        weekId: week.id,
        type: 'micro_adjust',
        content: data.content,
        createdAt: new Date().toISOString(),
      })
      toast({ title: '✅ 微调建议已生成' })
    } catch (e) {
      toast({ title: '微调生成失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setAdjusting(false)
    }
  }

  if (!week) {
    return (
      <div className="space-y-5">
        {/* 无课表：直接进入对话式生成 */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50/40 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">AI 对话生成课表</h2>
              <p className="text-xs text-slate-500">还没有训练课表？和 AI 教练聊一聊，生成你的第一份训练计划</p>
            </div>
          </div>
          <ChatPlanView currentWeek={week} onPlanGenerated={refresh} />
        </div>
      </div>
    )
  }

  const completedCount = week.sessions.filter(s => s.status === 'completed').length
  const hasAnyCompletion = completedCount > 0
  const suggestions: { type: string; text: string }[] = latestReview?.suggestions ? safeParse(latestReview.suggestions) : []

  return (
    <div className="space-y-5">
      {/* 周信息 + 操作按钮 */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-emerald-50/40 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">第 {week.weekNumber ?? '?'} 周 AI 分析</h2>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {PHASE_LABELS[week.phase || ''] || week.phase || '-'}
              </Badge>
              <Badge variant="outline" className="text-slate-500">{getWeekRange(week.weekStart, week.weekEnd)}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-1">已完成 {completedCount}/{week.sessions.length} 节训练</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            onClick={handleReview}
            disabled={reviewing || !hasAnyCompletion}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 h-11"
          >
            {reviewing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />分析中...</> : <><BrainCircuit className="h-4 w-4 mr-1.5" />生成本周点评</>}
          </Button>
          <Button
            onClick={() => setChatMode(!chatMode)}
            variant={chatMode ? 'default' : 'outline'}
            className={`h-11 gap-1.5 ${chatMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
          >
            <MessageCircle className="h-4 w-4" />{chatMode ? '收起对话' : '对话式生成'}
          </Button>
          <Button
            onClick={handlePlan}
            disabled={planning}
            variant="outline"
            className="h-11 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            {planning ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />生成中...</> : <><CalendarPlus className="h-4 w-4 mr-1.5" />快速生成课表</>}
          </Button>
          <Button
            onClick={() => setShowAdjust(!showAdjust)}
            variant="outline"
            className="h-11 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <Sliders className="h-4 w-4 mr-1.5" />本周微调
          </Button>
        </div>

        {/* 对话式课表生成 */}
        {chatMode && (
          <ChatPlanView currentWeek={week} onPlanGenerated={() => { setChatMode(false); refresh() }} />
        )}

        {!hasAnyCompletion && (
          <div className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
            ⚠️ 本周尚无完成记录，请先在「上传数据」中记录至少一次训练，AI 才能进行点评
          </div>
        )}
      </div>

      {/* 微调面板 */}
      {showAdjust && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
            <Sliders className="h-4 w-4 text-emerald-600" />
            本周剩余训练微调
          </h3>
          <p className="text-xs text-slate-500 mb-3">基于本周已完成训练，AI 会建议剩余训练如何调整（距离/配速/类型）</p>
          <Label className="text-xs text-slate-600 mb-1.5 block">备注（可选，如：腿部疲劳、感冒初愈、下周比赛等）</Label>
          <Textarea
            value={adjustNote}
            onChange={e => setAdjustNote(e.target.value)}
            placeholder="如：本周长跑后右膝略不适..."
            className="text-sm resize-none mb-3"
            rows={2}
          />
          <Button onClick={handleAdjust} disabled={adjusting} className="bg-slate-800 hover:bg-slate-900">
            {adjusting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />生成微调...</> : <><Wand2 className="h-4 w-4 mr-1.5" />生成微调建议</>}
          </Button>
        </div>
      )}

      {/* 最新点评 */}
      {latestReview ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">本周训练点评</h3>
                <p className="text-xs text-slate-500">AI 综合分析 · {new Date(latestReview.createdAt).toLocaleString('zh-CN')}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-emerald-600">{latestReview.rating}</span>
                <span className="text-sm text-slate-400 mb-1">/100</span>
              </div>
              <div className="w-24"><Progress value={latestReview.rating || 0} className="h-1.5" /></div>
            </div>
          </div>
          <div className="p-5 prose prose-sm prose-slate max-w-none prose-headings:text-slate-800 prose-headings:font-semibold prose-strong:text-slate-700 prose-li:text-slate-600">
            <ReactMarkdown>{latestReview.content}</ReactMarkdown>
          </div>
          {suggestions.length > 0 && (
            <div className="px-5 pb-5 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                可执行建议
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50/60 border border-amber-100 p-2.5">
                    <Badge variant="outline" className="bg-white text-amber-700 border-amber-200 text-[10px] shrink-0">{s.type}</Badge>
                    <span className="text-xs text-slate-700 leading-relaxed">{s.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
          <BrainCircuit className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">暂无 AI 点评</p>
          <p className="text-xs text-slate-400 mt-1">点击「生成本周点评」让 AI 分析你的训练完成情况</p>
        </div>
      )}

      {/* 微调建议 */}
      {latestAdjust && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-gradient-to-r from-sky-50/60 to-transparent">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">本周微调建议</h3>
              <p className="text-xs text-slate-500">剩余训练的调整方案</p>
            </div>
          </div>
          <div className="p-5 prose prose-sm prose-slate max-w-none prose-headings:text-slate-800 prose-headings:font-semibold prose-strong:text-slate-700">
            <ReactMarkdown>{latestAdjust.content}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 课表概览（用于参考） */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-emerald-600" />
          本周训练完成概览
        </h3>
        <div className="space-y-1.5">
          {[...week.sessions].sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek)).map(s => {
            const cfg = SESSION_TYPES[s.type] || SESSION_TYPES.easy
            return (
              <div key={s.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50">
                <span>{cfg.icon}</span>
                <span className="font-medium text-slate-700 w-12">{DAY_LABELS[s.dayOfWeek]}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${cfg.bg} ${cfg.color} border`}>{cfg.label}</span>
                <span className="text-slate-500 flex-1 truncate">
                  {s.plannedDistance != null ? `${s.plannedDistance}km` : '休息'}
                  {s.completion ? ` → 实际 ${s.completion.distance || 0}km` : ''}
                </span>
                <Badge variant="outline" className={`text-[10px] ${
                  s.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  s.status === 'skipped' ? 'bg-zinc-50 text-zinc-500' : 'bg-slate-50 text-slate-500'
                }`}>
                  {s.status === 'completed' ? '✓' : s.status === 'skipped' ? '跳过' : '待完成'}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function safeParse(s: string): { type: string; text: string }[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
