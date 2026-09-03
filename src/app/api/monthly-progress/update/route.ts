import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const { id, updates } = await req.json()
  if (!id || !updates) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { error } = await supabase.from('monthly_progress').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
