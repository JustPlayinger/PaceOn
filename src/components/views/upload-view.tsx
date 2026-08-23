'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, FileImage, X, Sparkles, Loader2, Save, RefreshCw, ChevronDown, Heart, Mountain, Cloud, Flame, Timer, Gauge, TrendingUp, Activity, Thermometer, Droplets, Wind, Footprints, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { SESSION_TYPES, DAY_LABELS, formatDate, formatDuration, secToPace, paceToSec } from '@/lib/training'
import type { Week } from './types'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts'

interface Props {
  week: Week | null
  selectedSessionId: string | null
  setSelectedSessionId: (id: string | null) => void
  refresh: () => void
  logDate?: string | null
}

interface ExtractedData {
  distance: number | null
  duration: number | null
  avgPace: string | null
  avgPaceSec: number | null
  avgHr: number | null
  maxHr: number | null
  elevation: number | null
  descent: number | null
  cadence: number | null
  strideLength: number | null
  steps: number | null
  calories: number | null
  avgSpeed: number | null
  vo2max: number | null
  hrRecovery: number | null
  groundContactTime: number | null
  verticalOscillation: number | null
  leftRightBalance: number | null
  weather: string | null
  temperature: number | null
  paceCurve: number[] | null
  hrCurve: number[] | null
  elevationCurve: number[] | null
  cadenceCurve: number[] | null
  splitPaces: number[] | null
  curveAnalysis: string | null
  appSource: string | null
  rawText: string
  notes: string | null
}

export function UploadViewImpl({ week, selectedSessionId, setSelectedSessionId, refresh, logDate: logDateProp }: Props) {
  const { toast } = useToast()
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 上传模式：session=绑定本周训练课；log=补录历史训练（指定日期）
  const [mode, setMode] = useState<'session' | 'log'>('session')
  const [logDate, setLogDate] = useState<string>(() => {
    if (logDateProp) return logDateProp
    const d = new Date()
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
  })
  useEffect(() => {
    if (logDateProp) {
      setMode('log')
      setLogDate(logDateProp)
    }
  }, [logDateProp])

  // 表单字段
  const [form, setForm] = useState({
    distance: '',
    duration: '', // 分钟
    avgPace: '',
    avgHr: '',
    maxHr: '',
    elevation: '',
    cadence: '',
    calories: '',
    weather: '晴',
    temperature: '',
    rpe: 5,
    feeling: 6,
    feelingNote: '',
    notes: '',
    shoeId: '',
  })

  const sessions = week?.sessions || []
  const sortedSessions = [...sessions].sort((a, b) => {
    const oa = a.dayOfWeek === 0 ? 7 : a.dayOfWeek
    const ob = b.dayOfWeek === 0 ? 7 : b.dayOfWeek
    return oa - ob
  })

  const currentSession = sortedSessions.find(s => s.id === selectedSessionId) || sortedSessions[0] || null

  // 加载在役跑鞋列表
  const [shoes, setShoes] = useState<{ id: string; name: string; brand: string | null; totalDistance: number; lifespan: number }[]>([])
  useEffect(() => {
    fetch('/api/shoes').then(r => r.json()).then(d => {
      const list = (d.shoes || []).filter((s: { retired: boolean }) => !s.retired)
      setShoes(list)
    }).catch(() => {})
  }, [])
  // 加载已有完成记录
  useEffect(() => {
    if (currentSession?.completion) {
      const c = currentSession.completion as { distance?: number | null; duration?: number | null; avgPace?: string | null; avgHr?: number | null; maxHr?: number | null; elevation?: number | null; cadence?: number | null; calories?: number | null; weather?: string | null; temperature?: number | null; rpe?: number | null; feeling?: number | null; feelingNote?: string | null; notes?: string | null; imageDataUrl?: string | null; shoeId?: string | null }
      setForm({
        distance: c.distance?.toString() || '',
        duration: c.duration ? Math.round(c.duration / 60).toString() : '',
        avgPace: c.avgPace || '',
        avgHr: c.avgHr?.toString() || '',
        maxHr: c.maxHr?.toString() || '',
        elevation: c.elevation?.toString() || '',
        cadence: c.cadence?.toString() || '',
        calories: c.calories?.toString() || '',
        weather: c.weather || '晴',
        temperature: c.temperature?.toString() || '',
        rpe: c.rpe || 5,
        feeling: c.feeling || 6,
        feelingNote: c.feelingNote || '',
        notes: c.notes || '',
        shoeId: c.shoeId || '',
      })
      if (c.imageDataUrl) {
        setImagePreview(c.imageDataUrl)
        setImageBase64(c.imageDataUrl.split(',')[1] || null)
      }
    } else {
      setForm({
        distance: '', duration: '', avgPace: '', avgHr: '', maxHr: '',
        elevation: '', cadence: '', calories: '', weather: '晴', temperature: '',
        rpe: 5, feeling: 6, feelingNote: '', notes: '', shoeId: '',
      })
      setImagePreview(null)
      setImageBase64(null)
      setExtracted(null)
    }
  }, [currentSession?.id, currentSession?.completion])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: '请上传图片文件', variant: 'destructive' })
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      setImagePreview(result)
      setImageBase64(result.split(',')[1] || null)
      setExtracted(null)
    }
    reader.readAsDataURL(file)
  }, [toast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleExtract = async () => {
    if (!imageBase64) {
      toast({ title: '请先上传训练截图', variant: 'destructive' })
      return
    }
    setExtracting(true)
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const d: ExtractedData = data.data
      setExtracted(d)
      // 自动填充表单
      setForm(f => ({
        ...f,
        distance: d.distance != null ? d.distance.toString() : f.distance,
        duration: d.duration != null ? Math.round(d.duration / 60).toString() : f.duration,
        avgPace: d.avgPace || f.avgPace,
        avgHr: d.avgHr != null ? d.avgHr.toString() : f.avgHr,
        maxHr: d.maxHr != null ? d.maxHr.toString() : f.maxHr,
        elevation: d.elevation != null ? d.elevation.toString() : f.elevation,
        cadence: d.cadence != null ? d.cadence.toString() : f.cadence,
        calories: d.calories != null ? d.calories.toString() : f.calories,
        weather: d.weather || f.weather,
        temperature: d.temperature != null ? d.temperature.toString() : f.temperature,
      }))
      toast({
        title: '✅ AI 识别完成',
        description: `已提取 ${countExtractedFields(d)} 项数据，请核对后保存`,
      })
    } catch (e) {
      toast({ title: '识别失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (mode === 'log') {
      if (!logDate) {
        toast({ title: '请选择训练日期', variant: 'destructive' })
        return
      }
      setSaving(true)
      try {
        const avgPaceSec = paceToSec(form.avgPace)
        const payload = {
          date: logDate,
          distance: form.distance ? parseFloat(form.distance) : null,
          duration: form.duration ? Math.round(parseFloat(form.duration) * 60) : null,
          avgPace: form.avgPace || null,
          avgPaceSec,
          avgHr: form.avgHr ? parseInt(form.avgHr) : null,
          maxHr: form.maxHr ? parseInt(form.maxHr) : null,
          elevation: form.elevation ? parseInt(form.elevation) : null,
          cadence: form.cadence ? parseInt(form.cadence) : null,
          calories: form.calories ? parseInt(form.calories) : null,
          weather: form.weather || null,
          temperature: form.temperature ? parseFloat(form.temperature) : null,
          rpe: form.rpe,
          feeling: form.feeling,
          feelingNote: form.feelingNote || null,
          notes: form.notes || null,
          shoeId: form.shoeId || null,
          imageDataUrl: imagePreview || null,
          rawExtract: extracted ? JSON.stringify(extracted) : null,
          source: 'manual',
        }
        const res = await fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        toast({ title: '✅ 已补录训练', description: `${logDate} · ${form.distance || 0}km` })
        setExtracted(null)
        setImagePreview(null)
        setImageBase64(null)
        refresh()
      } catch (e) {
        toast({ title: '补录失败', description: (e as Error).message, variant: 'destructive' })
      } finally {
        setSaving(false)
      }
      return
    }
    if (!currentSession) {
      toast({ title: '请选择训练课', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const avgPaceSec = paceToSec(form.avgPace)
      const payload = {
        distance: form.distance ? parseFloat(form.distance) : null,
        duration: form.duration ? Math.round(parseFloat(form.duration) * 60) : null,
        avgPace: form.avgPace || null,
        avgPaceSec,
        avgHr: form.avgHr ? parseInt(form.avgHr) : null,
        maxHr: form.maxHr ? parseInt(form.maxHr) : null,
        elevation: form.elevation ? parseInt(form.elevation) : null,
        cadence: form.cadence ? parseInt(form.cadence) : null,
        calories: form.calories ? parseInt(form.calories) : null,
        weather: form.weather || null,
        temperature: form.temperature ? parseFloat(form.temperature) : null,
        rpe: form.rpe,
        feeling: form.feeling,
        feelingNote: form.feelingNote || null,
        notes: form.notes || null,
        shoeId: form.shoeId || null,
        imageDataUrl: imagePreview || null,
        rawExtract: extracted ? JSON.stringify(extracted) : null,
      }
      const res = await fetch(`/api/sessions/${currentSession.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast({ title: '✅ 已保存完成记录', description: `${currentSession.type} - ${form.distance || 0}km` })
      refresh()
    } catch (e) {
      toast({ title: '保存失败', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if ((!week || sessions.length === 0) && mode !== 'log') {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-12 text-center">
        <Upload className="mx-auto h-10 w-10 text-slate-300 mb-3" />
        <p className="text-slate-500">暂无课表可上传数据</p>
        <p className="text-xs text-slate-400 mt-1">可切换到「补录历史训练」模式，按日期记录前些日子的实跑数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 上传模式切换 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === 'session' ? 'default' : 'outline'} onClick={() => setMode('session')} className={mode === 'session' ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-slate-200 text-slate-600'}>
            <Activity className="h-3.5 w-3.5 mr-1" />绑定本周训练课
          </Button>
          <Button size="sm" variant={mode === 'log' ? 'default' : 'outline'} onClick={() => setMode('log')} className={mode === 'log' ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-slate-200 text-slate-600'}>
            <Calendar className="h-3.5 w-3.5 mr-1" />补录历史训练
          </Button>
        </div>
        {mode === 'log' && (
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1.5 block">训练日期</Label>
              <Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} />
            </div>
            <p className="sm:pt-5 text-xs text-slate-400 leading-relaxed">记录前些日子的实跑数据，AI 生成课表时会参考这些历史训练。</p>
          </div>
        )}
      </div>

      {mode === 'session' && (<>
      {/* 课表选择 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Label className="text-xs text-slate-500 mb-1.5 block">选择训练课</Label>
        <Select value={currentSession?.id || ''} onValueChange={setSelectedSessionId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择要上传完成数据的训练课" />
          </SelectTrigger>
          <SelectContent>
            {sortedSessions.map(s => {
              const cfg = SESSION_TYPES[s.type] || SESSION_TYPES.easy
              return (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span>{cfg.icon}</span>
                    <span>{DAY_LABELS[s.dayOfWeek]} · {cfg.label}</span>
                    {s.plannedDistance != null && <span className="text-xs text-slate-400">{s.plannedDistance}km</span>}
                    {s.status === 'completed' && <Badge className="ml-1 h-4 text-[10px] bg-emerald-100 text-emerald-700">已完成</Badge>}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {currentSession && (
          <div className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            <span className="font-medium text-slate-700">计划：</span>
            {currentSession.plannedDistance != null && `${currentSession.plannedDistance}km · `}
            {currentSession.plannedPace || '配速 -'} · {currentSession.description}
          </div>
        )}
      </div>
      </>)}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* 左侧：上传 + 识别 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <FileImage className="h-4 w-4 text-emerald-600" />
                训练截图
              </h3>
              {imagePreview && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500" onClick={() => { setImagePreview(null); setImageBase64(null); setExtracted(null) }}>
                  <X className="h-3 w-3 mr-1" />清除
                </Button>
              )}
            </div>

            {!imagePreview ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                  dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-50/50 hover:border-emerald-300 hover:bg-emerald-50/30'
                }`}
              >
                <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-600">点击或拖拽上传训练 App 截图</p>
                <p className="text-xs text-slate-400 mt-1">支持 Keep / 悦跑圈 / Garmin / Strava / 华为运动健康 等长图</p>
                <p className="text-[10px] text-slate-400 mt-1">JPG / PNG / WebP · AI 会自动识别距离、配速、心率、爬升等</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-h-80 flex items-center justify-center">
                  <img src={imagePreview} alt="训练截图" className="max-h-80 object-contain" />
                </div>
                <Button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                >
                  {extracting ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />AI 识别中...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1.5" />{extracted ? '重新识别' : 'AI 智能识别数据'}</>
                  )}
                </Button>
              </div>
            )}

            {extracted && (
              <div className="mt-3 rounded-lg bg-emerald-50/70 border border-emerald-100 p-3">
                <div className="flex items-center justify-between gap-1.5 text-xs font-medium text-emerald-700 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" />AI 识别结果（已自动填入表单）
                  </div>
                  {extracted.appSource && (
                    <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-200">
                      来源：{extracted.appSource}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <ExtractChip label="距离" value={extracted.distance != null ? `${extracted.distance} km` : null} />
                  <ExtractChip label="时长" value={extracted.duration != null ? formatDuration(extracted.duration) : null} />
                  <ExtractChip label="配速" value={extracted.avgPace} />
                  <ExtractChip label="均心率" value={extracted.avgHr != null ? `${extracted.avgHr} bpm` : null} />
                  <ExtractChip label="最大心率" value={extracted.maxHr != null ? `${extracted.maxHr} bpm` : null} />
                  <ExtractChip label="爬升" value={extracted.elevation != null ? `${extracted.elevation} m` : null} />
                  <ExtractChip label="步频" value={extracted.cadence != null ? `${extracted.cadence} spm` : null} />
                  <ExtractChip label="步幅" value={extracted.strideLength != null ? `${extracted.strideLength} cm` : null} />
                  <ExtractChip label="卡路里" value={extracted.calories != null ? `${extracted.calories} kcal` : null} />
                  <ExtractChip label="VO2max" value={extracted.vo2max != null ? `${extracted.vo2max}` : null} />
                  <ExtractChip label="心率恢复" value={extracted.hrRecovery != null ? `${extracted.hrRecovery} bpm` : null} />
                  <ExtractChip label="触地时间" value={extracted.groundContactTime != null ? `${extracted.groundContactTime} ms` : null} />
                  <ExtractChip label="垂直振幅" value={extracted.verticalOscillation != null ? `${extracted.verticalOscillation} cm` : null} />
                  <ExtractChip label="左右平衡" value={extracted.leftRightBalance != null ? `左 ${extracted.leftRightBalance}%` : null} />
                </div>
                {extracted.curveAnalysis && (
                  <div className="mt-2 text-[11px] text-slate-700 bg-white border border-emerald-100 rounded p-2">
                    <span className="font-medium text-emerald-700">📊 折线图趋势：</span>
                    {extracted.curveAnalysis}
                  </div>
                )}
                {extracted.notes && (
                  <div className="mt-2 text-[11px] text-slate-600 italic border-t border-emerald-100 pt-1.5">
                    💡 {extracted.notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 折线图展示 */}
          {(extracted?.paceCurve || extracted?.hrCurve || extracted?.elevationCurve || extracted?.cadenceCurve || extracted?.splitPaces) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-emerald-600" />
                折线图识别（趋势分析）
              </h3>
              <p className="text-[10px] text-slate-400 mb-3">VLM 从截图中识别的训练曲线，AI 分析时将作为重要参考</p>
              <div className="space-y-3">
                {extracted.hrCurve && extracted.hrCurve.length > 1 && (
                  <CurveChart title="心率曲线 (bpm)" data={extracted.hrCurve.map((v, i) => ({ x: i + 1, v }))} color="#ef4444" unit="bpm" />
                )}
                {extracted.paceCurve && extracted.paceCurve.length > 1 && (
                  <CurveChart title="配速曲线 (秒/km，越低越快)" data={extracted.paceCurve.map((v, i) => ({ x: i + 1, v }))} color="#f97316" unit="s" invert />
                )}
                {extracted.cadenceCurve && extracted.cadenceCurve.length > 1 && (
                  <CurveChart title="步频曲线 (spm)" data={extracted.cadenceCurve.map((v, i) => ({ x: i + 1, v }))} color="#eab308" unit="spm" />
                )}
                {extracted.elevationCurve && extracted.elevationCurve.length > 1 && (
                  <CurveChart title="海拔曲线 (m)" data={extracted.elevationCurve.map((v, i) => ({ x: i + 1, v }))} color="#10b981" unit="m" />
                )}
                {extracted.splitPaces && extracted.splitPaces.length > 1 && (
                  <CurveChart title="分段配速 (每公里，秒/km)" data={extracted.splitPaces.map((v, i) => ({ x: i + 1, v }))} color="#8b5cf6" unit="s" invert />
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：可编辑表单 */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <Save className="h-4 w-4 text-emerald-600" />
              完成数据（可手动修正）
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FormField label="距离 (km)" icon={<TrendingUp className="h-3 w-3" />} warn={getFieldWarn('distance', form.distance)}>
                <Input type="number" step="0.01" value={form.distance} onChange={e => setForm({ ...form, distance: e.target.value })} placeholder="10.5" />
              </FormField>
              <FormField label="时长 (分钟)" icon={<Timer className="h-3 w-3" />} warn={getFieldWarn('duration', form.duration)}>
                <Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="55" />
              </FormField>
              <FormField label="平均配速" icon={<Gauge className="h-3 w-3" />} warn={getFieldWarn('avgPace', form.avgPace)}>
                <Input value={form.avgPace} onChange={e => setForm({ ...form, avgPace: e.target.value })} placeholder="5:30/km" />
              </FormField>
              <FormField label="平均心率" icon={<Heart className="h-3 w-3" />} warn={getFieldWarn('avgHr', form.avgHr)}>
                <Input type="number" value={form.avgHr} onChange={e => setForm({ ...form, avgHr: e.target.value })} placeholder="155" />
              </FormField>
              <FormField label="最大心率" icon={<Heart className="h-3 w-3" />} warn={getFieldWarn('maxHr', form.maxHr)}>
                <Input type="number" value={form.maxHr} onChange={e => setForm({ ...form, maxHr: e.target.value })} placeholder="175" />
              </FormField>
              <FormField label="爬升 (m)" icon={<Mountain className="h-3 w-3" />} warn={getFieldWarn('elevation', form.elevation)}>
                <Input type="number" value={form.elevation} onChange={e => setForm({ ...form, elevation: e.target.value })} placeholder="120" />
              </FormField>
              <FormField label="步频 (spm)" icon={<Activity className="h-3 w-3" />} warn={getFieldWarn('cadence', form.cadence)}>
                <Input type="number" value={form.cadence} onChange={e => setForm({ ...form, cadence: e.target.value })} placeholder="180" />
              </FormField>
              <FormField label="卡路里" icon={<Flame className="h-3 w-3" />} warn={getFieldWarn('calories', form.calories)}>
                <Input type="number" value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })} placeholder="650" />
              </FormField>
              <FormField label="温度 (℃)" icon={<Thermometer className="h-3 w-3" />} warn={getFieldWarn('temperature', form.temperature)}>
                <Input type="number" value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value })} placeholder="18" />
              </FormField>
            </div>

            {/* 跨字段一致性校验 */}
            <ValidationWarnings form={form} />

            <div className="mt-3">
              <FormField label="天气" icon={<Cloud className="h-3 w-3" />}>
                <Select value={form.weather} onValueChange={v => setForm({ ...form, weather: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['晴', '多云', '阴', '小雨', '中雨', '大雨', '雪', '雾', '大风'].map(w => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {/* 跑鞋选择 */}
            <div className="mt-3">
              <FormField label="使用跑鞋（自动累计里程）" icon={<Footprints className="h-3 w-3" />}>
                <Select value={form.shoeId} onValueChange={v => setForm({ ...form, shoeId: v === '__none__' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="选择本次训练使用的跑鞋" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">不关联跑鞋</SelectItem>
                    {shoes.map(s => {
                      const wear = s.lifespan > 0 ? Math.round((s.totalDistance / s.lifespan) * 100) : 0
                      const warn = wear >= 85 ? ' ⚠️' : ''
                      return (
                        <SelectItem key={s.id} value={s.id}>
                          👟 {s.name}{s.brand ? ` · ${s.brand}` : ''} · {s.totalDistance}/{s.lifespan}km ({wear}%{warn})
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </FormField>
              {shoes.length === 0 && (
                <p className="text-[10px] text-slate-400 mt-1">暂无跑鞋，请先在「跑鞋追踪」中添加</p>
              )}
              {form.shoeId && (() => {
                const sel = shoes.find(s => s.id === form.shoeId)
                if (!sel) return null
                const wear = sel.lifespan > 0 ? Math.round((sel.totalDistance / sel.lifespan) * 100) : 0
                if (wear >= 85) {
                  return (
                    <div className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
                      ⚠️ 该跑鞋已磨损 {wear}%，剩余 {Math.max(0, sel.lifespan - sel.totalDistance)}km，建议关注换鞋时机
                    </div>
                  )
                }
                return null
              })()}
            </div>
          </div>

          {/* 体感评估 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
              <Droplets className="h-4 w-4 text-emerald-600" />
              主观体感评估
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <Label className="text-xs text-slate-600">RPE 主观疲劳度 (1-10)</Label>
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">{form.rpe} / 10</Badge>
                </div>
                <Slider value={[form.rpe]} min={1} max={10} step={1} onValueChange={v => setForm({ ...form, rpe: v[0] })} />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>非常轻松</span><span>非常吃力</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <Label className="text-xs text-slate-600">体感评分 (1-10)</Label>
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{form.feeling} / 10</Badge>
                </div>
                <Slider value={[form.feeling]} min={1} max={10} step={1} onValueChange={v => setForm({ ...form, feeling: v[0] })} />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>糟糕</span><span>极佳</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">体感描述（可选）</Label>
                <Textarea
                  value={form.feelingNote}
                  onChange={e => setForm({ ...form, feelingNote: e.target.value })}
                  placeholder="如：腿部略沉重，但呼吸平稳；后半程风较大..."
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1.5 block">备注（可选）</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="如：与跑团一起；新换的跑鞋；补给策略..."
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-base font-medium"
          >
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />保存中...</> : <><Save className="h-4 w-4 mr-1.5" />{mode === 'log' ? '保存补录记录' : '保存完成记录'}</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

function countExtractedFields(d: ExtractedData): number {
  let n = 0
  if (d.distance != null) n++
  if (d.duration != null) n++
  if (d.avgPace) n++
  if (d.avgHr != null) n++
  if (d.maxHr != null) n++
  if (d.elevation != null) n++
  if (d.cadence != null) n++
  if (d.strideLength != null) n++
  if (d.calories != null) n++
  if (d.vo2max != null) n++
  if (d.hrRecovery != null) n++
  if (d.groundContactTime != null) n++
  if (d.verticalOscillation != null) n++
  if (d.leftRightBalance != null) n++
  if (d.weather) n++
  if (d.temperature != null) n++
  if (d.paceCurve?.length) n++
  if (d.hrCurve?.length) n++
  if (d.elevationCurve?.length) n++
  if (d.cadenceCurve?.length) n++
  if (d.splitPaces?.length) n++
  if (d.curveAnalysis) n++
  return n
}

function FormField({ label, icon, warn, children }: { label: string; icon: React.ReactNode; warn?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-slate-500 mb-1 flex items-center gap-1">
        <span className="text-slate-400">{icon}</span>{label}
        {warn && <span className="text-amber-600 text-[10px] ml-auto">⚠ {warn}</span>}
      </Label>
      {children}
    </div>
  )
}

// 单字段合理性校验
function getFieldWarn(field: string, value: string): string | null {
  if (!value) return null
  const n = parseFloat(value)
  if (isNaN(n)) return null
  const rules: Record<string, { min: number; max: number; unit: string }> = {
    distance: { min: 0.1, max: 200, unit: 'km' },
    duration: { min: 1, max: 1440, unit: 'min' },
    avgHr: { min: 40, max: 230, unit: 'bpm' },
    maxHr: { min: 40, max: 240, unit: 'bpm' },
    elevation: { min: 0, max: 5000, unit: 'm' },
    cadence: { min: 100, max: 240, unit: 'spm' },
    calories: { min: 0, max: 5000, unit: 'kcal' },
    temperature: { min: -30, max: 55, unit: '℃' },
  }
  if (field === 'avgPace') {
    const m = value.match(/^(\d+):(\d+)/)
    if (m) {
      const sec = parseInt(m[1]) * 60 + parseInt(m[2])
      if (sec < 120) return '过快'
      if (sec > 1200) return '过慢'
    }
    return null
  }
  const r = rules[field]
  if (!r) return null
  if (n < r.min) return `低于 ${r.min}${r.unit}`
  if (n > r.max) return `高于 ${r.max}${r.unit}`
  return null
}

// 跨字段一致性校验
function ValidationWarnings({ form }: { form: { distance: string; duration: string; avgPace: string; avgHr: string; maxHr: string } }) {
  const warnings: { level: 'warn' | 'error'; text: string }[] = []

  // 心率：avgHr 应 <= maxHr
  const avgHr = parseFloat(form.avgHr)
  const maxHr = parseFloat(form.maxHr)
  if (!isNaN(avgHr) && !isNaN(maxHr) && avgHr > maxHr) {
    warnings.push({ level: 'error', text: `平均心率(${avgHr}) 不能大于最大心率(${maxHr})` })
  }

  // 配速 vs 距离/时长一致性
  const dist = parseFloat(form.distance)
  const dur = parseFloat(form.duration)
  const paceMatch = form.avgPace.match(/^(\d+):(\d+)/)
  if (!isNaN(dist) && !isNaN(dur) && paceMatch && dist > 0 && dur > 0) {
    const paceSec = parseInt(paceMatch[1]) * 60 + parseInt(paceMatch[2])
    const computedPace = (dur * 60) / dist
    const diff = Math.abs(paceSec - computedPace) / computedPace
    if (diff > 0.15) {
      warnings.push({
        level: 'warn',
        text: `配速与距离/时长不一致：按 ${dist}km / ${dur}min 计算应约 ${Math.floor(computedPace / 60)}:${Math.round(computedPace % 60).toString().padStart(2, '0')}/km`,
      })
    }
  }

  // 心率区间合理性（最大心率一般 180-210）
  if (!isNaN(maxHr) && (maxHr < 150 || maxHr > 230)) {
    warnings.push({ level: 'warn', text: `最大心率 ${maxHr} bpm 异常，正常范围约 180-210` })
  }

  if (warnings.length === 0) return null

  return (
    <div className="mt-3 space-y-1.5">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            w.level === 'error'
              ? 'bg-rose-50 border border-rose-200 text-rose-700'
              : 'bg-amber-50 border border-amber-200 text-amber-700'
          }`}
        >
          <span>{w.level === 'error' ? '⛔' : '⚠️'}</span>
          <span>{w.text}</span>
        </div>
      ))}
    </div>
  )
}

function ExtractChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-1 bg-white rounded px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  )
}

function CurveChart({ title, data, color, unit, invert }: { title: string; data: { x: number; v: number }[]; color: string; unit: string; invert?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-600 mb-1 font-medium">{title}</div>
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="x" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={invert ? ['dataMax', 'dataMin'] : ['auto', 'auto']} />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
            formatter={(v: number) => [`${v} ${unit}`, '']}
            labelFormatter={(l) => `第${l}点`}
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#grad-${title})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
