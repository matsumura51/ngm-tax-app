// Googleドライブ（支払調書の契約書の保存先）。サーバー（API）だけで使う
// 権限は drive.file（このアプリが作ったファイル・フォルダだけを扱える。ドライブのほかのファイルは見えない）
import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file openid email'
export const ROOT_FOLDER_NAME = '支払調書_契約書'
export const OWNER_EMAIL = 'm.jun@tax-machida.com' // 保存先のアカウント（接続するときにこのアカウントか確かめる）

export const driveClientId = () => process.env.GOOGLE_DRIVE_CLIENT_ID || ''
export const driveClientSecret = () => process.env.GOOGLE_DRIVE_CLIENT_SECRET || ''
export const redirectUri = (req: NextRequest) => `${req.nextUrl.origin}/api/drive/callback`

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export { requireUser } from './apiAuth'

// 保存してある refresh_token から、その都度アクセス用のトークンをもらう
export async function accessToken(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('google_drive_auth').select('refresh_token').eq('id', 1).maybeSingle()
  if (!data?.refresh_token) throw new DriveError('Googleドライブに接続されていません。管理者が「ユーザー管理」→「Googleドライブの接続」から接続してください', 400)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: driveClientId(), client_secret: driveClientSecret(), refresh_token: data.refresh_token, grant_type: 'refresh_token' }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) throw new DriveError(`Googleドライブの接続が切れています。管理者がもう一度接続してください（${j.error || res.status}）`, 400)
  return j.access_token as string
}

export class DriveError extends Error { constructor(message: string, public status = 500) { super(message) } }
export const driveErrorResponse = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: e instanceof DriveError ? e.status : 500 })

async function driveJson(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new DriveError(`Googleドライブでエラーが起きました（${j?.error?.message || res.status}）`, res.status === 404 ? 404 : 502)
  return j
}

async function createFolder(token: string, name: string, parent?: string): Promise<string> {
  const j = await driveJson(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
  })
  return j.id as string
}
// 記録してあるフォルダがまだ使えるか（ゴミ箱に入れた・消したときは作り直す）
async function folderAlive(token: string, id: string): Promise<boolean> {
  try { const j = await driveJson(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`); return !j.trashed } catch { return false }
}
async function ensureFolder(db: SupabaseClient, token: string, key: string, name: string, parent?: string): Promise<string> {
  const { data } = await db.from('google_drive_folders').select('folder_id').eq('key', key).maybeSingle()
  if (data?.folder_id && await folderAlive(token, data.folder_id)) return data.folder_id
  const id = await createFolder(token, name, parent)
  await db.from('google_drive_folders').upsert({ key, folder_id: id })
  return id
}
// 顧問先のフォルダ（支払調書_契約書 / 0001_顧問先名）
export async function clientFolder(db: SupabaseClient, token: string, clientId: string): Promise<string> {
  const { data: c } = await db.from('clients').select('code, name').eq('id', clientId).maybeSingle()
  if (!c) throw new DriveError('顧問先が見つかりません', 404)
  const root = await ensureFolder(db, token, 'root', ROOT_FOLDER_NAME)
  return ensureFolder(db, token, `client:${clientId}`, `${c.code}_${c.name}`.replace(/[\\/]/g, '_'), root)
}

// 再開可能なアップロードの受付（ブラウザからドライブへ直接送る。Vercel の 4.5MB の制限を通らないように）
export async function createUploadSession(token: string, folderId: string, name: string, mime: string, size: number, origin: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,parents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime || 'application/octet-stream', 'X-Upload-Content-Length': String(size),
      Origin: origin, // ブラウザから送れるように（CORS）
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  })
  const loc = res.headers.get('location')
  if (!res.ok || !loc) { const t = await res.text().catch(() => ''); throw new DriveError(`Googleドライブの保存の準備に失敗しました（${res.status} ${t.slice(0, 200)}）`, 502) }
  return loc
}

export async function getFileMeta(token: string, fileId: string): Promise<{ id: string; name: string; mimeType: string; size?: string; parents?: string[]; trashed?: boolean }> {
  return driveJson(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,parents,trashed`)
}
export async function trashFile(token: string, fileId: string): Promise<void> {
  await driveJson(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  })
}
export async function downloadFile(token: string, fileId: string): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new DriveError(`Googleドライブからファイルを取り出せませんでした（${res.status}）`, res.status === 404 ? 404 : 502)
  return res
}

export { matchKey } from './contractKey'
