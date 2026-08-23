/**
 * 离线版 AI 模块（纯前端离线 APK）。DeepSeek 支持浏览器直连（CORS 已验证），此模块在浏览器内直接调用。
 */
import { getDeepseekConfig } from './config'

export interface RunnerProfile { name: string; age?: number | null; gender?: string | null; weight?: number | null; restingHr?: number | null; maxHr?: number | null; vo2max?: number | null; experience?: string | null; targetRace?: string | null; targetDate?: string | null; targetTime?: string | null; weeklyMileage?: number | null; notes?: string | null }
export interface SessionForReview { date: string; dayOfWeek: number; type: string; plannedDistance?: number | null; plannedDuration?: number | null; plannedPace?: string | null; intensity?: string | null; description?: string | null; status: string; completion?: Record<string, unknown> | null }
export interface PlannedSession { dayOfWeek: number; type: string; plannedDistance: number | null; plannedDuration: number | null; plannedPace: string | null; intensity: string | null; description: string }
export interface PlanResult { weekGoal: string; phase: string; sessions: PlannedSession[]; summary: string }
/** 独立历史训练记录（补录）的 AI 输入结构 */
export interface RecentTrainingLog { date: string; distance: number | null; duration: number | null; avgPace: string | null; avgHr: number | null; elevation: number | null; rpe: number | null; feeling: number | null; notes: string | null }
export interface ReviewResult { rating: number; content: string; suggestions: { type: string; text: string }[] }
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export async function callDeepseekApi(prompt: string): Promise<string> {
  const cfg = getDeepseekConfig()
  if (!cfg.apiKey) throw new Error('未配置 DeepSeek API Key')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: '你是一位专业的跑步教练AI助手，擅长分析训练数据并提供专业建议。请用中文回答。' }, { role: 'user', content: prompt }], temperature: 0.7, max_tokens: 2000 }),
      signal: controller.signal,
    })
    if (!res.ok) { const err = await res.text().catch(() => ''); throw new Error(`DeepSeek API 错误 ${res.status}: ${err.slice(0, 200)}`) }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  } finally { clearTimeout(timer) }
}
export const OCR_PARSE_PROMPT = `你是一个专业的跑步训练数据分析助手。以下是跑步 App 训练记录截图的 OCR 识别文字，可能包含噪音、错字或多余字符。

请尽可能准确地从文字中提取以下数据，并严格按 JSON 格式返回（只返回 JSON）：
{
  "distance": 距离(km, 数字, 无则null),
  "duration": 时长(秒, 数字, 如 32分15秒=1935, 无则null),
  "avgPace": 平均配速(字符串如 "5:30/km", 无则null),
  "avgPaceSec": 平均配速(秒/km, 数字如 330表示5:30, 无则null),
  "avgHr": 平均心率(数字, 无则null),
  "maxHr": 最大心率(数字, 无则null),
  "elevation": 累计爬升(米, 数字, 无则null),
  "cadence": 平均步频(数字, 无则null),
  "steps": 总步数(数字, 无则null),
  "calories": 消耗卡路里(数字, 无则null),
  "avgSpeed": 平均速度(km/h, 数字, 无则null),
  "weather": 天气(字符串如 "晴" "阴" "雨", 无则null),
  "temperature": 温度(摄氏度数字, 无则null),
  "appSource": 来源App名称(字符串, 无则null)
}

注意：配速 "M:SS/km" 转秒 = M*60+SS；只依据文字提取不得编造；数字字段必须是数字类型`

export interface ParsedTrainingData { distance: number | null; duration: number | null; avgPace: string | null; avgPaceSec: number | null; avgHr: number | null; maxHr: number | null; elevation: number | null; cadence: number | null; steps: number | null; calories: number | null; avgSpeed: number | null; weather: string | null; temperature: number | null; appSource: string | null; notes: string | null; rawText: string }

export function parseJsonData(content: string): Record<string, unknown> | null {
  let jsonStr = content.trim()
  const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) jsonStr = codeBlock[1].trim()
  const start = jsonStr.indexOf('{'); const end = jsonStr.lastIndexOf('}')
  if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1)
  try { return JSON.parse(jsonStr) } catch { return null }
}

export function parseExtractedFields(jsonStr: string): ParsedTrainingData {
  const parsed = parseJsonData(jsonStr) || {}
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  let avgPace: string | null = typeof parsed.avgPace === 'string' ? parsed.avgPace : null
  let avgPaceSec: number | null = num(parsed.avgPaceSec)
  if (typeof avgPace === 'string') {
    const pm = avgPace.match(/(\d{1,2})\s*[:'’′]\s*(\d{2})/)
    if (pm) { const m = parseInt(pm[1], 10); const s = parseInt(pm[2], 10); avgPace = `${m}:${pm[2]}/km`; if (avgPaceSec == null && !Number.isNaN(m) && !Number.isNaN(s)) avgPaceSec = m * 60 + s }
  }
  return { distance: num(parsed.distance), duration: num(parsed.duration), avgPace, avgPaceSec, avgHr: num(parsed.avgHr), maxHr: num(parsed.maxHr), elevation: num(parsed.elevation), cadence: num(parsed.cadence), steps: num(parsed.steps), calories: num(parsed.calories), avgSpeed: num(parsed.avgSpeed), weather: typeof parsed.weather === 'string' ? parsed.weather : null, temperature: num(parsed.temperature), appSource: typeof parsed.appSource === 'string' ? parsed.appSource : null, notes: typeof parsed.notes === 'string' ? parsed.notes : null, rawText: '' }
}
const mockReview: ReviewResult = { rating: 82, content: '本周训练完成良好，整体强度适中。建议继续保持节奏跑与长距离跑的搭配，同时增加一次恢复跑以帮助身体恢复。', suggestions: [{ type: '训练量', text: '保持每周一次长跑以提升耐力' }, { type: '恢复', text: '增加一次轻松恢复跑，降低疲劳积累' }, { type: '营养', text: '训练后补充充足蛋白和碳水化合物' }] }

function parseReviewResult(content: string): ReviewResult {
  const parsed = parseJsonData(content)
  if (parsed) return { rating: typeof parsed.rating === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.rating))) : 75, content: typeof parsed.content === 'string' ? parsed.content : content, suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] }
  return { rating: 75, content, suggestions: [] }
}

export async function generateWeeklyReview(runner: RunnerProfile, weekGoal: string | null, phase: string | null, sessions: SessionForReview[]): Promise<ReviewResult> {
  const completedSessions = sessions.filter((s) => s.completion)
  if (completedSessions.length === 0) return { rating: 0, content: '本周还没有完成训练记录，完成训练后生成点评更准确。', suggestions: [] }
  const totalDistance = sessions.reduce((sum, s) => sum + (typeof s.completion?.distance === 'number' ? s.completion.distance : 0), 0)
  const userPrompt = `请为以下跑者本周的训练完成情况做点评。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

== 本周训练目标 ==
${weekGoal || '未设定'}
训练阶段：${phase || '未设定'}

== 本周课表与完成情况 ==
${JSON.stringify(sessions, null, 2)}

请从以下角度分析：
1. 完成度：实际 vs 计划（距离、次数）
2. 强度匹配：配速/心率是否落在目标区间
3. 心率分析：有氧/无氧区间分布、心率漂移
4. 疲劳管理：RPE 与体感是否合理
5. 进步与不足：本周亮点与待改进点
6. 下周建议：针对不足给出 2-4 条可执行建议

请严格按以下 JSON 格式返回（只返回 JSON）：
{
  "rating": 0-100的整数评分,
  "content": "markdown格式的详细点评，使用 ## 标题分节",
  "suggestions": [{"type": "category", "text": "具体建议"}, ...]
}`
  try { return parseReviewResult(await callDeepseekApi(userPrompt)) }
  catch (e) {
    console.warn('[offline-ai] 点评失败，使用兜底:', (e as Error).message)
    const completedCount = completedSessions.length
    return { ...mockReview, rating: Math.min(100, 70 + completedCount * 4 + Math.round(totalDistance / 10)), content: `本周训练已完成 ${completedCount} 次，有效跑量约 ${totalDistance.toFixed(1)}km。${weekGoal || ''}` }
  }
}
const sessionTemplates: PlannedSession[] = [
  { dayOfWeek: 1, type: 'easy', plannedDistance: 8, plannedDuration: 50, plannedPace: '6:00/km', intensity: 'Z2', description: '轻松跑 8km，注意呼吸与放松。' },
  { dayOfWeek: 2, type: 'rest', plannedDistance: null, plannedDuration: null, plannedPace: null, intensity: 'rest', description: '休息日，可拉伸或进行低强度活动。' },
  { dayOfWeek: 3, type: 'tempo', plannedDistance: 12, plannedDuration: 72, plannedPace: '5:30/km', intensity: 'Z3', description: '节奏跑 12km，前后各 2km 热身/冷身。' },
  { dayOfWeek: 4, type: 'easy', plannedDistance: 6, plannedDuration: 38, plannedPace: '6:20/km', intensity: 'Z2', description: '恢复跑 6km，保持轻松配速。' },
  { dayOfWeek: 5, type: 'rest', plannedDistance: null, plannedDuration: null, plannedPace: null, intensity: 'rest', description: '休息日，可做柔韧性训练。' },
  { dayOfWeek: 6, type: 'long', plannedDistance: 16, plannedDuration: 100, plannedPace: '5:45/km', intensity: 'Z2', description: '长跑 16km，保持稳定节奏。' },
  { dayOfWeek: 0, type: 'recovery', plannedDistance: 5, plannedDuration: 32, plannedPace: '6:40/km', intensity: 'Z1', description: '恢复跑 5km，轻松完成。' },
]

function buildPlan(runner: RunnerProfile, totalMileage: number, phase: string, weekNumber: number, reviewText?: string): PlanResult {
  const goal = `第${weekNumber}周${phase === 'build' ? '强化期' : phase === 'peak' ? '巅峰期' : phase === 'taper' ? '减量期' : '基础期'}训练，目标周跑量 ${totalMileage}km。`
  const summary = reviewText ? '基于上周数据与训练反馈生成，保持节奏与恢复平衡。' : '本期训练以稳定耐力为核心，兼顾节奏与恢复。'
  return { weekGoal: goal, phase, summary, sessions: sessionTemplates.map((session) => ({ ...session, plannedDistance: session.plannedDistance === null ? null : Math.max(0, Math.round((session.plannedDistance / 16) * totalMileage * 10) / 10) })) }
}

function parsePlanResult(content: string): PlanResult {
  const parsed = parseJsonData(content)
  if (parsed) return { weekGoal: typeof parsed.weekGoal === 'string' ? parsed.weekGoal : '本周训练课表', phase: typeof parsed.phase === 'string' ? parsed.phase : 'build', summary: typeof parsed.summary === 'string' ? parsed.summary : '', sessions: Array.isArray(parsed.sessions) ? parsed.sessions.map((s: PlannedSession) => ({ dayOfWeek: typeof s.dayOfWeek === 'number' ? s.dayOfWeek : 1, type: s.type || 'easy', plannedDistance: typeof s.plannedDistance === 'number' ? s.plannedDistance : null, plannedDuration: typeof s.plannedDuration === 'number' ? s.plannedDuration : null, plannedPace: s.plannedPace ?? null, intensity: s.intensity ?? null, description: s.description || '' })) : [] }
  return { weekGoal: '本周训练课表', phase: 'build', summary: content, sessions: [] }
}

const PLAN_PROMPT = `要求：
1. 一周 7 天（dayOfWeek: 1=周一 ... 7=周日，0 也代表周日）
2. 合理安排休息日（通常 1-2 天）
3. 包含 1 次长跑、1-2 次质量课（interval 或 tempo），其余为轻松跑或恢复跑
4. 配速基于跑者目标成绩与当前水平
5. 周跑量参考跑者档案 weeklyMileage，渐进增加
6. 每节课给出明确训练内容描述

请严格按以下 JSON 格式返回（只返回 JSON）：
{
  "weekGoal": "本周训练目标，1-2句话",
  "phase": "base|build|peak|taper|recovery",
  "summary": "本周课表整体说明",
  "sessions": [
    { "dayOfWeek": 1-7 或 0, "type": "easy|tempo|interval|long|recovery|rest|cross", "plannedDistance": 数字或null, "plannedDuration": 数字或null, "plannedPace": "5:30/km" 或 null, "intensity": "Z1|Z2|Z3|Z4|Z5|rest", "description": "详细训练内容说明" }
  ]
}`

export async function generateNextWeekPlan(runner: RunnerProfile, lastWeekSessions: SessionForReview[], lastReview: string | null, weekNumber: number, recentLogs: RecentTrainingLog[] = []): Promise<PlanResult> {
  const userPrompt = `请为以下跑者生成第 ${weekNumber} 周的训练课表。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

== 上周训练完成情况 ==
${JSON.stringify(lastWeekSessions, null, 2)}

== 近期实际训练记录（补录/历史实跑，含日期） ==
${recentLogs.length > 0 ? JSON.stringify(recentLogs, null, 2) : '无'}

== 上周 AI 点评 ==
${lastReview || '无'}

${PLAN_PROMPT}

补充要求：结合"近期实际训练记录"评估跑者当前状态与疲劳，若近期跑量偏高或体感差适当降低下周强度与跑量，训练不足则从合理强度起步。`
  try { return parsePlanResult(await callDeepseekApi(userPrompt)) }
  catch {
    const lastDistance = lastWeekSessions.reduce((sum, s) => sum + (typeof s.completion?.distance === 'number' ? s.completion.distance : 0), 0)
    const logDistance = recentLogs.reduce((sum, l) => sum + (l.distance || 0), 0)
    const baseMileage = runner.weeklyMileage ?? 40
    const totalMileage = Math.max(30, Math.round(((lastDistance || logDistance) || baseMileage) * 1.05))
    const phase = weekNumber >= 4 ? 'build' : weekNumber >= 8 ? 'peak' : weekNumber >= 10 ? 'taper' : 'base'
    return buildPlan(runner, totalMileage, phase, weekNumber, lastReview ?? undefined)
  }
}

export async function generateInitialPlan(runner: RunnerProfile): Promise<PlanResult> {
  const userPrompt = `请为以下跑者生成第 1 周的基础训练课表。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

${PLAN_PROMPT}`
  try { return parsePlanResult(await callDeepseekApi(userPrompt)) }
  catch { return buildPlan(runner, runner.weeklyMileage ?? 40, 'base', 1) }
}
const CHAT_SYSTEM_PROMPT = `你是一位资深的长跑教练，正在通过对话了解跑者的具体情况，以便为其制定个性化训练课表。你要像真人教练一样，尽可能全面地收集信息、持续追问，直到掌握足够细节。

== 需要收集的信息（跑者档案已有的可跳过，但对话中新的信息优先） ==
1. 身体与伤病：当前是否有伤病、疼痛、疲劳？最近是否停跑？停跑多久？恢复训练多久了？有无慢性疾病？
2. 训练目标：目标赛事（5K/10K/半马/全马）、目标日期、目标成绩；或近期想达到的水平
3. 当前水平：最近一次长跑的距离与配速、当前周跑量、每周训练次数、跑步年限
4. 时间安排：每周能训练几天？每次大概多久？偏好的时间段？有无固定休息日？
5. 训练偏好：喜欢/抵触的训练类型（间歇/节奏/长距离/力量）？有无健身房？
6. 恢复与生活：睡眠情况、饮食、工作压力、久坐或体力劳动？
7. 环境因素：高原/高温/严寒/多坡道？常在什么场地跑？
8. 历史参考：最近一次比赛成绩？有没有心率手表/跑步手表？

== 对话要求 ==
- 每轮只问 1-2 个关键问题，根据跑者回答深入追问，不一次性轰炸
- 跑者已回答的信息不再重复问，只追问缺失的维度
- 至少收集 6-8 个维度的信息后才算信息充分
- 语气亲切专业，像真人教练聊天
- 信息齐全后，回复以 "[READY]" 开头表示可以生成课表了
- 若跑者信息与档案冲突，以对话中的新信息为准

请以 JSON 格式返回（只返回 JSON）：
{
  "reply": "你的回复内容（对话式，亲切专业）",
  "ready": false 或 true,
  "questions": ["问题1", "问题2"]（ready=true 时为空数组）
}`

function parseChatResult(content: string): { reply: string; ready: boolean; questions: string[] } {
  const parsed = parseJsonData(content)
  if (parsed) return { reply: typeof parsed.reply === 'string' ? parsed.reply : content, ready: Boolean(parsed.ready), questions: Array.isArray(parsed.questions) ? parsed.questions : [] }
  const ready = content.includes('[READY]')
  return { reply: content.replace('[READY]', '').trim(), ready, questions: [] }
}

export async function chatWithCoach(runner: RunnerProfile | null, history: ChatMessage[], currentMessage: string): Promise<{ reply: string; ready: boolean; questions: string[] }> {
  const cfg = getDeepseekConfig()
  if (!cfg.apiKey) {
    return { reply: '⚠️ 尚未配置 DeepSeek API Key。请到「数据管理」→「离线模式」填写 API Key 后再开始对话（Key 仅保存在本机）。', ready: false, questions: [] }
  }
  const conversationContext = history.map((m) => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n')
  const runnerInfo = runner ? `跑者档案：${JSON.stringify(runner, null, 2)}` : '暂无跑者档案'
  try {
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: CHAT_SYSTEM_PROMPT }, ...history, { role: 'user', content: `${runnerInfo}\n\n== 对话历史 ==\n${conversationContext || '（刚开始对话）'}\n\n== 跑者最新消息 ==\n${currentMessage}\n\n请根据以上信息回复。` }], temperature: 0.7, max_tokens: 1200 }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { reply: `⚠️ 对话请求失败（${res.status}）。请检查 DeepSeek API Key 是否正确、账户是否有余额、网络是否可用。${errText.slice(0, 120)}`, ready: false, questions: [] }
    }
    const data = await res.json()
    return parseChatResult(data.choices?.[0]?.message?.content || '')
  } catch (e) {
    return { reply: '⚠️ 网络或服务异常，对话未完成，请稍后重试。', ready: false, questions: [] }
  }
}
export async function generatePlanFromChat(runner: RunnerProfile | null, chatHistory: ChatMessage[], lastWeekSessions?: SessionForReview[], lastReview?: string | null, recentLogs: RecentTrainingLog[] = []): Promise<PlanResult> {
  const conversationSummary = chatHistory.map((m) => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n')
  const runnerInfo = runner ? `跑者档案：${JSON.stringify(runner, null, 2)}` : '无跑者档案'
  const lastWeekInfo = lastWeekSessions && lastWeekSessions.length > 0 ? `上周训练完成情况：${JSON.stringify(lastWeekSessions, null, 2)}` : '无上周训练数据（这是初始课表）'
  const recentLogsInfo = recentLogs.length > 0 ? `近期实际训练记录（补录/历史实跑，含日期）：${JSON.stringify(recentLogs, null, 2)}` : '无近期实际训练记录'
  const reviewInfo = lastReview ? `上周 AI 点评：${lastReview}` : '无上周点评'
  const userPrompt = `${runnerInfo}\n\n== 对话记录（含跑者提供的实际情况：身体状态、伤病、目标、周跑量、每周可训练天数、训练偏好、特殊环境等）==\n${conversationSummary}\n\n== 上周训练数据 ==\n${lastWeekInfo}\n${recentLogsInfo}\n${reviewInfo}\n\n请基于以上所有信息（以对话中跑者的实际情况为准）生成下周训练课表，要求：\n1. 一周 7 天全部列出，dayOfWeek: 1=周一 ... 6=周六, 0=周日\n2. 训练天数/频率与跑者可训练天数一致，其余为 rest 或 cross\n3. 周跑量循序渐进：若跑者给出周跑量则以其为基准，未给出则按"当前水平合理估算"，绝不超量\n4. 若有伤病/刚恢复：大幅降低强度与跑量，多安排 recovery，必要时以 cross 代替跑步\n5. 若跑者是新手/目标明确（如 sub4 全马）：课表要匹配其水平和目标，配速合理、可执行\n6. 结合跑者偏好：喜欢的训练类型（间歇/节奏/长距离）可侧重，抵触的减少\n7. 每节课给出明确的训练内容描述（距离/配速/组数/强度）\n8. weekGoal 一句话概括本周重点，体现跑者的特殊情况（如"膝伤恢复期，低强度稳步提升"）\n9. 力量训练：若跑者需要或安排 cross 课时，description 中写明具体力量动作（如深蹲/弓步蹲/硬拉/核心/臀腿等）与组数次数\n10. 结合"近期实际训练记录"评估跑者当前状态与疲劳：近期跑量偏高或体感差则降低强度，训练不足则从合理强度起步\n\n请严格按以下 JSON 格式返回（不要输出 JSON 之外的内容）：\n{"weekGoal": "...", "phase": "base|build|peak|taper|recovery", "summary": "...", "sessions": [{"dayOfWeek": 0-7, "type": "easy|tempo|interval|long|recovery|rest|cross", "plannedDistance": 数字或null, "plannedDuration": 数字或null, "plannedPace": "5:30/km" 或 null, "intensity": "Z1-Z5|rest", "description": "..."}]}`
  try { return parsePlanResult(await callDeepseekApi(userPrompt)) }
  catch { return buildPlan(runner || { name: '跑者' }, runner?.weeklyMileage ?? 40, 'base', 1) }
}

export async function generateMicroAdjust(runner: RunnerProfile, remainingSessions: SessionForReview[], completedSessions: SessionForReview[], userNote: string): Promise<string> {
  const userPrompt = `跑者档案：\n${JSON.stringify(runner, null, 2)}\n\n本周已完成训练：\n${JSON.stringify(completedSessions, null, 2)}\n\n本周剩余计划训练：\n${JSON.stringify(remainingSessions, null, 2)}\n\n跑者备注：${userNote || '无'}\n\n请分析：\n1. 已完成训练的强度与疲劳累积情况\n2. 剩余训练是否需要调整（距离/配速/类型）\n3. 给出逐天微调建议（markdown）\n\n直接返回 markdown 内容，不要包裹代码块。`
  try { return await callDeepseekApi(userPrompt) } catch { return '根据已完成训练情况，建议保持原计划执行。如有疲劳感可适当降低配速。' }
}

export async function analyzeSingleSession(runner: RunnerProfile, planned: Record<string, unknown>, actual: Record<string, unknown>): Promise<string> {
  const userPrompt = `请为以下单次训练做深度分析。\n\n== 跑者档案 ==\n${JSON.stringify(runner, null, 2)}\n\n== 计划训练 ==\n${JSON.stringify(planned, null, 2)}\n\n== 实际完成数据 ==\n${JSON.stringify(actual, null, 2)}\n\n请用 markdown 格式，使用 ## 标题分节：\n## 训练评分（0-100）\n## 配速分析\n## 心率分析\n## 跑姿与效率（若有数据）\n## 主观体感\n## 训练建议\n\n直接返回 markdown 内容，不要包裹代码块。`
  try { return await callDeepseekApi(userPrompt) } catch { return '暂无分析结果。' }
}