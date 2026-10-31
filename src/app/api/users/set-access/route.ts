import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// 退職日が入っているスタッフはログインできないようにする（Supabase Authの利用停止）。
// 退職日を消すとログインできる状態に戻す。
// 利用停止にするとセッションの更新ができなくなるため、ログインしたままの人も最大1時間ほどでログイン画面に戻る。
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー（SERVICE_ROLE_KEY未設定）' }, { status: 500 })

  const { id, leave_date } = await req.json()
  if (!id) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 })

  // 操作している人が管理者か確認
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return req.cookies.getAll() }, setAll() {} },
  })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしていません' }, { status: 401 })

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: '管理者のみ操作できます' }, { status: 403 })
  if (leave_date && id === user.id) return NextResponse.json({ error: '自分自身をログイン不可にはできません' }, { status: 400 })

  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: leave_date ? '876000h' : 'none' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
