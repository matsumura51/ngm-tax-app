import { NextRequest, NextResponse } from 'next/server'
import { OWNER_EMAIL, driveClientId, driveClientSecret, redirectUri, requireUser, serviceClient } from '@/lib/googleDrive'

// Googleの許可の画面から戻ってきたところ：refresh_token を保存する（管理者だけ）
export async function GET(req: NextRequest) {
  const back = (q: string) => { const r = NextResponse.redirect(new URL(`/drive-connect?${q}`, req.url)); r.cookies.delete({ name: 'drive_oauth_state', path: '/api/drive' }); return r }
  const me = await requireUser(req, true)
  if (me instanceof NextResponse) return me
  const p = req.nextUrl.searchParams
  if (p.get('error')) return back(`error=${encodeURIComponent('Googleで許可されませんでした（' + p.get('error') + '）')}`)
  const state = req.cookies.get('drive_oauth_state')?.value
  if (!state || state !== p.get('state')) return back(`error=${encodeURIComponent('接続の確認に失敗しました。もう一度「接続する」を押してください')}`)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: p.get('code') || '', client_id: driveClientId(), client_secret: driveClientSecret(), redirect_uri: redirectUri(req), grant_type: 'authorization_code' }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.refresh_token) return back(`error=${encodeURIComponent('Googleから接続の情報を受け取れませんでした（' + (j.error_description || j.error || res.status) + '）')}`)
  // どのアカウントで許可したか（id_token の email）
  let email = ''
  try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()).email || '' } catch { /* 読めなくてもよい */ }
  if (email && email.toLowerCase() !== OWNER_EMAIL) return back(`error=${encodeURIComponent(`${email} で許可されました。保存先は ${OWNER_EMAIL} です。Googleでアカウントを切り替えて、もう一度接続してください`)}`)
  if (!String(j.scope || '').includes('drive.file')) return back(`error=${encodeURIComponent('Googleドライブの利用が許可されていません。許可の画面でチェックを入れてください')}`)
  const { error } = await serviceClient().from('google_drive_auth').upsert({ id: 1, refresh_token: j.refresh_token, email, connected_by: me.name, connected_at: new Date().toISOString() })
  if (error) return back(`error=${encodeURIComponent('保存に失敗しました：' + error.message)}`)
  return back('ok=1')
}
