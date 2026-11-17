// APIの入口でのログイン確認（middleware は /api を対象にしていないため、各APIで必ず呼ぶ）
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

export type ApiUser = { id: string; name: string; role: string }

// ログインしている人を返す。いなければ 401、adminOnly で管理者でなければ 403 の応答を返す
export async function requireUser(req: NextRequest, adminOnly = false): Promise<ApiUser | NextResponse> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: 'サーバー設定エラー（SERVICE_ROLE_KEY未設定）' }, { status: 500 })
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return req.cookies.getAll() }, setAll() {} },
  })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしていません。もう一度ログインしてください' }, { status: 401 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: me } = await admin.from('users').select('name, role').eq('id', user.id).maybeSingle()
  if (adminOnly && me?.role !== 'admin') return NextResponse.json({ error: '管理者のみ操作できます' }, { status: 403 })
  return { id: user.id, name: me?.name || user.email || '', role: me?.role || '' }
}
