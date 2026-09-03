import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const body = await req.json()
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // 既存レコードを確認（client_code + year で検索 — client_id が null のレコードも対象）
  const { data: existing } = await supabase
    .from('monthly_progress')
    .select('*')
    .eq('client_code', body.client_code)
    .eq('year', body.year)
    .maybeSingle()

  if (existing) return NextResponse.json(existing)

  // 新規作成
  const { data, error } = await supabase
    .from('monthly_progress')
    .insert(body)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
