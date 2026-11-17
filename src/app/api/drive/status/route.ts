import { NextRequest, NextResponse } from 'next/server'
import { driveClientId, requireUser, serviceClient } from '@/lib/googleDrive'

// Googleドライブの接続の状態（ログインしている人）
export async function GET(req: NextRequest) {
  const me = await requireUser(req)
  if (me instanceof NextResponse) return me
  const { data } = await serviceClient().from('google_drive_auth').select('email, connected_by, connected_at').eq('id', 1).maybeSingle()
  return NextResponse.json({ configured: !!driveClientId(), connected: !!data, email: data?.email || '', connected_by: data?.connected_by || '', connected_at: data?.connected_at || null })
}
