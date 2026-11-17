import { NextRequest, NextResponse } from 'next/server'
import { DRIVE_SCOPE, OWNER_EMAIL, driveClientId, driveClientSecret, redirectUri, requireUser } from '@/lib/googleDrive'

// Googleドライブに接続する（管理者だけ）：Googleの許可の画面へ送る
export async function GET(req: NextRequest) {
  const me = await requireUser(req, true)
  if (me instanceof NextResponse) return me
  if (!driveClientId() || !driveClientSecret()) return NextResponse.json({ error: 'サーバー設定エラー（GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET 未設定）' }, { status: 500 })
  const state = crypto.randomUUID()
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: driveClientId(), redirect_uri: redirectUri(req), response_type: 'code', scope: DRIVE_SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', login_hint: OWNER_EMAIL, state,
  }).toString()
  const res = NextResponse.redirect(url.toString())
  res.cookies.set('drive_oauth_state', state, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/api/drive', maxAge: 600 })
  return res
}
