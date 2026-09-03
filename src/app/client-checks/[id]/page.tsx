'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ClientCheck, ClientCheckAttachment } from '@/lib/types'
import { ChevronLeft, Trash2, Paperclip, Download, X } from 'lucide-react'
import Link from 'next/link'

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']
const STATUSES = ['未訂正', '確認中', '訂正済']
const TYPES = ['指摘', 'クレーム', '処理方法']

const statusStyle: Record<string, string> = {
  '未訂正': 'bg-red-100 text-red-700',
  '訂正済': 'bg-green-100 text-green-700',
  '確認中': 'bg-yellow-100 text-yellow-700',
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function ClientCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [check, setCheck] = useState<ClientCheck | null>(null)
  const [form, setForm] = useState<Partial<ClientCheck>>({})
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<{ id: string; code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: { id: string; code: string; name: string }[]; top: number; left: number } | null>(null)
  const [attachments, setAttachments] = useState<ClientCheckAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const [{ data: c }, { data: cl }, { data: att }] = await Promise.all([
      supabase.from('client_checks').select('*').eq('id', id).single(),
      supabase.from('clients').select('id, code, name').order('code'),
      supabase.from('client_check_attachments').select('*').eq('check_id', id).order('created_at'),
    ])
    if (c) { setCheck(c); setForm(c) }
    setClients(cl || [])
    setAttachments(att || [])
  }

  function onClientNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setForm(f => ({ ...f, client_name: text, client_id: undefined, client_code: undefined }))
    if (text.length >= 1) {
      const matches = clients.filter(c => c.name.includes(text)).slice(0, 8)
      if (matches.length > 0) {
        const rect = e.target.getBoundingClientRect()
        setSuggestions({ matches, top: rect.bottom + 2, left: rect.left })
      } else setSuggestions(null)
    } else setSuggestions(null)
  }

  function onClientCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const code = e.target.value
    const found = clients.find(c => c.code === code)
    if (found) setForm(f => ({ ...f, client_id: found.id, client_code: found.code, client_name: found.name }))
    else setForm(f => ({ ...f, client_code: code }))
  }

  function selectClient(c: { id: string; code: string; name: string }) {
    setForm(f => ({ ...f, client_id: c.id, client_code: c.code, client_name: c.name }))
    setSuggestions(null)
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_checks').update({
      client_id: form.client_id || null,
      client_code: form.client_code || null,
      client_name: form.client_name,
      check_date: form.check_date,
      checker: form.checker || null,
      category: form.category || null,
      type: form.type || null,
      content: form.content,
      status: form.status,
      corrected_date: form.corrected_date || null,
      correction_note: form.correction_note || null,
    }).eq('id', id)
    if (error) alert('エラー: ' + error.message)
    setSaving(false)
    await load()
  }

  async function remove() {
    if (!confirm('削除しますか？')) return
    const supabase = createClient()
    await supabase.from('client_checks').delete().eq('id', id)
    router.push('/client-checks')
  }

  async function uploadFile(file: File) {
    setUploading(true)
    const supabase = createClient()
    const safeName = encodeURIComponent(file.name).replace(/%/g, '_')
    const path = `client-checks/${id}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
    if (upErr) { alert('アップロードエラー: ' + upErr.message); setUploading(false); return }
    const { error: dbErr } = await supabase.from('client_check_attachments').insert({
      check_id: id, file_name: file.name, file_path: path, file_size: file.size,
    })
    if (dbErr) alert('エラー: ' + dbErr.message)
    setUploading(false)
    await load()
  }

  async function deleteAttachment(att: ClientCheckAttachment) {
    if (!confirm(`"${att.file_name}" を削除しますか？`)) return
    const supabase = createClient()
    await supabase.storage.from('attachments').remove([att.file_path])
    await supabase.from('client_check_attachments').delete().eq('id', att.id)
    setAttachments(a => a.filter(x => x.id !== att.id))
  }

  async function downloadAttachment(att: ClientCheckAttachment) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.file_path, 60)
    if (error || !data) { alert('ダウンロードエラー'); return }
    window.open(data.signedUrl, '_blank')
  }

  if (!check) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/client-checks" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
          <h1 className="text-2xl font-bold text-gray-800">指摘事項</h1>
          {form.status && (
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle[form.status] || 'bg-gray-100 text-gray-600'}`}>
              {form.status}
            </span>
          )}
        </div>
        <button onClick={remove} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700">
          <Trash2 size={14} /> 削除
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">指摘日</label>
            <input type="date" className={ic} value={form.check_date || ''} onChange={e => setForm(f => ({ ...f, check_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">確認者</label>
            <input className={ic} value={form.checker || ''} onChange={e => setForm(f => ({ ...f, checker: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">顧客</label>
          {form.client_name && form.client_id ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
              <span className="font-mono text-gray-500 text-xs">{form.client_code}</span>
              <span className="font-medium text-gray-800">{form.client_name}</span>
              <button onClick={() => setForm(f => ({ ...f, client_id: undefined, client_code: undefined, client_name: '' }))} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">×</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input className={ic} value={form.client_code || ''} onChange={onClientCodeChange} placeholder="顧客コード" />
              <input className={ic} value={form.client_name || ''} onChange={onClientNameChange}
                onBlur={() => setTimeout(() => setSuggestions(null), 150)} placeholder="顧客名（部分一致）" />
            </div>
          )}
        </div>

        {/* 種別 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">種別</label>
          <div className="flex gap-2">
            {TYPES.map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${form.type === t
                  ? t === '指摘' ? 'bg-red-600 text-white border-red-600'
                    : t === 'クレーム' ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">区分</label>
            <select className={ic} value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">状況</label>
            <select className={ic} value={form.status || ''} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              disabled={form.type === '処理方法'}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {form.type === '処理方法' ? '処理方法・特殊対応の内容' : form.type === 'クレーム' ? 'クレーム内容' : '指摘内容'}
          </label>
          <textarea className={ic + ' resize-none'} rows={6} value={form.content || ''}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">訂正日</label>
          <input type="date" className={ic} value={form.corrected_date || ''} onChange={e => setForm(f => ({ ...f, corrected_date: e.target.value }))} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">訂正メモ</label>
          <textarea className={ic + ' resize-none'} rows={4} value={form.correction_note || ''}
            onChange={e => setForm(f => ({ ...f, correction_note: e.target.value }))} placeholder="訂正内容・対応メモ" />
        </div>

        {/* 添付ファイル */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Paperclip size={13} /> 添付ファイル
            </label>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg disabled:opacity-50">
              {uploading ? 'アップロード中...' : '+ ファイルを追加'}
            </button>
            <input ref={fileInputRef} type="file" className="hidden"
              onChange={e => { if (e.target.files?.[0]) { uploadFile(e.target.files[0]); e.target.value = '' } }} />
          </div>
          {attachments.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
              添付ファイルなし
            </div>
          ) : (
            <ul className="space-y-1">
              {attachments.map(att => (
                <li key={att.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <Paperclip size={14} className="text-gray-400 shrink-0" />
                  <span className="flex-1 truncate text-gray-700">{att.file_name}</span>
                  {att.file_size && <span className="text-xs text-gray-400 shrink-0">{formatSize(att.file_size)}</span>}
                  <button onClick={() => downloadAttachment(att)} className="text-blue-500 hover:text-blue-700 shrink-0">
                    <Download size={14} />
                  </button>
                  <button onClick={() => deleteAttachment(att)} className="text-gray-300 hover:text-red-400 shrink-0">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/client-checks" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">一覧に戻る</Link>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {suggestions && (
        <div style={{ position: 'fixed', top: suggestions.top, left: suggestions.left, minWidth: '260px', zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.matches.map(c => (
            <button key={c.id} type="button" onMouseDown={() => selectClient(c)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-2">
              <span className="font-mono text-gray-400 shrink-0">{c.code}</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
