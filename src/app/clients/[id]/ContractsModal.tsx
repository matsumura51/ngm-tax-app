'use client'
// 支払調書の契約書（貸主×物件ごと）：一覧・添付・表示・削除。ファイルは Googleドライブ（m.jun@tax-machida.com）に保存
import { useRef, useState } from 'react'
import { FileText, Trash2, Upload, X } from 'lucide-react'

export type Contract = { id: string; client_id: string; payee_key: string; property_key: string; payee_name: string | null; property_address: string | null; file_name: string; mime_type: string | null; file_size: number | null; uploaded_by: string | null; created_at: string }

const fmtSize = (n: number | null) => (!n ? '' : n < 1024 * 1024 ? `${Math.ceil(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`)
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif'

// 写真は保存する前に縮小する（長い辺 2000px・JPEG）。読めない形式（HEICなど）はそのまま
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 800 * 1024) return file
  try {
    const bmp = await createImageBitmap(file)
    const r = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg' })
  } catch { return file }
}

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `エラーが起きました（${r.status}）`)
  return j
}

export default function ContractsModal({ clientId, payeeName, propertyAddress, contracts, onClose, onChanged }: {
  clientId: string; payeeName: string; propertyAddress: string; contracts: Contract[]; onClose: () => void; onChanged: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function upload(files: File[]) {
    setError('')
    for (const [i, f0] of files.entries()) {
      try {
        setBusy(`保存中…（${i + 1}/${files.length}）${f0.name}`)
        const f = await shrink(f0)
        const { uploadUrl } = await postJson('/api/contracts/upload-session', { client_id: clientId, file_name: f.name, mime_type: f.type, size: f.size })
        // ブラウザから Googleドライブへ直接送る
        const up = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f })
        const meta = await up.json().catch(() => ({}))
        if (!up.ok || !meta.id) throw new Error(`Googleドライブへの送信に失敗しました（${up.status}）`)
        await postJson('/api/contracts/complete', { client_id: clientId, file_id: meta.id, payee_name: payeeName, property_address: propertyAddress })
      } catch (e) { setError(`${f0.name}：${(e as Error).message}`); break }
    }
    setBusy('')
    onChanged()
  }
  async function remove(c: Contract) {
    if (!confirm(`「${c.file_name}」を削除しますか？\n（Googleドライブではゴミ箱に移します。30日間は戻せます）`)) return
    setBusy('削除中…'); setError('')
    try {
      const r = await fetch(`/api/contracts/${c.id}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `エラーが起きました（${r.status}）`)
    } catch (e) { setError((e as Error).message) }
    setBusy('')
    onChanged()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <div className="font-medium text-gray-800">契約書</div>
            <div className="text-xs text-gray-500">{payeeName || '（支払先なし）'}　{propertyAddress}</div>
          </div>
          <button onClick={onClose} disabled={!!busy} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {contracts.length === 0 ? <div className="text-sm text-gray-400 py-4 text-center">まだ添付していません</div> : (
            <ul className="divide-y divide-gray-100 border rounded-lg">
              {contracts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  <a href={`/api/contracts/${c.id}`} target="_blank" rel="noopener" className="text-indigo-600 hover:underline truncate flex-1" title="別のタブで開きます">{c.file_name}</a>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{fmtSize(c.file_size)}　{c.uploaded_by}　{new Date(c.created_at).toLocaleDateString('ja-JP')}</span>
                  <button onClick={() => remove(c)} disabled={!!busy} className="text-gray-300 hover:text-red-500" title="削除"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
          <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) upload(f) }} />
          <div className="flex items-center gap-3">
            <button onClick={() => input.current?.click()} disabled={!!busy || (!payeeName.trim() && !propertyAddress.trim())}
              className="flex items-center gap-1 text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg">
              <Upload size={14} /> 契約書を添付
            </button>
            {busy && <span className="text-sm text-gray-500">{busy}</span>}
          </div>
          <p className="text-xs text-gray-500">PDF・画像（50MBまで）。写真は縮小して保存します。同じ顧問先で支払先と物件所在地が同じ行には、翌年以降の支払調書にも同じ契約書が表示されます。</p>
        </div>
      </div>
    </div>
  )
}
