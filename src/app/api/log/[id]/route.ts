import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
