import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { id } = await req.json() as { id: string }

  if (!id) return NextResponse.json({ error: 'IDが指定されていません' }, { status: 400 })

  await supabase.from('daily_report_details').delete().eq('report_id', id)
  const { error } = await supabase.from('daily_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
