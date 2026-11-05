'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Trash2, Paperclip, Download, X, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { usePrintScale, PrintScaleSelect } from '@/lib/printScale'
import { confirmLeaveIfDirty, setUnsavedChanges, useUnsavedGuard } from '@/lib/unsavedGuard'
import MeetingFormFields from '@/components/MeetingFormFields'
import { Meeting, MeetingAttachment, MeetingForm, meetingPayload, meetingFilePath, formatSize, fmtTime } from '@/lib/meetings'

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${y}年${Number(m)}月${Number(day)}日`
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [form, setForm] = useState<MeetingForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<MeetingAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [userName, setUserName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialSnapshot = useRef<string | null>(null)
  const [printScale, printScaleKey, setPrintScaleKey] = usePrintScale()

  useEffect(() => { load() }, [id])
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
      setUserName(data?.name || user.email?.split('@')[0] || '')
    })()
  }, [])

  async function load() {
    const supabase = createClient()
    const [{ data: m }, { data: att }] = await Promise.all([
      supabase.from('meetings').select('*').eq('id', id).maybeSingle(),
      supabase.from('meeting_attachments').select('*').eq('meeting_id', id).order('created_at'),
    ])
    if (!m) { setNotFound(true); return }
    const { id: _i, created_at: _c, updated_at: _u, updated_by: _b, ...f } = m as Meeting
    setMeeting(m as Meeting)
    setForm(f)
    initialSnapshot.current = JSON.stringify(f)
    setAttachments(att || [])
  }

  useUnsavedGuard(initialSnapshot.current !== null && form !== null && JSON.stringify(form) !== initialSnapshot.current)

  async function save() {
    if (!form) return
    if (!form.client_name.trim()) { alert('顧客を入力してください'); return }
    if (!form.meeting_date) { alert('打合せ日を入力してください'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('meetings')
      .update({ ...meetingPayload(form), updated_by: userName || null, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
    if (error) { alert('エラー: ' + error.message); return }
    setSavedAt(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
    await load()
  }

  async function remove() {
    if (!confirm('この打合せ記録を削除しますか？（添付ファイルも削除されます）')) return
    const supabase = createClient()
    if (attachments.length > 0) await supabase.storage.from('attachments').remove(attachments.map(a => a.file_path))
    const { error } = await supabase.from('meetings').delete().eq('id', id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setUnsavedChanges(false)
    router.push(meeting?.client_id ? `/clients/${meeting.client_id}` : '/meetings')
  }

  async function uploadFile(file: File) {
    const supabase = createClient()
    const path = meetingFilePath(id, file.name)
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
    if (upErr) { alert(`アップロードエラー（${file.name}）: ` + upErr.message); return }
    const { error: dbErr } = await supabase.from('meeting_attachments').insert({
      meeting_id: id, file_name: file.name, file_path: path, file_size: file.size,
    })
    if (dbErr) alert('エラー: ' + dbErr.message)
  }

  async function uploadFiles(files: File[]) {
    setUploading(true)
    for (const f of files) await uploadFile(f)
    setUploading(false)
    const supabase = createClient()
    const { data } = await supabase.from('meeting_attachments').select('*').eq('meeting_id', id).order('created_at')
    setAttachments(data || [])
  }

  async function deleteAttachment(att: MeetingAttachment) {
    if (!confirm(`"${att.file_name}" を削除しますか？`)) return
    const supabase = createClient()
    await supabase.storage.from('attachments').remove([att.file_path])
    await supabase.from('meeting_attachments').delete().eq('id', att.id)
    setAttachments(a => a.filter(x => x.id !== att.id))
  }

  async function downloadAttachment(att: MeetingAttachment) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.file_path, 60)
    if (error || !data) { alert('ダウンロードエラー'); return }
    window.open(data.signedUrl, '_blank')
  }

  if (notFound) return <div className="p-6 text-gray-400">打合せ記録が見つかりません（削除された可能性があります）</div>
  if (!meeting || !form) return <div className="p-6 text-gray-400">読み込み中...</div>

  const backHref = '/meetings'
  const time = [fmtTime(form.start_time), fmtTime(form.end_time)].filter(Boolean).join(' 〜 ')
  const th: React.CSSProperties = { width: '15%', padding: '4px 8px', background: '#f3f4f6', border: '1px solid #ccc', fontWeight: 'bold', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '4px 8px', border: '1px solid #ccc' }
  const block = (label: string, text: string | null, minH: number) => (
    <div style={{ marginBottom: 12, breakInside: 'avoid-page' }}>
      <div style={{ fontWeight: 'bold', fontSize: 10 * printScale, background: '#f3f4f6', padding: '4px 8px', border: '1px solid #ccc', borderBottom: 'none' }}>{label}</div>
      <div style={{ padding: 8, border: '1px solid #ccc', minHeight: minH * printScale, whiteSpace: 'pre-wrap', fontSize: 10 * printScale }}>{text || ''}</div>
    </div>
  )

  return (
    <>
    {/* ===== 印刷専用レイアウト ===== */}
    <style>{`
      @media print {
        body { visibility: hidden; }
        #print-area { visibility: visible; position: absolute; top: 0; left: 0; width: 100%; padding: 24px; box-sizing: border-box; font-size: ${11 * printScale}pt; color: #000; background: #fff; }
        #print-area * { visibility: visible; }
      }
      @media screen {
        #print-area { display: none; }
      }
    `}</style>
    <div id="print-area">
      <div style={{ borderBottom: '2px solid #333', paddingBottom: 8, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 18 * printScale, fontWeight: 'bold' }}>打合せ記録</div>
        <div style={{ fontSize: 11 * printScale }}>{form.client_code} {form.client_name}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 10 * printScale }}>
        <tbody>
          <tr>
            <td style={th}>打合せ日</td>
            <td style={{ ...td, width: '35%' }}>{fmtDate(form.meeting_date)}{time ? `　${time}` : ''}</td>
            <td style={th}>方法</td>
            <td style={td}>{form.method || '—'}{form.place ? `（${form.place}）` : ''}</td>
          </tr>
          <tr>
            <td style={th}>件名</td>
            <td style={td}>{form.subject || '—'}</td>
            <td style={th}>区分</td>
            <td style={td}>{form.category || '—'}</td>
          </tr>
          <tr>
            <td style={th}>出席者（先方）</td>
            <td style={td}>{form.attendees_client || '—'}</td>
            <td style={th}>出席者（事務所）</td>
            <td style={td}>{form.attendees_office || '—'}</td>
          </tr>
        </tbody>
      </table>
      {block('打合せ内容', form.content, 120)}
      {block('決定事項', form.decisions, 60)}
      {block('宿題・次回までの対応', form.todo, 60)}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 10 * printScale }}>
        <tbody>
          <tr>
            <td style={th}>次回予定日</td>
            <td style={{ ...td, width: '35%' }}>{fmtDate(form.next_date)}</td>
            <td style={th}>記録者</td>
            <td style={td}>{form.recorder || '—'}</td>
          </tr>
        </tbody>
      </table>
      {attachments.length > 0 && (
        <div style={{ fontSize: 10 * printScale }}>
          <div style={{ fontWeight: 'bold', background: '#f3f4f6', padding: '4px 8px', border: '1px solid #ccc', borderBottom: 'none' }}>添付ファイル</div>
          <ul style={{ margin: 0, padding: '4px 8px 4px 24px', border: '1px solid #ccc' }}>
            {attachments.map(a => <li key={a.id}>{a.file_name}</li>)}
          </ul>
        </div>
      )}
    </div>

    {/* ===== 通常レイアウト ===== */}
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href={backHref} onNavigate={e => { if (!confirmLeaveIfDirty()) e.preventDefault() }} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
          <h1 className="text-2xl font-bold text-gray-800">打合せ記録</h1>
          {meeting.client_id && (
            <Link href={`/clients/${meeting.client_id}`} onNavigate={e => { if (!confirmLeaveIfDirty()) e.preventDefault() }}
              className="text-xs text-blue-600 hover:underline">顧客カルテを開く</Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          <PrintScaleSelect value={printScaleKey} onChange={setPrintScaleKey} />
          <button onClick={() => window.print()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <Printer size={14} /> 印刷
          </button>
          <button onClick={remove} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700">
            <Trash2 size={14} /> 削除
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <MeetingFormFields form={form} setForm={fn => setForm(f => (f ? fn(f) : f))} />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Paperclip size={13} /> 添付ファイル</label>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg disabled:opacity-50">
              {uploading ? 'アップロード中...' : '+ ファイルを追加'}
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={e => { const picked = Array.from(e.target.files || []); e.target.value = ''; uploadFiles(picked) }} />
          </div>
          {attachments.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">添付ファイルなし</div>
          ) : (
            <ul className="space-y-1">
              {attachments.map(att => (
                <li key={att.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <Paperclip size={14} className="text-gray-400 shrink-0" />
                  <span className="flex-1 truncate text-gray-700">{att.file_name}</span>
                  {att.file_size && <span className="text-xs text-gray-400 shrink-0">{formatSize(att.file_size)}</span>}
                  <button onClick={() => downloadAttachment(att)} className="text-blue-500 hover:text-blue-700 shrink-0" title="開く"><Download size={14} /></button>
                  <button onClick={() => deleteAttachment(att)} className="text-gray-300 hover:text-red-400 shrink-0" title="削除"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-gray-400">
            最終更新：{new Date(meeting.updated_at).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {meeting.updated_by ? `（${meeting.updated_by}）` : ''}
            {savedAt && <span className="ml-2 text-green-600">{savedAt} に保存しました</span>}
          </div>
          <div className="flex gap-3">
            <Link href={backHref} onNavigate={e => { if (!confirmLeaveIfDirty()) e.preventDefault() }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">一覧に戻る</Link>
            <button onClick={save} disabled={saving}
              className="px-6 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
