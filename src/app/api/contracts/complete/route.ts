import { NextRequest, NextResponse } from 'next/server'
import { accessToken, clientFolder, driveErrorResponse, getFileMeta, matchKey, requireUser, serviceClient } from '@/lib/googleDrive'

// ドライブへ送り終わった契約書を登録する（顧問先のフォルダに入っているファイルだけ）
export async function POST(req: NextRequest) {
  const me = await requireUser(req)
  if (me instanceof NextResponse) return me
  try {
    const b = await req.json()
    const clientId = String(b.client_id || ''), fileId = String(b.file_id || '')
    const payee = String(b.payee_name || '').slice(0, 200), property = String(b.property_address || '').slice(0, 300)
    if (!/^[0-9a-f-]{36}$/i.test(clientId) || !fileId) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 })
    if (!matchKey(payee) && !matchKey(property)) return NextResponse.json({ error: '支払先か物件所在地を入れてから添付してください' }, { status: 400 })
    const db = serviceClient(), token = await accessToken(db)
    const folder = await clientFolder(db, token, clientId)
    const f = await getFileMeta(token, fileId)
    if (f.trashed || !(f.parents || []).includes(folder)) return NextResponse.json({ error: 'この顧問先のフォルダのファイルではありません' }, { status: 400 })
    const { data, error } = await db.from('payment_report_contracts').insert({
      client_id: clientId, payee_key: matchKey(payee), property_key: matchKey(property), payee_name: payee, property_address: property,
      drive_file_id: f.id, file_name: f.name, mime_type: f.mimeType, file_size: Number(f.size) || null, uploaded_by: me.name,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ contract: data })
  } catch (e) { return driveErrorResponse(e) }
}
