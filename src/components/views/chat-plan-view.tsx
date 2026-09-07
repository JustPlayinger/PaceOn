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
}

interface Props {
  currentWeek: Week | null
  onPlanGenerated: () => void
  /** 重建目标周：传入后“生成课表”重建该周（保留已完成天 + 今天休息），而非生成下周 */
  replanWeek?: Week | null
  onCancelReplan?: () => void
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

  // 初始问候语
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `你好！我是你的 AI 跑步教练 🏃‍♂️\n\n在制定训练课表前，我需要了解你的具体情况，这样才能为你量身定制最适合的计划。\n\n请先告诉我：**你最近的状态如何？有没有伤病、停跑、或者身体不适的情况？**\n\n（你可以像和真人教练聊天一样自由描述，我会根据你的回答继续了解必要的信息）`,
    }])
  }, [])

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

  const handleReset = () => {
    setMessages([{
      role: 'assistant',
      content: `好的，让我们重新开始。请告诉我：**你最近的状态如何？有没有伤病、停跑、或者身体不适的情况？**`,
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
              <h2 className="text-lg font-bold text-slate-900">对话式课表生成</h2>
              <p className="text-xs text-slate-500">与 AI 教练自由对话 · 量身定制个性化训练计划</p>
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
