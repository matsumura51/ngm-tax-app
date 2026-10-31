import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, password, role, department, hire_date, leave_date, division } = body
  // 全角のログインIDは半角に揃える（ログイン画面は半角で入力されるため）
  const code = String(body.code || '').normalize('NFKC').replace(/\s/g, '')

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
    password: '111111',
    email_confirm: true,
    // 退職日が入っていればログインできない状態で作成する
    ...(leave_date ? { ban_duration: '876000h' } : {}),
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
    hire_date: hire_date || null,
    leave_date: leave_date || null,
    division: division || null,
    must_change_password: true,
  }).eq('id', data.user.id)

  return NextResponse.json({ success: true })
}
