import { NextRequest, NextResponse } from 'next/server'
import { DriveError, accessToken, downloadFile, driveErrorResponse, requireUser, serviceClient, trashFile } from '@/lib/googleDrive'

type Ctx = { params: Promise<{ id: string }> }

async function find(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await serviceClient().from('payment_report_contracts').select('*').eq('id', id).maybeSingle()
  return data
}

// 契約書を見る（ドライブから取り出して、そのまま流す。スタッフにドライブの共有はしない）
export async function GET(req: NextRequest, { params }: Ctx) {
  const me = await requireUser(req)
  if (me instanceof NextResponse) return me
  try {
    const c = await find((await params).id)
    if (!c) return NextResponse.json({ error: '見つかりません' }, { status: 404 })
    const token = await accessToken(serviceClient())
    const res = await downloadFile(token, c.drive_file_id)
    const headers = new Headers({
      'Content-Type': c.mime_type || res.headers.get('content-type') || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(c.file_name)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    const len = res.headers.get('content-length')
    if (len) headers.set('Content-Length', len)
    return new Response(res.body, { headers })
  } catch (e) { return driveErrorResponse(e) }
}

// 削除：ドライブのファイルはゴミ箱へ（30日間は戻せる）、記録は消す
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const me = await requireUser(req)
  if (me instanceof NextResponse) return me
  try {
    const c = await find((await params).id)
    if (!c) return NextResponse.json({ error: '見つかりません' }, { status: 404 })
    const db = serviceClient()
    try { await trashFile(await accessToken(db), c.drive_file_id) } catch (e) {
      // ドライブで先に消されていたときは、記録だけ消す
      if (!(e instanceof DriveError && e.status === 404)) throw e
    }
    await db.from('payment_report_contracts').delete().eq('id', c.id)
    return NextResponse.json({ ok: true })
  } catch (e) { return driveErrorResponse(e) }
}
