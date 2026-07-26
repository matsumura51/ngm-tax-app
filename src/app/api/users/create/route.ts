import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { code, name, password, role, department } = await req.json()

  if (!code || !name || !password) {
    return NextResponse.json({ error: 'ログインID・氏名・パスワードは必須です' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'サーバー設定エラー（SERVICE_ROLE_KEY未設定）' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  const email = `${code}@ngm-tax.local`

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await supabase.from('users').update({
    name,
    code,
    role: role || 'staff',
    department: department || null,
  }).eq('id', data.user.id)

  return NextResponse.json({ success: true })
}
