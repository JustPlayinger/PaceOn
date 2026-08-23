import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 独立历史训练记录（补录，不绑定课表，只带日期）
// GET /api/log?from=&to=        按日期区间查询
// GET /api/log?recent=14       最近 N 天（默认 14）
// POST /api/log                新建补录 { date, distance, duration, avgPace, ... }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const recent = searchParams.get('recent')

    let where: Record<string, unknown> = {}
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.gte = new Date(from)
      if (to) range.lte = new Date(to)
      where.date = range
    } else if (recent) {
      const days = Math.max(1, parseInt(recent) || 14)
      const start = new Date(Date.now() - (days - 1) * 86400000)
      start.setHours(0, 0, 0, 0)
      where.date = { gte: start }
    }

    const logs = await db.trainingLog.findMany({
      where,
      orderBy: { date: 'asc' },
    })
    return NextResponse.json({ logs })
  } catch (e) {
    console.error('GET /api/log error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const b = (body || {}) as Record<string, unknown>
    if (!b.date) return NextResponse.json({ error: '缺少日期 date' }, { status: 400 })

    const log = await db.trainingLog.create({
      data: {
        date: new Date(String(b.date)),
        distance: typeof b.distance === 'number' ? b.distance : null,
        duration: typeof b.duration === 'number' ? b.duration : null,
        avgPace: typeof b.avgPace === 'string' ? b.avgPace : null,
        avgPaceSec: typeof b.avgPaceSec === 'number' ? b.avgPaceSec : null,
        avgHr: typeof b.avgHr === 'number' ? b.avgHr : null,
        maxHr: typeof b.maxHr === 'number' ? b.maxHr : null,
        elevation: typeof b.elevation === 'number' ? b.elevation : null,
        cadence: typeof b.cadence === 'number' ? b.cadence : null,
        calories: typeof b.calories === 'number' ? b.calories : null,
        weather: typeof b.weather === 'string' ? b.weather : null,
        temperature: typeof b.temperature === 'number' ? b.temperature : null,
        rpe: typeof b.rpe === 'number' ? b.rpe : null,
        feeling: typeof b.feeling === 'number' ? b.feeling : null,
        feelingNote: typeof b.feelingNote === 'string' ? b.feelingNote : null,
        imageDataUrl: typeof b.imageDataUrl === 'string' ? b.imageDataUrl : null,
        rawExtract: typeof b.rawExtract === 'string' ? b.rawExtract : null,
        notes: typeof b.notes === 'string' ? b.notes : null,
        shoeId: typeof b.shoeId === 'string' ? b.shoeId : null,
        source: typeof b.source === 'string' ? b.source : 'manual',
      },
    })
    return NextResponse.json({ log })
  } catch (e) {
    console.error('POST /api/log error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
