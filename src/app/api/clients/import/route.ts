import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'サーバー設定エラー（SERVICE_ROLE_KEY未設定）' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  const { records } = await req.json() as { records: Record<string, unknown>[] }

  const errors: string[] = []
  let success = 0

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const { error } = await supabase
      .from('clients')
      .upsert(record, { onConflict: 'code' })

    if (error) {
      errors.push(`行${i + 2} (${record.code}): ${error.message}`)
    } else {
      success++
    }
  }

  return NextResponse.json({ success, errors })
}
