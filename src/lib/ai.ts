const USE_MOCK_DATA = false

import { extractFromOcrImage } from './ocr'

export interface ExtractedTrainingData {
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
  hrZones: { zone: string; percent: number }[] | null
  curveAnalysis: string | null
  rawText: string
  notes: string | null
  appSource: string | null
}

const mockExtractedData: ExtractedTrainingData = {
  distance: 8.0,
  duration: 3200,
  avgPace: '6:40/km',
  avgPaceSec: 400,
  avgHr: 150,
  maxHr: 168,
  elevation: 80,
  descent: 75,
  cadence: 175,
  strideLength: 95,
  steps: null,
  calories: 530,
  avgSpeed: 8.5,
  vo2max: null,
  hrRecovery: null,
  groundContactTime: null,
  verticalOscillation: null,
  leftRightBalance: null,
  weather: null,
  temperature: null,
  paceCurve: [400, 395, 410, 405, 398],
  hrCurve: [140, 145, 150, 148, 147],
  elevationCurve: [0, 8, 22, 35, 80],
  cadenceCurve: null,
  splitPaces: [395, 400, 405, 410, 398],
  hrZones: null,
  curveAnalysis: '配速波动小，心率控制稳定，爬升在后半段略有上升。',
  rawText: '',
  notes: null,
  appSource: null,
}

const EXTRACT_PROMPT = `你是一个专业的跑步训练数据分析助手。请仔细分析这张来自跑步 App（如 Keep、悦跑圈、Garmin、Strava、华为运动健康、Apple 健康等）的训练记录长图。

这类长图通常包含：基础统计数据（距离/时长/配速/心率/步频/爬升/卡路里）+ 多条折线图（心率曲线/配速曲线/步频曲线/海拔曲线，X 轴通常为时间或距离）+ 跑姿数据（触地时间/垂直振幅/左右平衡）+ 分段配速 + 心率区间分布等。

请尽可能准确地识别以下数据，并严格按 JSON 格式返回（只返回 JSON，不要任何额外文字）：

{
  "distance": 距离(km, 数字, 无则null),
  "duration": 时长(秒, 数字, 如 32分15秒=1935, 无则null),
  "avgPace": 平均配速(字符串如 "5:30/km", 无则null),
  "avgPaceSec": 平均配速(秒/km, 数字如 330表示5:30, 无则null),
  "avgHr": 平均心率(数字, 无则null),
  "maxHr": 最大心率(数字, 无则null),
  "elevation": 累计爬升(米, 数字, 无则null),
  "descent": 累计下降(米, 数字, 无则null),
  "cadence": 平均步频(数字, 无则null),
  "strideLength": 步幅(厘米cm, 数字, 无则null),
  "steps": 总步数(数字, 无则null),
  "calories": 消耗卡路里(数字, 无则null),
  "avgSpeed": 平均速度(km/h, 数字, 无则null),
  "vo2max": 最大摄氧量(数字, 无则null),
  "hrRecovery": 心率恢复值(bpm, 数字, 运动停止后心率下降值, 无则null),
  "groundContactTime": 触地时间(毫秒ms, 数字, 无则null),
  "verticalOscillation": 垂直振幅(厘米cm, 数字, 无则null),
  "leftRightBalance": 左右平衡(左脚百分比数字如49.9表示49.9%, 无则null),
  "weather": 天气描述(字符串如 "晴" "阴" "雨", 无则null),
  "temperature": 温度(摄氏度数字, 无则null),
  "paceCurve": 配速曲线数组(秒/km数字数组, 从配速折线图采样15-25个点, 按时间顺序, 无则null),
  "hrCurve": 心率曲线数组(bpm数字数组, 从心率折线图采样15-25个点, 按时间顺序, 无则null),
  "elevationCurve": 海拔曲线数组(米数字数组, 从海拔折线图采样15-25个点, 按时间顺序, 无则null),
  "cadenceCurve": 步频曲线数组(spm数字数组, 从步频折线图采样15-25个点, 按时间顺序, 无则null),
  "splitPaces": 分段配速数组(每公里配速秒数, 如[330,325,340...]表示每公里配速, 无则null),
  "hrZones": 心率区间分布数组(如[{"zone":"Z1","percent":10},{"zone":"Z2","percent":60}], 无则null),
  "curveAnalysis": 折线图趋势分析(字符串, 详细描述心率/配速/步频/海拔曲线的变化趋势),
  "rawText": 图中所有可见文字的汇总(字符串),
  "notes": 其他值得注意的信息(字符串),
  "appSource": 来源App名称(字符串, 如能识别则填"华为运动健康"/"Garmin"/"Strava"/"Keep"等, 无则null)
}

注意：
1. 配速格式 "M:SS/km" 转秒时 = M*60+SS
2. 折线图请尽量采样 15-25 个点，按时间顺序均匀采样
3. curveAnalysis 字段非常重要，请详细描述各折线图的变化趋势
4. 如果某项数据图中没有，必须返回 null，不要猜测
5. distance/duration 等数字字段必须是数字类型而非字符串
6. 心率区间分布若图中有饼图或柱状图，请读取各区间百分比`

/** 内置 OCR 兜底时交给 DeepSeek 的文本解析 prompt（输入是 OCR 识别文字而非图片） */
const OCR_PARSE_PROMPT = `你是一个专业的跑步训练数据分析助手。以下是跑步 App（如 Keep、悦跑圈、Garmin、Strava、华为运动健康等）训练记录截图的 OCR 识别文字，可能包含噪音、错字或多余字符。

请尽可能准确地从文字中提取以下数据，并严格按 JSON 格式返回（只返回 JSON，不要任何额外文字）：

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

注意：
1. 配速格式 "M:SS/km" 转秒时 = M*60+SS
2. 只依据文字内容提取，不得编造数据；无法确定的一律返回 null
3. 数字字段必须是数字类型而非字符串`

async function callDeepseekApi(prompt: string, useVision = false, imageBase64?: string, mimeType?: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  // 文本请求 → DeepSeek 官方 API；视觉/识图请求 → 本地 DsBridge 多模态网关（DS 无多模态，由网关转 OCR/视觉模型）
  const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions'
  const visionApiUrl = process.env.DEEPSEEK_VISION_API_URL || 'http://127.0.0.1:8901/v1/chat/completions'
  const url = useVision ? visionApiUrl : apiUrl
  const timeoutMs = useVision ? 120_000 : 90_000

  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY is not set')
    throw new Error('API key not configured')
  }

  try {
    const messages: any[] = [
      {
        role: 'system',
        content: '你是一位专业的跑步教练AI助手，擅长分析训练数据并提供专业建议。请用中文回答。'
      },
      {
        role: 'user',
        content: useVision && imageBase64
          ? [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
            ]
          : prompt
      }
    ]

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Deepseek API error: ${response.status} - ${errorText}`)
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Error calling Deepseek API:', error)
    throw error
  }
}

export async function extractTrainingDataFromImage(
  imageBase64: string,
  mimeType: string = 'image/jpeg'
): Promise<ExtractedTrainingData> {
  if (USE_MOCK_DATA) {
    return mockExtractedData
  }

  try {
    // 路径①：优先尝试 DsBridge 本地多模态网关（图片→OCR/视觉模型→文本→DeepSeek）
    // DeepSeek 官方 API 无多模态能力，故视觉请求转发到网关（地址由 DEEPSEEK_VISION_API_URL 配置）
    const response = await callDeepseekApi(EXTRACT_PROMPT, true, imageBase64, mimeType)
    const parsed = parseExtractedData(response)
    if (parsed.distance != null || parsed.duration != null || parsed.avgPace != null || parsed.rawText) {
      return {
        ...parsed,
        notes: parsed.notes || '识别方式：DsBridge 多模态网关（OCR/视觉模型 → DeepSeek）',
      }
    }
    console.warn('[Extract] DsBridge 返回空数据，尝试内置 OCR 兜底')
  } catch (e) {
    console.warn('[Extract] DsBridge 网关不可用，降级到内置 OCR:', (e as Error).message)
  }

  // 路径②：内置 OCR 兜底（tesseract.js + 模板解析 + DeepSeek 文本解析，离线可用）
  try {
    return await extractWithOcr(imageBase64, mimeType)
  } catch (e) {
    console.error('[Extract] OCR 兜底失败:', (e as Error).message)
    return {
      ...emptyExtractedData(),
      notes: '识别失败，请手动填写训练数据',
      rawText: '',
    }
  }
}

/** 空数据结构 */
function emptyExtractedData(): ExtractedTrainingData {
  return {
    distance: null, duration: null, avgPace: null, avgPaceSec: null,
    avgHr: null, maxHr: null, elevation: null, descent: null, cadence: null,
    strideLength: null, steps: null, calories: null, avgSpeed: null, vo2max: null,
    hrRecovery: null, groundContactTime: null, verticalOscillation: null,
    leftRightBalance: null, weather: null, temperature: null,
    paceCurve: null, hrCurve: null, elevationCurve: null, cadenceCurve: null,
    splitPaces: null, hrZones: null, curveAnalysis: null,
    rawText: '', notes: null, appSource: null,
  }
}

/** 内置 OCR 兜底：tesseract.js 识别 → 模板/正则解析 → DeepSeek 文本解析补全 */
async function extractWithOcr(imageBase64: string, mimeType: string): Promise<ExtractedTrainingData> {
  const buffer = Buffer.from(imageBase64, 'base64')
  const { fields, rawText, appSource } = await extractFromOcrImage(buffer)

  const hasCore = fields.distance != null || fields.duration != null || fields.avgPace != null

  const base: ExtractedTrainingData = {
    ...emptyExtractedData(),
    ...fields as Partial<ExtractedTrainingData>,
    rawText,
    appSource: appSource || null,
    curveAnalysis: hasCore
      ? '本次训练数据由内置 OCR（tesseract.js）识别。因 DeepSeek 无多模态能力，折线图/曲线数据无法从静态截图自动提取，建议手动补充或使用 DsBridge 视觉模型方案。'
      : null,
    notes: '识别方式：内置 OCR（tesseract.js）+ 模板解析',
  }

  // 正则未命中核心字段时，交给 DeepSeek 从 OCR 文本解析兜底
  if (!hasCore && rawText.trim()) {
    try {
      const llmResponse = await callDeepseekApi(
        `${OCR_PARSE_PROMPT}\n\n== OCR 识别文字 ==\n${rawText.slice(0, 8000)}`
      )
      const llmParsed = parseExtractedData(llmResponse)
      return {
        ...base,
        avgPace: base.avgPace ?? llmParsed.avgPace,
        avgPaceSec: base.avgPaceSec ?? llmParsed.avgPaceSec,
        distance: base.distance ?? llmParsed.distance,
        duration: base.duration ?? llmParsed.duration,
        avgHr: base.avgHr ?? llmParsed.avgHr,
        maxHr: base.maxHr ?? llmParsed.maxHr,
        elevation: base.elevation ?? llmParsed.elevation,
        cadence: base.cadence ?? llmParsed.cadence,
        calories: base.calories ?? llmParsed.calories,
        avgSpeed: base.avgSpeed ?? llmParsed.avgSpeed,
        steps: base.steps ?? llmParsed.steps,
        temperature: base.temperature ?? llmParsed.temperature,
        weather: base.weather ?? llmParsed.weather,
        appSource: base.appSource ?? llmParsed.appSource,
        notes: '识别方式：内置 OCR（tesseract.js）+ DeepSeek 文本解析',
      }
    } catch (e) {
      console.warn('[Extract] DeepSeek 文本解析失败，仅使用 OCR 结果:', (e as Error).message)
    }
  }

  return base
}

function parseExtractedData(content: string): ExtractedTrainingData {
  let jsonStr = content.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start !== -1 && end !== -1) {
    jsonStr = jsonStr.slice(start, end + 1)
  }

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    parsed = extractFieldsByRegex(jsonStr)
  }

  if (!parsed) {
    return {
      distance: null, duration: null, avgPace: null, avgPaceSec: null,
      avgHr: null, maxHr: null, elevation: null, descent: null, cadence: null,
      strideLength: null, steps: null, calories: null, avgSpeed: null, vo2max: null,
      hrRecovery: null, groundContactTime: null, verticalOscillation: null,
      leftRightBalance: null, weather: null, temperature: null,
      paceCurve: null, hrCurve: null, elevationCurve: null, cadenceCurve: null,
      splitPaces: null, hrZones: null, curveAnalysis: null,
      rawText: content, notes: null, appSource: null,
    }
  }

  // 归一化配速为 "M:SS/km"（DsBridge/DeepSeek 可能返回 "5'40\"/km" 等变体）
  let avgPace: string | null = typeof parsed.avgPace === 'string' ? parsed.avgPace : null
  let avgPaceSec: number | null = typeof parsed.avgPaceSec === 'number' ? parsed.avgPaceSec : null
  if (typeof avgPace === 'string') {
    const pm = avgPace.match(/(\d{1,2})\s*[:'’′]\s*(\d{2})/)
    if (pm) {
      const m = parseInt(pm[1], 10)
      const s = parseInt(pm[2], 10)
      avgPace = `${m}:${pm[2]}/km`
      if (avgPaceSec == null && !Number.isNaN(m) && !Number.isNaN(s)) avgPaceSec = m * 60 + s
    }
  }

  return {
    distance: typeof parsed.distance === 'number' ? parsed.distance : null,
    duration: typeof parsed.duration === 'number' ? parsed.duration : null,
    avgPace,
    avgPaceSec,
    avgHr: typeof parsed.avgHr === 'number' ? parsed.avgHr : null,
    maxHr: typeof parsed.maxHr === 'number' ? parsed.maxHr : null,
    elevation: typeof parsed.elevation === 'number' ? parsed.elevation : null,
    descent: typeof parsed.descent === 'number' ? parsed.descent : null,
    cadence: typeof parsed.cadence === 'number' ? parsed.cadence : null,
    strideLength: typeof parsed.strideLength === 'number' ? parsed.strideLength : null,
    steps: typeof parsed.steps === 'number' ? parsed.steps : null,
    calories: typeof parsed.calories === 'number' ? parsed.calories : null,
    avgSpeed: typeof parsed.avgSpeed === 'number' ? parsed.avgSpeed : null,
    vo2max: typeof parsed.vo2max === 'number' ? parsed.vo2max : null,
    hrRecovery: typeof parsed.hrRecovery === 'number' ? parsed.hrRecovery : null,
    groundContactTime: typeof parsed.groundContactTime === 'number' ? parsed.groundContactTime : null,
    verticalOscillation: typeof parsed.verticalOscillation === 'number' ? parsed.verticalOscillation : null,
    leftRightBalance: typeof parsed.leftRightBalance === 'number' ? parsed.leftRightBalance : null,
    weather: parsed.weather ?? null,
    temperature: typeof parsed.temperature === 'number' ? parsed.temperature : null,
    paceCurve: Array.isArray(parsed.paceCurve) ? parsed.paceCurve.filter((x: unknown) => typeof x === 'number') : null,
    hrCurve: Array.isArray(parsed.hrCurve) ? parsed.hrCurve.filter((x: unknown) => typeof x === 'number') : null,
    elevationCurve: Array.isArray(parsed.elevationCurve) ? parsed.elevationCurve.filter((x: unknown) => typeof x === 'number') : null,
    cadenceCurve: Array.isArray(parsed.cadenceCurve) ? parsed.cadenceCurve.filter((x: unknown) => typeof x === 'number') : null,
    splitPaces: Array.isArray(parsed.splitPaces) ? parsed.splitPaces.filter((x: unknown) => typeof x === 'number') : null,
    hrZones: Array.isArray(parsed.hrZones) ? parsed.hrZones.filter((x: unknown) => x && typeof x === 'object' && 'zone' in x && 'percent' in x) : null,
    curveAnalysis: typeof parsed.curveAnalysis === 'string' ? parsed.curveAnalysis : null,
    rawText: typeof parsed.rawText === 'string' ? parsed.rawText : '',
    notes: parsed.notes ?? null,
    appSource: typeof parsed.appSource === 'string' ? parsed.appSource : null,
  }
}

function extractFieldsByRegex(jsonStr: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {}
  const numFields = ['distance','duration','avgPaceSec','avgHr','maxHr','elevation','descent','cadence','strideLength','steps','calories','avgSpeed','vo2max','hrRecovery','groundContactTime','verticalOscillation','leftRightBalance','temperature']
  for (const f of numFields) {
    const m = jsonStr.match(new RegExp(`"${f}"\\s*:\\s*([\\d.]+)`))
    if (m) result[f] = parseFloat(m[1])
  }
  const strFields = ['avgPace','weather','curveAnalysis','appSource','notes']
  for (const f of strFields) {
    const m = jsonStr.match(new RegExp(`"${f}"\\s*:\\s*"([^"]*)"`))
    if (m) result[f] = m[1]
  }
  const arrFields = ['paceCurve','hrCurve','elevationCurve','cadenceCurve','splitPaces']
  for (const f of arrFields) {
    const m = jsonStr.match(new RegExp(`"${f}"\\s*:\\s*\\[([\\s\\S]*?)\\]`))
    if (m) {
      const nums = m[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
      if (nums.length > 0) result[f] = nums
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

export interface RunnerProfile {
  name: string
  age?: number | null
  gender?: string | null
  weight?: number | null
  restingHr?: number | null
  maxHr?: number | null
  vo2max?: number | null
  experience?: string | null
  targetRace?: string | null
  targetDate?: string | null
  targetTime?: string | null
  weeklyMileage?: number | null
  notes?: string | null
}

export interface SessionForReview {
  date: string
  dayOfWeek: number
  type: string
  plannedDistance?: number | null
  plannedDuration?: number | null
  plannedPace?: string | null
  intensity?: string | null
  description?: string | null
  status: string
  completion?: {
    distance?: number | null
    duration?: number | null
    avgPace?: string | null
    avgPaceSec?: number | null
    avgHr?: number | null
    maxHr?: number | null
    elevation?: number | null
    cadence?: number | null
    rpe?: number | null
    feeling?: number | null
    feelingNote?: string | null
    weather?: string | null
    temperature?: number | null
    paceCurve?: number[] | null
    hrCurve?: number[] | null
    elevationCurve?: number[] | null
    cadenceCurve?: number[] | null
    splitPaces?: number[] | null
    curveAnalysis?: string | null
    vo2max?: number | null
    hrRecovery?: number | null
    groundContactTime?: number | null
    verticalOscillation?: number | null
    leftRightBalance?: number | null
    strideLength?: number | null
  } | null
}

export interface ReviewResult {
  rating: number
  content: string
  suggestions: { type: string; text: string }[]
}

const mockReview: ReviewResult = {
  rating: 82,
  content: '本周训练完成良好，整体强度适中。建议继续保持节奏跑与长距离跑的搭配，同时增加一次恢复跑以帮助身体恢复。',
  suggestions: [
    { type: '训练量', text: '保持每周一次长跑以提升耐力' },
    { type: '恢复', text: '增加一次轻松恢复跑，降低疲劳积累' },
    { type: '营养', text: '训练后补充充足蛋白和碳水化合物' },
  ]
}

export async function generateWeeklyReview(
  runner: RunnerProfile,
  weekGoal: string | null,
  phase: string | null,
  sessions: SessionForReview[]
): Promise<ReviewResult> {
  if (USE_MOCK_DATA) {
    const completedCount = sessions.filter((s) => s.completion).length
    const totalDistance = sessions.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)
    const rating = Math.min(100, 70 + completedCount * 4 + Math.round(totalDistance / 10))
    return {
      ...mockReview,
      rating,
      content: `本周训练已完成 ${completedCount} 次，有效跑量约 ${totalDistance.toFixed(1)}km。${weekGoal || ''}`,
    }
  }

  const completedSessions = sessions.filter((s) => s.completion)
  const totalDistance = sessions.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)

  const userPrompt = `请为以下跑者本周的训练完成情况做点评。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

== 本周训练目标 ==
${weekGoal || '未设定'}
训练阶段：${phase || '未设定'}

== 本周课表与完成情况 ==
${JSON.stringify(sessions, null, 2)}

请从以下角度分析：
1. **完成度**：实际 vs 计划（距离、次数）
2. **强度匹配**：配速/心率是否落在目标区间
3. **折线图趋势分析**（重要！）：若完成记录中包含 paceCurve/hrCurve/elevationCurve/cadenceCurve/splitPaces/curveAnalysis 等折线图数据，必须详细分析
4. **心率分析**：有氧/无氧区间分布、心率漂移
5. **疲劳管理**：RPE 与体感是否合理
6. **进步与不足**：本周亮点与待改进点
7. **下周建议**：针对不足给出 2-4 条可执行建议

请严格按以下 JSON 格式返回（只返回 JSON）：
{
  "rating": 0-100的整数评分,
  "content": "markdown格式的详细点评，使用 ## 标题分节，包含数据引用。若有折线图数据，必须有专门的'## 折线图趋势分析'章节",
  "suggestions": [{"type": "category", "text": "具体建议"}, ...]
}`

  try {
    const response = await callDeepseekApi(userPrompt)
    return parseReviewResult(response)
  } catch {
    return mockReview
  }
}

function parseReviewResult(content: string): ReviewResult {
  let jsonStr = content.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1)

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      rating: typeof parsed.rating === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.rating))) : 75,
      content: parsed.content || content,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    }
  } catch {
    return { rating: 75, content, suggestions: [] }
  }
}

export interface PlannedSession {
  dayOfWeek: number
  type: string
  plannedDistance: number | null
  plannedDuration: number | null
  plannedPace: string | null
  intensity: string | null
  description: string
}

export interface PlanResult {
  weekGoal: string
  phase: string
  sessions: PlannedSession[]
  summary: string
}

/** 独立历史训练记录（补录）的 AI 输入结构 */
export interface RecentTrainingLog {
  date: string
  distance: number | null
  duration: number | null
  avgPace: string | null
  avgHr: number | null
  elevation: number | null
  rpe: number | null
  feeling: number | null
  notes: string | null
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
  const summary = reviewText
    ? `基于上周数据与训练反馈生成，保持节奏与恢复平衡。`
    : '本期训练以稳定耐力为核心，兼顾节奏与恢复。'

  return {
    weekGoal: goal,
    phase,
    summary,
    sessions: sessionTemplates.map((session) => ({
      ...session,
      plannedDistance: session.plannedDistance === null ? null : Math.max(0, Math.round((session.plannedDistance / 16) * totalMileage * 10) / 10),
      plannedDuration: session.plannedDuration,
      plannedPace: session.plannedPace,
      intensity: session.intensity,
      description: session.description,
    })),
  }
}

export async function generateNextWeekPlan(
  runner: RunnerProfile,
  lastWeekSessions: SessionForReview[],
  lastReview: string | null,
  weekNumber: number,
  recentLogs: RecentTrainingLog[] = []
): Promise<PlanResult> {
  if (USE_MOCK_DATA) {
    const lastDistance = lastWeekSessions.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)
    const logDistance = recentLogs.reduce((sum, l) => sum + (l.distance || 0), 0)
    const baseMileage = runner.weeklyMileage ?? 40
    const totalMileage = Math.max(30, Math.round(((lastDistance || logDistance) || baseMileage) * 1.05))
    const phase = weekNumber >= 4 ? 'build' : weekNumber >= 8 ? 'peak' : weekNumber >= 10 ? 'taper' : 'base'
    return buildPlan(runner, totalMileage, phase, weekNumber, lastReview ?? undefined)
  }

  const userPrompt = `请为以下跑者生成第 ${weekNumber} 周的训练课表。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

== 上周训练完成情况 ==
${JSON.stringify(lastWeekSessions, null, 2)}

== 近期实际训练记录（补录/历史实跑，含日期） ==
${recentLogs.length > 0 ? JSON.stringify(recentLogs, null, 2) : '无'}

== 上周 AI 点评 ==
${lastReview || '无'}

要求：
1. 一周 7 天，从周一到周日（dayOfWeek: 1=周一 ... 7=周日，注意 0 也代表周日）
2. 合理安排休息日（通常 1-2 天）
3. 包含 1 次长跑（long）、1-2 次质量课（interval 或 tempo）、其余为轻松跑（easy）或恢复跑（recovery）
4. 配速基于跑者目标成绩与当前水平
5. 周跑量参考跑者档案 weeklyMileage，渐进增加
6. 每节课给出明确的训练内容描述（如热身、主课组数与配速、冷身）
7. 结合"近期实际训练记录"评估跑者当前状态与疲劳：若近期跑量偏高或体感差，适当降低下周强度与跑量；若近期训练不足，从合理强度起步

请严格按以下 JSON 格式返回（只返回 JSON）：
{
  "weekGoal": "本周训练目标，1-2句话",
  "phase": "base|build|peak|taper|recovery",
  "summary": "本周课表整体说明，markdown格式",
  "sessions": [
    {
      "dayOfWeek": 1-7 或 0(周日),
      "type": "easy|tempo|interval|long|recovery|rest|cross",
      "plannedDistance": 数字km或null(休息日),
      "plannedDuration": 数字分钟或null,
      "plannedPace": "5:30/km" 或 null,
      "intensity": "Z1|Z2|Z3|Z4|Z5|rest",
      "description": "详细训练内容说明"
    }
  ]
}`

  try {
    const response = await callDeepseekApi(userPrompt)
    return parsePlanResult(response)
  } catch {
    const lastDistance = lastWeekSessions.reduce((sum, s) => sum + (s.completion?.distance || 0), 0)
    const logDistance = recentLogs.reduce((sum, l) => sum + (l.distance || 0), 0)
    const baseMileage = runner.weeklyMileage ?? 40
    const totalMileage = Math.max(30, Math.round(((lastDistance || logDistance) || baseMileage) * 1.05))
    const phase = weekNumber >= 4 ? 'build' : weekNumber >= 8 ? 'peak' : weekNumber >= 10 ? 'taper' : 'base'
    return buildPlan(runner, totalMileage, phase, weekNumber, lastReview ?? undefined)
  }
}

function parsePlanResult(content: string): PlanResult {
  let jsonStr = content.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1)

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      weekGoal: parsed.weekGoal || '本周训练课表',
      phase: parsed.phase || 'build',
      summary: parsed.summary || '',
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.map((s: PlannedSession) => ({
            dayOfWeek: typeof s.dayOfWeek === 'number' ? s.dayOfWeek : 1,
            type: s.type || 'easy',
            plannedDistance: typeof s.plannedDistance === 'number' ? s.plannedDistance : null,
            plannedDuration: typeof s.plannedDuration === 'number' ? s.plannedDuration : null,
            plannedPace: s.plannedPace ?? null,
            intensity: s.intensity ?? null,
            description: s.description || '',
          }))
        : [],
    }
  } catch {
    return {
      weekGoal: '本周训练课表',
      phase: 'build',
      summary: content,
      sessions: [],
    }
  }
}

export async function generateMicroAdjust(
  runner: RunnerProfile,
  remainingSessions: SessionForReview[],
  completedSessions: SessionForReview[],
  userNote: string
): Promise<string> {
  if (USE_MOCK_DATA) {
    return '根据已完成训练情况，建议保持原计划执行。如有疲劳感可适当降低配速。'
  }

  const userPrompt = `跑者档案：
${JSON.stringify(runner, null, 2)}

本周已完成训练：
${JSON.stringify(completedSessions, null, 2)}

本周剩余计划训练：
${JSON.stringify(remainingSessions, null, 2)}

跑者备注：${userNote || '无'}

请分析：
1. 已完成训练的强度与疲劳累积情况
2. 剩余训练是否需要调整（距离/配速/类型）
3. 给出逐天的微调建议（用 markdown 表格或列表）

直接返回 markdown 内容，不要包裹代码块。`

  try {
    return await callDeepseekApi(userPrompt)
  } catch {
    return '根据已完成训练情况，建议保持原计划执行。如有疲劳感可适当降低配速。'
  }
}

export async function generateInitialPlan(runner: RunnerProfile): Promise<PlanResult> {
  if (USE_MOCK_DATA) {
    const totalMileage = runner.weeklyMileage ?? 40
    return buildPlan(runner, totalMileage, 'base', 1)
  }

  const userPrompt = `请为以下跑者生成第 1 周的训练课表（基础期 base）。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

要求：
1. 一周 7 天，dayOfWeek: 1=周一 ... 6=周六, 0=周日
2. 合理安排休息日
3. 包含 1 次长跑（long）、1 次质量课（interval 或 tempo）、其余为轻松跑（easy）或恢复跑（recovery）
4. 配速基于跑者目标成绩与当前水平
5. 周跑量参考跑者档案 weeklyMileage
6. 每节课给出明确的训练内容描述

请严格按以下 JSON 格式返回（只返回 JSON）：
{
  "weekGoal": "本周训练目标",
  "phase": "base",
  "summary": "本周课表说明",
  "sessions": [
    {
      "dayOfWeek": 数字,
      "type": "easy|tempo|interval|long|recovery|rest|cross",
      "plannedDistance": 数字或null,
      "plannedDuration": 数字或null,
      "plannedPace": "5:30/km" 或 null,
      "intensity": "Z1|Z2|Z3|Z4|Z5|rest",
      "description": "训练内容说明"
    }
  ]
}`

  try {
    const response = await callDeepseekApi(userPrompt)
    return parsePlanResult(response)
  } catch {
    const totalMileage = runner.weeklyMileage ?? 40
    return buildPlan(runner, totalMileage, 'base', 1)
  }
}

export async function analyzeSingleSession(
  runner: RunnerProfile,
  planned: {
    type: string
    plannedDistance?: number | null
    plannedDuration?: number | null
    plannedPace?: string | null
    intensity?: string | null
    description?: string | null
  },
  actual: {
    distance?: number | null
    duration?: number | null
    avgPace?: string | null
    avgPaceSec?: number | null
    avgHr?: number | null
    maxHr?: number | null
    elevation?: number | null
    cadence?: number | null
    rpe?: number | null
    feeling?: number | null
    feelingNote?: string | null
    weather?: string | null
    temperature?: number | null
    paceCurve?: number[] | null
    hrCurve?: number[] | null
    elevationCurve?: number[] | null
    cadenceCurve?: number[] | null
    splitPaces?: number[] | null
    curveAnalysis?: string | null
    vo2max?: number | null
    hrRecovery?: number | null
    groundContactTime?: number | null
    verticalOscillation?: number | null
    leftRightBalance?: number | null
    strideLength?: number | null
  }
): Promise<string> {
  if (USE_MOCK_DATA) {
    return `## 训练评分\n75/100\n\n## 配速分析\n完成度良好，配速基本稳定。\n\n## 心率分析\n心率控制在目标区间内。\n\n## 训练建议\n继续保持当前训练节奏。`
  }

  const userPrompt = `请为以下单次训练做深度分析。

== 跑者档案 ==
${JSON.stringify(runner, null, 2)}

== 计划训练 ==
${JSON.stringify(planned, null, 2)}

== 实际完成数据（含折线图趋势）==
${JSON.stringify(actual, null, 2)}

请从以下角度分析（用 markdown 格式，使用 ## 标题分节）：

## 训练评分
给出 0-100 的整体评分并简述理由。

## 折线图趋势分析（核心！）
若 actual 中包含 paceCurve/hrCurve/elevationCurve/cadenceCurve/splitPaces/curveAnalysis 等折线图数据，必须详细分析。若无折线图数据则说明"本次训练无折线图数据"。

## 配速分析
实际配速与计划配速对比，配速合理性与稳定性。

## 心率分析
平均心率与最大心率，心率区间归属，强度是否匹配训练目的。

## 跑姿与效率（若有数据）
若包含 groundContactTime/verticalOscillation/leftRightBalance/strideLength/vo2max/hrRecovery，分析这些指标。

## 主观体感
RPE 与实际强度是否匹配，体感评分解读。

## 训练建议
本次训练的亮点、待改进点、对后续训练的启示。

直接返回 markdown 内容，不要包裹代码块。`

  try {
    return await callDeepseekApi(userPrompt)
  } catch {
    return '暂无分析结果。'
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function chatWithCoach(
  runner: RunnerProfile | null,
  history: ChatMessage[],
  currentMessage: string,
): Promise<{ reply: string; ready: boolean; questions: string[] }> {
  if (USE_MOCK_DATA) {
    return {
      reply: '感谢你的信息！我已经了解了你的情况。现在我可以为你生成个性化训练课表了。',
      ready: true,
      questions: [],
    }
  }

  const systemPrompt = `你是一位资深的长跑教练，正在通过对话了解跑者的具体情况，以便为其制定个性化训练课表。你要像真人教练一样，尽可能全面地收集信息、持续追问，直到掌握足够细节。

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

  const conversationContext = history.map(m => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n')
  const runnerInfo = runner ? `跑者档案：${JSON.stringify(runner, null, 2)}` : '暂无跑者档案'

  const userPrompt = `${runnerInfo}

== 对话历史 ==
${conversationContext || '（刚开始对话）'}

== 跑者最新消息 ==
${currentMessage}

请根据以上信息回复。`

  try {
    const response = await callDeepseekApi(userPrompt)
    return parseChatResult(response)
  } catch (e) {
    return {
      reply: `⚠️ AI 教练暂时无法回复：${(e as Error).message}。请检查服务端 DEEPSEEK_API_KEY 是否配置、账户是否有余额、网络是否可用。`,
      ready: false,
      questions: [],
    }
  }
}

function parseChatResult(content: string): { reply: string; ready: boolean; questions: string[] } {
  let jsonStr = content.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1)

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : content,
      ready: Boolean(parsed.ready),
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    }
  } catch {
    const ready = content.includes('[READY]')
    return {
      reply: content.replace('[READY]', '').trim(),
      ready,
      questions: [],
    }
  }
}

export async function generatePlanFromChat(
  runner: RunnerProfile | null,
  chatHistory: ChatMessage[],
  lastWeekSessions?: SessionForReview[],
  lastReview?: string | null,
  recentLogs: RecentTrainingLog[] = [],
): Promise<PlanResult> {
  if (USE_MOCK_DATA) {
    const totalMileage = runner?.weeklyMileage ?? 40
    return buildPlan(runner || { name: '跑者' }, totalMileage, 'base', 1)
  }

  const conversationSummary = chatHistory.map(m => `${m.role === 'user' ? '跑者' : '教练'}：${m.content}`).join('\n')
  const runnerInfo = runner ? `跑者档案：${JSON.stringify(runner, null, 2)}` : '无跑者档案'
  const lastWeekInfo = lastWeekSessions && lastWeekSessions.length > 0
    ? `上周训练完成情况：${JSON.stringify(lastWeekSessions, null, 2)}`
    : '无上周训练数据'
  const recentLogsInfo = recentLogs.length > 0
    ? `近期实际训练记录（补录/历史实跑，含日期）：${JSON.stringify(recentLogs, null, 2)}`
    : '无近期实际训练记录'
  const reviewInfo = lastReview ? `上周 AI 点评：${lastReview}` : '无上周点评'

  const userPrompt = `${runnerInfo}

== 对话记录（含跑者提供的实际情况：身体状态、伤病、目标、周跑量、每周可训练天数、训练偏好、特殊环境等）==
${conversationSummary}

== 上周训练数据 ==
${lastWeekInfo}
${recentLogsInfo}
${reviewInfo}

请基于以上所有信息（以对话中跑者的实际情况为准）生成下周训练课表，要求：
1. 一周 7 天全部列出，dayOfWeek: 1=周一 ... 6=周六, 0=周日
2. 训练天数/频率与跑者可训练天数一致，其余为 rest 或 cross
3. 周跑量循序渐进：若跑者给出周跑量则以其为基准，未给出则按"当前水平合理估算"，绝不超量
4. 若有伤病/刚恢复：大幅降低强度与跑量，多安排 recovery，必要时以 cross 代替跑步
5. 若跑者是新手/目标明确（如 sub4 全马）：课表要匹配其水平和目标，配速合理、可执行
6. 结合跑者偏好：喜欢的训练类型（间歇/节奏/长距离/力量）可侧重，抵触的减少
7. 每节课给出明确的训练内容描述（距离/配速/组数/强度）
8. weekGoal 一句话概括本周重点，体现跑者的特殊情况（如"膝伤恢复期，低强度稳步提升"）
9. 力量训练：若跑者需要或安排 cross 课时，description 中写明具体力量动作（如深蹲/弓步蹲/硬拉/核心/臀腿等）与组数次数
10. 结合"近期实际训练记录"评估跑者当前状态与疲劳：近期跑量偏高或体感差则降低强度，训练不足则从合理强度起步

请严格按以下 JSON 格式返回（不要输出 JSON 之外的内容）：
{
  "weekGoal": "...",
  "phase": "base|build|peak|taper|recovery",
  "summary": "...",
  "sessions": [
    {
      "dayOfWeek": 0-7,
      "type": "easy|tempo|interval|long|recovery|rest|cross",
      "plannedDistance": 数字或null,
      "plannedDuration": 数字或null,
      "plannedPace": "5:30/km" 或 null,
      "intensity": "Z1-Z5|rest",
      "description": "..."
    }
  ]
}`

  try {
    const response = await callDeepseekApi(userPrompt)
    return parsePlanResult(response)
  } catch {
    const totalMileage = runner?.weeklyMileage ?? 40
    return buildPlan(runner || { name: '跑者' }, totalMileage, 'base', 1)
  }
}