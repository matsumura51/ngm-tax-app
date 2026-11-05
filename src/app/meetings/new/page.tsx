'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Paperclip, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { confirmLeaveIfDirty, setUnsavedChanges, useUnsavedGuard } from '@/lib/unsavedGuard'
import MeetingFormFields from '@/components/MeetingFormFields'
import { MeetingForm, emptyMeetingForm, meetingPayload, meetingFilePath, formatSize } from '@/lib/meetings'

function MeetingNewForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromClientId = searchParams.get('client_id')
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [userName, setUserName] = useState('')
  const [form, setForm] = useState<MeetingForm>(() => ({
    ...emptyMeetingForm(),
    client_id: fromClientId || null,
    client_code: searchParams.get('client_code') || null,
    client_name: searchParams.get('client_name') || '',
  }))

  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
      const name = data?.name || user.email?.split('@')[0] || ''
      setUserName(name)
      setForm(f => ({ ...f, recorder: f.recorder || name, attendees_office: f.attendees_office || name }))
    })()
  }, [])

  useUnsavedGuard(!!(form.content?.trim() || form.decisions?.trim() || form.todo?.trim() || form.subject?.trim() || files.length > 0))

  // 顧客カルテから来たときはカルテに戻る
  const backHref = fromClientId ? `/clients/${fromClientId}` : '/meetings'

  async function save() {
    if (!form.client_name.trim()) { alert('顧客を入力してください'); return }
    if (!form.meeting_date) { alert('打合せ日を入力してください'); return }
    setSaving(true)
    const supabase = createClient()
    const { data: created, error } = await supabase.from('meetings')
      .insert({ ...meetingPayload(form), updated_by: userName || null })
      .select('id').single()
    if (error) { alert('エラー: ' + error.message); setSaving(false); return }
    const failed: string[] = []
    for (const file of files) {
      const path = meetingFilePath(created.id, file.name)
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
      if (upErr) { failed.push(file.name); continue }
      const { error: dbErr } = await supabase.from('meeting_attachments').insert({
        meeting_id: created.id, file_name: file.name, file_path: path, file_size: file.size,
      })
      if (dbErr) failed.push(file.name)
    }
    if (failed.length > 0) alert(`打合せ記録は保存しましたが、次のファイルの添付に失敗しました。詳細画面から再度添付してください。\n・${failed.join('\n・')}`)
    setUnsavedChanges(false)
    router.push(`/meetings/${created.id}`)
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} onNavigate={e => { if (!confirmLeaveIfDirty()) e.preventDefault() }} className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-800">打合せ記録 新規作成</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <MeetingFormFields form={form} setForm={setForm} />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1"><Paperclip size={13} /> 添付ファイル</label>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">+ ファイルを追加</button>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              onChange={e => { const picked = Array.from(e.target.files || []); e.target.value = ''; setFiles(fs => [...fs, ...picked]) }} />
          </div>
          {files.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">添付ファイルなし（資料・メモの写真など）</div>
          ) : (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <Paperclip size={14} className="text-gray-400 shrink-0" />
                  <span className="flex-1 truncate text-gray-700">{f.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 shrink-0"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href={backHref} onNavigate={e => { if (!confirmLeaveIfDirty()) e.preventDefault() }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</Link>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MeetingNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <MeetingNewForm />
    </Suspense>
  )
}
