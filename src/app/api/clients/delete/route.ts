import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { ids } = await req.json() as { ids: string[] }

  if (!ids || ids.length === 0) return NextResponse.json({ error: 'IDが指定されていません' }, { status: 400 })

  const { error } = await supabase.from('clients').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, deleted: ids.length })
}
