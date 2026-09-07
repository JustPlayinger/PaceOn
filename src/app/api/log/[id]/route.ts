import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// 查询一条独立历史训练记录（编辑回填用）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const log = await db.trainingLog.findUnique({ where: { id } })
    if (!log) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
    return NextResponse.json({ log })
  } catch (e) {
    console.error('GET /api/log/[id] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 删除一条独立历史训练记录
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.trainingLog.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/log/[id] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// 更新一条独立历史训练记录（含备注等字段）—— 用于编辑补录记录
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const b = (body || {}) as Record<string, unknown>
    const log = await db.trainingLog.update({
      where: { id },
      data: {
        date: b.date ? new Date(String(b.date)) : undefined,
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
    console.error('PATCH /api/log/[id] error:', e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
