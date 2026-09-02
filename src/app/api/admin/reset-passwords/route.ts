import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  // auth.usersを全件取得
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 400 })

  let count = 0
  for (const user of users) {
    await supabase.auth.admin.updateUserById(user.id, { password: '111111' })
    count++
  }

  // usersテーブルも全員must_change_password = true に
  await supabase.from('users').update({ must_change_password: true }).neq('id', '00000000-0000-0000-0000-000000000000')

  return NextResponse.json({ success: true, reset: count })
}
