import { NextRequest, NextResponse } from 'next/server'
import { applyWeekActions } from '@/lib/apply-week-actions'

// 教练对话产生的课表操作在此执行（改某天 / 删某天安排 / 改本周目标）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { actions } = body as { actions?: unknown[] }
    if (!Array.isArray(actions)) return NextResponse.json({ error: '缺少 actions' }, { status: 400 })
    const result = await applyWeekActions(id, actions as never[])
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
