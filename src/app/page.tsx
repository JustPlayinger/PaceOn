'use client'

import { useState, useEffect, useCallback } from 'react'
import { Footprints, CalendarDays, Upload, BrainCircuit, History, UserCog, Sparkles, RefreshCw, TrendingUp, Activity, Heart, Mountain, Cloud, Flame, Timer, Gauge, LineChart as LineChartIcon, Pencil, Plus, CalendarRange, Target, Download, Printer, Copy, Library, HeartPulse, Database, Calculator, Trophy, Shield, GitCompare, Award, LayoutGrid, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { SESSION_TYPES, STATUS_LABELS, DAY_LABELS, PHASE_LABELS, formatDuration, formatDate, getWeekRange } from '@/lib/training'
import { UploadViewImpl } from '@/components/views/upload-view'
import { ReviewViewImpl } from '@/components/views/review-view'
import { HistoryViewImpl } from '@/components/views/history-view'
import { ProfileViewImpl } from '@/components/views/profile-view'
import { TrendsView } from '@/components/views/trends-view'
import { CalendarView } from '@/components/views/calendar-view'
import { GoalView } from '@/components/views/goal-view'
import { ShoesView } from '@/components/views/shoes-view'
import { TemplatesView } from '@/components/views/templates-view'
import { RecoveryView } from '@/components/views/recovery-view'
import { DataView } from '@/components/views/data-view'
import { PaceCalculatorView } from '@/components/views/pace-calculator-view'
import { RecordsView } from '@/components/views/records-view'
import { LoadView } from '@/components/views/load-view'
import { CompareView } from '@/components/views/compare-view'
import { AchievementsView } from '@/components/views/achievements-view'
import { GlobalSearch } from '@/components/views/global-search'
import { SessionEditDialog } from '@/components/views/session-edit-dialog'
import { SessionDetailDialog } from '@/components/views/session-detail-dialog'
import { WarmupCooldownDialog } from '@/components/views/warmup-cooldown-dialog'
import { RaceCountdown } from '@/components/views/race-countdown'
import { ProgressRing } from '@/components/views/progress-ring'
import { weekToMarkdown, copyToClipboard, downloadTextFile, printWeek } from '@/components/views/export-utils'
import type { Week, Runner, Session, Plan } from '@/components/views/types'
import { patchFetch } from '@/lib/api-client'
import { initOfflineMode, isOfflineModeEnabled } from '@/lib/offline'

// 离线模式（APK/静态导出）：初始化本地数据层 + 本地 API；否则启用远程服务器转发补丁
if (typeof window !== 'undefined') {
  if (isOfflineModeEnabled()) {
    initOfflineMode()
  } else {
    patchFetch()
  }
}

type Tab = 'dashboard' | 'upload' | 'review' | 'trends' | 'load' | 'compare' | 'calendar' | 'goal' | 'templates' | 'shoes' | 'recovery' | 'records' | 'pace' | 'achievements' | 'history' | 'profile' | 'data' | 'more'

// ===== 主组件 =====
export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [runner, setRunner] = useState<Runner | null>(null)
  const [weeks, setWeeks] = useState<Week[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [uploadLogDate, setUploadLogDate] = useState<string | null>(null)
  const { toast } = useToast()

  const loadRunner = useCallback(async () => {
    const res = await fetch('/api/runner')
    const data = await res.json()
    setRunner(data.runner || null)
  }, [])

  const loadWeeks = useCallback(async () => {
    const res = await fetch('/api/weeks')
    const data = await res.json()
    setWeeks(data.weeks || [])
  }, [])

  const loadCurrentWeek = useCallback(async () => {
    const res = await fetch('/api/weeks?current=true')
    const data = await res.json()
    setCurrentWeek(data.week || null)
  }, [])

  const loadPlans = useCallback(async () => {
    const res = await fetch('/api/plans')
    const data = await res.json()
    setPlans(data.plans || [])
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadRunner(), loadWeeks(), loadCurrentWeek(), loadPlans()])
    setLoading(false)
  }, [loadRunner, loadWeeks, loadCurrentWeek, loadPlans])

  useEffect(() => {
    // 等待离线数据层初始化完成后再加载数据（非离线模式立即返回）
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initOfflineMode().then(() => {
      if (active) loadAll()
    })
    return () => { active = false }
  }, [loadAll])

  // 首次无数据时自动种子
  const ensureSeed = useCallback(async () => {
    if (!loading && !runner && weeks.length === 0) {
      const res = await fetch('/api/seed', { method: 'POST' })
      const data = await res.json()
      if (data.runner) {
        toast({ title: '已初始化示例数据', description: '可前往「跑者档案」修改你的信息' })
        await loadAll()
      }
    }
  }, [loading, runner, weeks.length, loadAll, toast])

  useEffect(() => {
    // 首次无数据时自动种子初始化
    // eslint-disable-next-line react-hooks/set-state-in-effect
    ensureSeed()
  }, [ensureSeed])

  // 监听全局搜索的导航事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Tab
      if (detail) setTab(detail)
    }
    window.addEventListener('paceon-navigate', handler as EventListener)
    return () => window.removeEventListener('paceon-navigate', handler as EventListener)
  }, [])

  const refresh = useCallback(() => {
    loadAll()
  }, [loadAll])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
                <Footprints className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">PaceOn</h1>
                <p className="text-xs text-slate-500 -mt-0.5">智能长跑训练指导</p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <GlobalSearch />
              {runner && (
                <Badge variant="outline" className="gap-1.5 bg-white">
                  <span className="text-emerald-600">●</span>
                  {runner.name}
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={refresh} className="gap-1.5 text-slate-600">
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
              </Button>
            </div>
          </div>

          {/* Tab 导航 */}
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<CalendarDays className="h-4 w-4" />}>本周课表</TabButton>
            <TabButton active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload className="h-4 w-4" />}>上传数据</TabButton>
            <TabButton active={tab === 'review'} onClick={() => setTab('review')} icon={<BrainCircuit className="h-4 w-4" />}>AI 点评</TabButton>
            <TabButton active={tab === 'trends'} onClick={() => setTab('trends')} icon={<LineChartIcon className="h-4 w-4" />}>趋势分析</TabButton>
            <TabButton active={tab === 'load'} onClick={() => setTab('load')} icon={<Shield className="h-4 w-4" />}>负荷管理</TabButton>
            <TabButton active={tab === 'compare'} onClick={() => setTab('compare')} icon={<GitCompare className="h-4 w-4" />}>训练对比</TabButton>
            <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon={<CalendarRange className="h-4 w-4" />}>训练日历</TabButton>
            <TabButton active={tab === 'goal'} onClick={() => setTab('goal')} icon={<Target className="h-4 w-4" />}>目标进度</TabButton>
            <TabButton active={tab === 'templates'} onClick={() => setTab('templates')} icon={<Library className="h-4 w-4" />}>计划模板</TabButton>
            <TabButton active={tab === 'shoes'} onClick={() => setTab('shoes')} icon={<Footprints className="h-4 w-4" />}>跑鞋追踪</TabButton>
            <TabButton active={tab === 'recovery'} onClick={() => setTab('recovery')} icon={<HeartPulse className="h-4 w-4" />}>恢复追踪</TabButton>
            <TabButton active={tab === 'records'} onClick={() => setTab('records')} icon={<Trophy className="h-4 w-4" />}>PB 记录</TabButton>
            <TabButton active={tab === 'pace'} onClick={() => setTab('pace')} icon={<Calculator className="h-4 w-4" />}>配速计算器</TabButton>
            <TabButton active={tab === 'achievements'} onClick={() => setTab('achievements')} icon={<Award className="h-4 w-4" />}>成就</TabButton>
            <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<History className="h-4 w-4" />}>历史归档</TabButton>
            <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon={<UserCog className="h-4 w-4" />}>跑者档案</TabButton>
            <TabButton active={tab === 'data'} onClick={() => setTab('data')} icon={<Database className="h-4 w-4" />}>数据管理</TabButton>
          </nav>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
            </div>
          </div>
        ) : (
          <>
            {tab === 'dashboard' && <DashboardView week={currentWeek} runner={runner} onUploadClick={(sid) => { setSelectedSessionId(sid); setTab('upload') }} onOpenTemplates={() => setTab('templates')} onOpenReview={() => setTab('review')} refresh={refresh} />}
            {tab === 'upload' && <UploadView week={currentWeek} selectedSessionId={selectedSessionId} setSelectedSessionId={setSelectedSessionId} refresh={refresh} logDate={uploadLogDate} />}
            {tab === 'review' && <ReviewView week={currentWeek} runner={runner} refresh={refresh} />}
            {tab === 'trends' && <TrendsView />}
            {tab === 'load' && <LoadView />}
            {tab === 'compare' && <CompareView />}
            {tab === 'calendar' && <CalendarView onAddLog={(date) => { setUploadLogDate(date); setTab('upload') }} />}
            {tab === 'goal' && <GoalView />}
            {tab === 'templates' && <TemplatesView onApplied={refresh} />}
            {tab === 'shoes' && <ShoesView />}
            {tab === 'recovery' && <RecoveryView />}
            {tab === 'records' && <RecordsView />}
            {tab === 'pace' && <PaceCalculatorView />}
            {tab === 'achievements' && <AchievementsView />}
            {tab === 'history' && <HistoryView weeks={weeks} plans={plans} onSelectWeek={setCurrentWeek} onSwitchToReview={() => setTab('review')} onChanged={refresh} />}
            {tab === 'profile' && <ProfileView runner={runner} refresh={refresh} />}
            {tab === 'data' && <DataView onDataChanged={refresh} />}
            {tab === 'more' && <MoreView onNavigate={setTab} />}
          </>
        )}
      </main>

      {/* 底部 */}
      <footer className="mt-auto border-t border-slate-200/70 bg-white/60 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-emerald-500" />
            PaceOn · 由 Z.ai VLM + LLM 驱动 · 科学周期化训练
          </p>
          <p>训练数据本地存储，AI 仅用于分析与建议</p>
        </div>
      </footer>

      {/* 移动端底部导航栏（仅手机显示） */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          <MobileTabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<CalendarDays className="h-5 w-5" />} label="课表" />
          <MobileTabButton active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload className="h-5 w-5" />} label="上传" />
          <MobileTabButton active={tab === 'review'} onClick={() => setTab('review')} icon={<BrainCircuit className="h-5 w-5" />} label="AI" />
          <MobileTabButton active={tab === 'load'} onClick={() => setTab('load')} icon={<Shield className="h-5 w-5" />} label="负荷" />
          <MobileTabButton active={tab === 'more'} onClick={() => setTab('more')} icon={<LayoutGrid className="h-5 w-5" />} label="更多" />
        </div>
      </nav>

      <Toaster />
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
        active
          ? 'border-emerald-500 text-emerald-700'
          : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function MobileTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
        active ? 'text-emerald-600' : 'text-slate-400'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

// ===== 更多功能菜单 =====
function MoreView({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const items: { tab: Tab; label: string; icon: React.ReactNode }[] = [
    { tab: 'templates', label: '计划模板', icon: <Library className="h-5 w-5" /> },
    { tab: 'trends', label: '趋势分析', icon: <LineChartIcon className="h-5 w-5" /> },
    { tab: 'calendar', label: '训练日历', icon: <CalendarRange className="h-5 w-5" /> },
    { tab: 'goal', label: '目标进度', icon: <Target className="h-5 w-5" /> },
    { tab: 'shoes', label: '跑鞋追踪', icon: <Footprints className="h-5 w-5" /> },
    { tab: 'recovery', label: '恢复追踪', icon: <HeartPulse className="h-5 w-5" /> },
    { tab: 'records', label: 'PB 记录', icon: <Trophy className="h-5 w-5" /> },
    { tab: 'pace', label: '配速计算器', icon: <Calculator className="h-5 w-5" /> },
    { tab: 'achievements', label: '成就', icon: <Award className="h-5 w-5" /> },
    { tab: 'history', label: '历史归档', icon: <History className="h-5 w-5" /> },
    { tab: 'profile', label: '跑者档案', icon: <UserCog className="h-5 w-5" /> },
    { tab: 'data', label: '数据管理', icon: <Database className="h-5 w-5" /> },
  ]
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-emerald-600" />更多功能
        </h2>
        <p className="text-xs text-slate-500 mt-1">全部功能入口，点击跳转</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {items.map((item) => (
          <button
            key={item.tab}
            onClick={() => onNavigate(item.tab)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-emerald-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">{item.icon}</span>
            <span className="text-xs font-medium text-slate-700">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ===== Dashboard 视图 =====
function DashboardView({ week, runner, onUploadClick, onOpenTemplates, onOpenReview, refresh }: {
  week: Week | null
  runner: Runner | null
  onUploadClick: (sessionId: string) => void
  onOpenTemplates: () => void
  onOpenReview: () => void
  refresh: () => void
}) {
  const { toast } = useToast()
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addNew, setAddNew] = useState(false)
  const [detailSessionId, setDetailSessionId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [warmupSession, setWarmupSession] = useState<Session | null>(null)
  const [warmupOpen, setWarmupOpen] = useState(false)

  const handleWarmup = (s: Session) => {
    setWarmupSession(s)
    setWarmupOpen(true)
  }

  const handleEdit = (s: Session) => {
    setEditSession(s)
    setAddNew(false)
    setDialogOpen(true)
  }
  const handleAdd = () => {
    setEditSession(null)
    setAddNew(true)
    setDialogOpen(true)
  }
  const handleDetail = (s: Session) => {
    setDetailSessionId(s.id)
    setDetailOpen(true)
  }

  if (!week) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
        <CalendarDays className="mx-auto h-10 w-10 text-slate-300 mb-3" />
        <p className="text-slate-500">暂无本周课表</p>
        <p className="text-xs text-slate-400 mt-1">创建你的第一份训练课表：</p>
        <div className="mt-4 flex flex-col sm:flex-row justify-center gap-2">
          <Button onClick={onOpenTemplates} className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700">
            <Library className="h-4 w-4 mr-1.5" />从计划模板创建
          </Button>
          <Button variant="outline" onClick={onOpenReview} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
            <BrainCircuit className="h-4 w-4 mr-1.5" />AI 对话生成
          </Button>
        </div>
      </div>
    )
  }

  const sessions = [...week.sessions].sort((a, b) => {
    const orderA = a.dayOfWeek === 0 ? 7 : a.dayOfWeek
    const orderB = b.dayOfWeek === 0 ? 7 : b.dayOfWeek
    return orderA - orderB
  })

  const completed = sessions.filter(s => s.status === 'completed')
  const pending = sessions.filter(s => s.status === 'pending')
  const plannedTotal = sessions.reduce((sum, s) => sum + (s.plannedDistance || 0), 0)
  const actualTotal = completed.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)
  const completionRate = plannedTotal > 0 ? Math.min(100, Math.round((actualTotal / plannedTotal) * 100)) : 0

  const today = new Date()
  const todayDow = today.getDay()
  const todaySession = sessions.find(s => s.dayOfWeek === todayDow)

  return (
    <div className="space-y-6">
      {/* 今日训练焦点卡片 */}
      {todaySession && (
        <TodayFocusCard
          session={todaySession}
          onUpload={() => onUploadClick(todaySession.id)}
          onDetail={() => handleDetail(todaySession)}
        />
      )}

      {/* 赛事倒计时卡片 */}
      {runner?.targetDate && (
        <RaceCountdown
          targetDate={runner.targetDate}
          targetRace={runner.targetRace}
          targetTime={runner.targetTime}
        />
      )}

      {/* 周概览卡片 */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/40 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">第 {week.weekNumber ?? '?'} 周 · {PHASE_LABELS[week.phase || ''] || week.phase || '-'}</h2>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">{getWeekRange(week.weekStart, week.weekEnd)}</Badge>
            </div>
            <p className="text-sm text-slate-500 mt-1">{week.goal || '本周训练课表'}</p>
            {/* 导出按钮组 */}
            <div className="flex items-center gap-1.5 mt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-slate-200 text-slate-600 hover:bg-slate-50 gap-1"
                onClick={() => {
                  const md = weekToMarkdown(week, runner)
                  copyToClipboard(md).then(ok => {
                    toast({ title: ok ? '✅ 已复制到剪贴板' : '复制失败', description: ok ? '课表 Markdown 已复制' : '请手动复制' })
                  })
                }}
              >
                <Copy className="h-3 w-3" />复制
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-slate-200 text-slate-600 hover:bg-slate-50 gap-1"
                onClick={() => {
                  const md = weekToMarkdown(week, runner)
                  downloadTextFile(md, `PaceOn-Week${week.weekNumber ?? '?'}-${new Date(week.weekStart).toISOString().slice(0, 10)}.md`)
                }}
              >
                <Download className="h-3 w-3" />Markdown
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1"
                onClick={() => printWeek(week, runner)}
              >
                <Printer className="h-3 w-3" />打印/PDF
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing value={completionRate} size={92} strokeWidth={8} color={completionRate >= 80 ? '#10b981' : completionRate >= 50 ? '#f59e0b' : '#ef4444'}>
              <span className="text-lg font-bold text-slate-900 leading-none">{actualTotal.toFixed(1)}</span>
              <span className="text-[10px] text-slate-400 mt-0.5">/ {plannedTotal.toFixed(0)} km</span>
            </ProgressRing>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard icon={<Activity className="h-4 w-4" />} label="完成度" value={`${completionRate}%`} sub={`${completed.length}/${sessions.length} 次`} color="emerald" />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="已完成" value={`${completed.length}`} sub={`${pending.length} 次待完成`} color="sky" />
          <StatCard icon={<Timer className="h-4 w-4" />} label="累计时长" value={formatDuration(completed.reduce((s, x) => s + (x.completion?.duration || 0), 0))} sub="已完成训练" color="orange" />
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>本周进度</span>
            <span>{completionRate}%</span>
          </div>
          <Progress value={completionRate} className="h-2" />
        </div>
      </div>

      {/* 训练课列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-800">每日训练</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{sessions.length} 节训练课</span>
            <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 gap-1" onClick={handleAdd}>
              <Plus className="h-3 w-3" />新增
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map((s) => {
            const cfg = SESSION_TYPES[s.type] || SESSION_TYPES.easy
            const isToday = s.dayOfWeek === todayDow
            const isDone = s.status === 'completed'
            const isRest = s.type === 'rest'
            return (
              <div
                key={s.id}
                className={`group relative rounded-2xl border bg-white p-4 transition-all duration-200 hover:shadow-lg hover:shadow-slate-200/60 hover:-translate-y-0.5 ${
                  isToday ? 'border-emerald-400 ring-1 ring-emerald-200 shadow-sm shadow-emerald-100' : 'border-slate-200 hover:border-slate-300'
                } ${isRest ? 'opacity-75' : ''}`}
              >
                {isToday && <div className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-medium">今天</div>}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{cfg.icon}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800 text-sm">{DAY_LABELS[s.dayOfWeek]}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-500">{formatDate(s.date)}</span>
                      </div>
                      <div className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(s)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-emerald-600"
                      title="编辑"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_LABELS[s.status]?.color || STATUS_LABELS.pending.color}`}>
                      {STATUS_LABELS[s.status]?.label || s.status}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-3 min-h-[2rem]">{s.description}</p>

                <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                  {s.plannedDistance != null && <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{s.plannedDistance}km</span>}
                  {s.plannedDuration != null && <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{s.plannedDuration}min</span>}
                  {s.plannedPace && <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{s.plannedPace}</span>}
                  {s.intensity && s.intensity !== 'rest' && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{s.intensity}</span>}
                </div>

                {!isRest && (
                  <button
                    onClick={() => handleWarmup(s)}
                    className="text-[11px] text-orange-600 hover:text-orange-700 hover:underline flex items-center gap-0.5 mb-2"
                  >
                    <Flame className="h-3 w-3" />查看热身/冷身指导 →
                  </button>
                )}

                {isDone && s.completion ? (
                  <div className="rounded-lg bg-emerald-50/70 border border-emerald-100 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      {s.completion.distance != null && <span className="text-emerald-700 font-medium">实际 {s.completion.distance}km</span>}
                      {s.completion.avgPace && <span className="text-slate-600">{s.completion.avgPace}</span>}
                      {s.completion.avgHr != null && <span className="flex items-center gap-0.5 text-rose-600"><Heart className="h-3 w-3" />{s.completion.avgHr}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {s.completion.elevation != null && <span className="flex items-center gap-0.5"><Mountain className="h-3 w-3" />{s.completion.elevation}m</span>}
                      {s.completion.weather && <span className="flex items-center gap-0.5"><Cloud className="h-3 w-3" />{s.completion.weather}</span>}
                      {s.completion.rpe != null && <span className="flex items-center gap-0.5"><Flame className="h-3 w-3" />RPE {s.completion.rpe}</span>}
                    </div>
                    <button
                      onClick={() => handleDetail(s)}
                      className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-0.5"
                    >
                      查看详情与 AI 分析 →
                    </button>
                  </div>
                ) : !isRest ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => onUploadClick(s.id)}
                  >
                    <Upload className="h-3 w-3 mr-1" />上传完成数据
                  </Button>
                ) : (
                  <div className="text-center text-xs text-slate-400 py-1">休息日</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 编辑/新增训练课对话框 */}
      <SessionEditDialog
        session={editSession}
        week={week}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={refresh}
      />

      {/* 单次训练详情对话框 */}
      <SessionDetailDialog
        sessionId={detailSessionId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* 热身/冷身指导对话框 */}
      <WarmupCooldownDialog
        open={warmupOpen}
        onClose={() => setWarmupOpen(false)}
        session={warmupSession ? {
          type: warmupSession.type,
          intensity: warmupSession.intensity,
          plannedDistance: warmupSession.plannedDistance,
          plannedPace: warmupSession.plannedPace,
          description: warmupSession.description,
        } : null}
        runner={runner ? { maxHr: runner.maxHr, restingHr: runner.restingHr } : null}
      />
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    sky: 'bg-sky-50 text-sky-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className={`inline-flex items-center justify-center h-7 w-7 rounded-lg mb-1.5 ${colorMap[color] || colorMap.emerald}`}>{icon}</div>
      <div className="text-lg font-bold text-slate-900 leading-tight">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}

// 今日训练焦点卡片
function TodayFocusCard({ session, onUpload, onDetail }: {
  session: Session
  onUpload: () => void
  onDetail: () => void
}) {
  const cfg = SESSION_TYPES[session.type] || SESSION_TYPES.easy
  const isDone = session.status === 'completed'
  const isRest = session.type === 'rest'
  const c = session.completion

  return (
    <div className={`relative overflow-hidden rounded-2xl border shadow-lg ${
      isDone
        ? 'border-emerald-300 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white'
        : isRest
          ? 'border-slate-300 bg-gradient-to-br from-slate-600 to-slate-800 text-white'
          : 'border-amber-300 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white'
    }`}>
      {/* 装饰圆 */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-24 -mt-24 blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full -ml-16 -mb-16 blur-2xl pointer-events-none" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80 uppercase tracking-wider">今日训练</span>
            <span className="text-xs text-white/60">·</span>
            <span className="text-xs text-white/80">{DAY_LABELS[session.dayOfWeek]} {formatDate(session.date)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isDone ? (
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur">✓ 已完成</Badge>
            ) : isRest ? (
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur">休息日</Badge>
            ) : (
              <Badge className="bg-white/20 text-white border-white/30 backdrop-blur animate-pulse">待完成</Badge>
            )}
          </div>
        </div>

        <div className="flex items-start gap-4 mb-4">
          <div className="text-4xl sm:text-5xl">{cfg.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-2xl font-bold mb-1">{cfg.label}</h3>
            <p className="text-sm text-white/90 line-clamp-2">{session.description}</p>
          </div>
        </div>

        {/* 关键数据 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <FocusStat
            label={isDone ? '实际距离' : '计划距离'}
            value={isDone && c?.distance != null ? `${c.distance}` : session.plannedDistance != null ? `${session.plannedDistance}` : '-'}
            unit="km"
          />
          <FocusStat
            label={isDone ? '实际配速' : '目标配速'}
            value={isDone ? (c?.avgPace?.replace('/km', '') || '-') : (session.plannedPace?.replace('/km', '') || '-')}
            unit="/km"
          />
          <FocusStat
            label={isDone ? '平均心率' : '强度'}
            value={isDone ? (c?.avgHr != null ? `${c.avgHr}` : '-') : (session.intensity && session.intensity !== 'rest' ? session.intensity : '-')}
            unit={isDone && c?.avgHr != null ? 'bpm' : ''}
          />
        </div>

        {/* 操作按钮 */}
        {!isRest && (
          <div className="flex gap-2">
            {isDone ? (
              <button
                onClick={onDetail}
                className="flex-1 bg-white/20 hover:bg-white/30 backdrop-blur text-white font-medium py-2.5 px-4 rounded-xl transition-all text-sm flex items-center justify-center gap-1.5"
              >
                <Activity className="h-4 w-4" />查看详情与 AI 分析
              </button>
            ) : (
              <button
                onClick={onUpload}
                className="flex-1 bg-white hover:bg-white/90 text-orange-600 font-medium py-2.5 px-4 rounded-xl transition-all text-sm flex items-center justify-center gap-1.5 shadow-md"
              >
                <Upload className="h-4 w-4" />上传完成数据
              </button>
            )}
          </div>
        )}

        {/* 已完成的额外信息 */}
        {isDone && c && (
          <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-4 text-xs text-white/80">
            {c.duration != null && <span>⏱ {formatDuration(c.duration)}</span>}
            {c.elevation != null && <span>⛰ {c.elevation}m</span>}
            {c.weather && <span>☁ {c.weather}</span>}
            {c.rpe != null && <span>🔥 RPE {c.rpe}/10</span>}
            {c.feeling != null && <span>😊 {c.feeling}/10</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function FocusStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-white/15 backdrop-blur rounded-xl p-3">
      <div className="text-[10px] text-white/70 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="flex items-baseline gap-0.5">
        <span className="text-xl font-bold">{value}</span>
        {unit && <span className="text-[10px] text-white/70">{unit}</span>}
      </div>
    </div>
  )
}

// 占位组件 - 直接转发到独立视图实现
function UploadView({ week, selectedSessionId, setSelectedSessionId, refresh, logDate }: {
  week: Week | null
  selectedSessionId: string | null
  setSelectedSessionId: (id: string | null) => void
  refresh: () => void
  logDate?: string | null
}) {
  return <UploadViewImpl week={week} selectedSessionId={selectedSessionId} setSelectedSessionId={setSelectedSessionId} refresh={refresh} logDate={logDate} />
}

function ReviewView({ week, runner, refresh }: { week: Week | null; runner: Runner | null; refresh: () => void }) {
  return <ReviewViewImpl week={week} runner={runner} refresh={refresh} />
}

function HistoryView({ weeks, plans, onSelectWeek, onSwitchToReview, onChanged }: {
  weeks: Week[]
  plans: Plan[]
  onSelectWeek: (w: Week) => void
  onSwitchToReview: () => void
  onChanged: () => void
}) {
  return <HistoryViewImpl weeks={weeks} plans={plans} onSelectWeek={onSelectWeek} onSwitchToReview={onSwitchToReview} onChanged={onChanged} />
}

function ProfileView({ runner, refresh }: { runner: Runner | null; refresh: () => void }) {
  return <ProfileViewImpl runner={runner} refresh={refresh} />
}
