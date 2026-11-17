import { NextRequest, NextResponse } from 'next/server'
import { accessToken, clientFolder, createUploadSession, driveErrorResponse, requireUser, serviceClient } from '@/lib/googleDrive'

const MAX = 50 * 1024 * 1024
const OK_TYPE = /^(application\/pdf|image\/(jpeg|png|gif|webp|heic|heif))$/

// 契約書の保存の準備：顧問先のフォルダを用意して、ブラウザから直接ドライブへ送る先（URL）を返す
export async function POST(req: NextRequest) {
  const me = await requireUser(req)
  if (me instanceof NextResponse) return me
  try {
    const b = await req.json()
    const clientId = String(b.client_id || ''), name = String(b.file_name || '').slice(0, 200), mime = String(b.mime_type || ''), size = Number(b.size) || 0
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: '顧問先が正しくありません' }, { status: 400 })
    if (!name) return NextResponse.json({ error: 'ファイル名がありません' }, { status: 400 })
    if (!OK_TYPE.test(mime)) return NextResponse.json({ error: 'PDFか画像（JPEG・PNGなど）を選んでください' }, { status: 400 })
    if (size <= 0 || size > MAX) return NextResponse.json({ error: 'ファイルは50MBまでです' }, { status: 400 })
    const db = serviceClient(), token = await accessToken(db)
    const folder = await clientFolder(db, token, clientId)
    const uploadUrl = await createUploadSession(token, folder, name, mime, size, req.nextUrl.origin)
    return NextResponse.json({ uploadUrl })
  } catch (e) { return driveErrorResponse(e) }
}
