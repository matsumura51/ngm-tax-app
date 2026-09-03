import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const year = searchParams.get('year')
  if (!year) return NextResponse.json({ error: 'year パラメータ不足' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data, error } = await supabase
    .from('monthly_progress')
    .select('id, client_id, client_code, client_name, primary_staff, sub_staff, year, monthly_material, monthly_completion, monthly_status, settle_return_docs, settle_return_prepared')
    .eq('year', Number(year))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
