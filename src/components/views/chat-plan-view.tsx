'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { MessageCircle, Send, Sparkles, Loader2, CheckCircle2, RotateCcw, Info, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { DAY_LABELS } from '@/lib/training'
import type { Week } from './types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ready?: boolean
  actions?: AiAction[]
}

type AiAction = { op: 'set' | 'clear' | 'goal'; day?: number; type?: string; km?: number | null; pace?: string | null; note?: string | null; text?: string | null }

interface Props {
  currentWeek: Week | null
  onPlanGenerated: () => void
  /** 重建目标周：传入后“生成课表”重建该周（保留已完成天 + 今天休息），而非生成下周 */
  replanWeek?: Week | null
  onCancelReplan?: () => void
}

function actionText(a: AiAction): string {
  const dow = a.day
  const d = dow !== undefined && dow >= 0 && dow <= 6 ? DAY_LABELS[dow] : ''
  if (a.op === 'goal') return '本周目标改成：' + (a.text || '')
  if (a.op === 'clear') return d + ' 的训练安排取消'
  const labelMap: Record<string, string> = { easy: '轻松跑', tempo: '节奏跑', interval: '间歇跑', long: '长距离', recovery: '恢复跑', cross: '交叉训练', rest: '休息' }
  const type = a.type || 'easy'
  const label = type === 'rest' ? '休息' : (labelMap[type] || type)
  const km = typeof a.km === 'number' && a.km ? ' ' + a.km + 'km' : ''
  return d + ' 改成' + label + km
}

export function ChatPlanView({ currentWeek, onPlanGenerated, replanWeek, onCancelReplan }: Props) {
  const isReplan = Boolean(replanWeek?.id)
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [ready, setReady] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 初始问候语（口语化）
  const makeIntro = () => isReplan
    ? '嗨，我是你的跑步教练 🏃。这周的课表想重排没问题——已经跑掉的训练会留着，今天（' + DAY_LABELS[new Date().getDay()] + '）按你说的休息。\n\n跟我说说对剩下几天有什么想法：强度想高一点还是低一点、想重点练什么、最近身体累不累？'
    : '嗨，我是你的跑步教练 🏃。想排一份合适的周课表，先跟我聊聊：最近跑得怎么样？有没有受伤、酸痛、特别累？接下来想重点练什么？\n\n想起什么说什么，我会边聊边问你几个细节，不赶时间 😄'
  useEffect(() => {
    setMessages([{ role: 'assistant', content: makeIntro() }])
    setReady(false)
  }, [replanWeek])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          message: msg,
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.reply,
        ready: data.ready,
        actions: Array.isArray(data.actions) ? data.actions as AiAction[] : undefined,
      }
      setMessages([...newMessages, assistantMsg])
      if (data.ready) {
        setReady(true)
      }
    } catch (e) {
      toast({ title: '对话失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/chat-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isReplan
            ? { action: 'generate', history: messages.map(m => ({ role: m.role, content: m.content })), replanWeekId: replanWeek!.id, fixedRestDays: [new Date().getDay()] }
            : { action: 'generate', history: messages.map(m => ({ role: m.role, content: m.content })), fromWeekId: currentWeek?.id }
        ),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast({
        title: isReplan ? '✅ 本周课表已重建' : '✅ 个性化课表已生成',
        description: `${data.week.sessions?.length || 0} 节训练课 · ${data.plan.weekGoal?.slice(0, 40) || ''}`,
      })
      onPlanGenerated()
    } catch (e) {
      toast({ title: '生成失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const [dismissed, setDismissed] = useState<number[]>([])
  const [applying, setApplying] = useState(false)
  const targetWeekId = currentWeek?.id || replanWeek?.id

  const handleDismiss = (idx: number) => setDismissed(prev => [...prev, idx])

  const handleApplyActions = async (actions: AiAction[], idx: number) => {
    if (!targetWeekId) {
      toast({ title: '还没有可改的课表', description: '先点“生成课表”创建一份，再让我帮你调整', variant: 'destructive' })
      return
    }
    setApplying(true)
    try {
      const res = await fetch('/api/weeks/' + targetWeekId + '/ai-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const lines = [...(data.done || []), ...(data.skipped || [])]
      toast({ title: '✅ 课表已按建议调整', description: (lines.slice(0, 2).join('；') || '已处理') })
      setDismissed(prev => [...prev, idx])
      onPlanGenerated()
    } catch (e) {
      toast({ title: '调整失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  const handleReset = () => {
    setMessages([{
      role: 'assistant',
      content: makeIntro(),
    }])
    setReady(false)
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {isReplan && replanWeek && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-4">
          <div className="flex items-start gap-3">
            <RefreshCw className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-violet-800">正在重建本周课表</div>
              <p className="text-xs text-violet-600 mt-1 leading-relaxed">
                已保留 <b>{replanWeek.sessions.filter(s => s.status === 'completed').length}</b> 节已完成训练；今天（{DAY_LABELS[new Date().getDay()]}）固定休息；其余训练日按你的对话诉求重新设计。
              </p>
            </div>
            {onCancelReplan && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-violet-600 hover:bg-violet-100 shrink-0" onClick={onCancelReplan}>取消重建</Button>
            )}
          </div>
        </div>
      )}
      {/* 头部 */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">和教练聊聊排课</h2>
              <p className="text-xs text-slate-500">把你的想法说出来，剩下的我来安排</p>
            </div>
          </div>
          {ready && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />信息已收集完整
            </Badge>
          )}
        </div>
      </div>

      {/* 提示 */}
      <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="text-xs text-slate-600">
          <p className="font-medium text-emerald-800 mb-0.5">如何使用</p>
          像和真人教练聊天一样，告诉我你的身体状况、停跑恢复、伤病、时间安排、训练目标等。AI 会主动询问必要信息，
          收集完整后点击「生成课表」即可获得量身定制的训练计划。支持自由描述任何特殊情况。
        </div>
      </div>

      {/* 对话区 */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="h-[420px] overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-2 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                  m.role === 'user'
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                }`}>
                  {m.role === 'user' ? '我' : <Sparkles className="h-4 w-4" />}
                </div>
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-slate-100 text-slate-800 rounded-tr-sm'
                    : 'bg-emerald-50 text-slate-800 rounded-tl-sm border border-emerald-100'
                }`}>
                  <div className="prose prose-sm prose-slate max-w-none prose-p:my-1 prose-p:leading-relaxed prose-strong:text-slate-900 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                  {m.ready && (
                    <div className="mt-2 pt-2 border-t border-emerald-200 text-[11px] text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />信息已收集完整，可生成课表
                    </div>
                  )}
                  {m.role === 'assistant' && m.actions && m.actions.length > 0 && !dismissed.includes(i) && (
                    <div className="mt-2.5 rounded-xl border border-emerald-200 bg-white p-2.5">
                      <div className="text-xs font-medium text-emerald-800 mb-1.5">我可以帮你把课表改成这样：</div>
                      <ul className="space-y-1">
                        {m.actions.map((a, ai) => (
                          <li key={ai} className="text-xs text-slate-700">· {actionText(a)}</li>
                        ))}
                      </ul>
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" disabled={applying} onClick={() => handleApplyActions(m.actions!, i)}>
                          {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}就这样改
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => handleDismiss(i)}>先不了</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 text-emerald-600 animate-spin" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区 */}
        <div className="border-t border-slate-100 p-3">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="描述你的状况、目标、特殊情况...（Enter 发送，Shift+Enter 换行）"
              className="resize-none text-sm min-h-[40px] max-h-[120px]"
              rows={1}
              disabled={loading}
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 h-9 px-3 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-slate-600">
          <RotateCcw className="h-3.5 w-3.5" />重新开始对话
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={generating || messages.length < 2}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 gap-1.5"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />AI 正在生成课表...</>
          ) : (
            <><Sparkles className="h-4 w-4" />{ready ? '生成个性化课表' : '基于对话生成课表'}</>
          )}
        </Button>
      </div>

      {/* 快捷话题 */}
      {messages.length <= 1 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-xs text-slate-500 mb-2">💡 你可以这样开始对话：</div>
          <div className="flex flex-wrap gap-2">
            {[
              '我刚从膝伤恢复，停跑了 2 个月',
              '我想备战 3 个月后的全马，目标 sub 4',
              '我每周只能跑 3 次，工作日很忙',
              '最近在高原训练，配速掉了很多',
              '我是跑步新手，想完成第一个 10K',
            ].map(suggestion => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
