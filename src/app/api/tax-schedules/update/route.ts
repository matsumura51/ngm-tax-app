import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const { id, field, value } = await req.json()
  if (!id || !field) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 })

  const allowed = ['payment_method', 'send_date', 'payment_date', 'contact_date', 'confirmation']
  if (!allowed.includes(field)) return NextResponse.json({ error: '不正なフィールド' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { error } = await supabase.from('tax_schedules').update({ [field]: value || null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
