'use client'

import { useEffect, useState, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ClientQuestion, ClientQuestionAttachment } from '@/lib/types'
import { ChevronLeft, Trash2, Paperclip, Download, X, Plus, Printer } from 'lucide-react'
import Link from 'next/link'

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']
const STATUSES = ['未回答', '回答済']
const YEARS = [2023, 2024, 2025, 2026, 2027]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

type QItem = { text: string; answered: boolean; answer: string }

function parseItems(content: string | null | undefined): QItem[] {
  if (!content) return [{ text: '', answered: false, answer: '' }]
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch { /* legacy format */ }
  const lines = content.split('\n').filter(s => s.trim())
  return lines.length > 0
    ? lines.map(text => ({ text, answered: false, answer: '' }))
    : [{ text: '', answered: false, answer: '' }]
}

function parseWorkMonth(workDate: string | null | undefined) {
  if (!workDate) {
    const now = new Date()
    return { year: String(now.getFullYear()), month: String(now.getMonth() + 1) }
  }
  const [y, m] = workDate.split('-')
  return { year: y, month: String(parseInt(m)) }
}

const statusStyle: Record<string, string> = {
  '未回答': 'bg-orange-100 text-orange-700',
  '回答済': 'bg-blue-100 text-blue-700',
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function ClientQuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [question, setQuestion] = useState<ClientQuestion | null>(null)
  const [form, setForm] = useState<Partial<ClientQuestion>>({})
  const [items, setItems] = useState<QItem[]>([{ text: '', answered: false, answer: '' }])
  const [workYear, setWorkYear] = useState('')
  const [workMonth, setWorkMonth] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clients, setClients] = useState<{ id: string; code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: { id: string; code: string; name: string }[]; top: number; left: number } | null>(null)
  const [attachments, setAttachments] = useState<ClientQuestionAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const [{ data: q }, { data: cl }, { data: att }] = await Promise.all([
      supabase.from('client_questions').select('*').eq('id', id).single(),
      supabase.from('clients').select('id, code, name').order('code'),
      supabase.from('client_question_attachments').select('*').eq('question_id', id).order('created_at'),
    ])
    if (q) {
      setQuestion(q)
      setForm(q)
      setItems(parseItems(q.content))
      const wm = parseWorkMonth(q.work_date)
      setWorkYear(wm.year)
      setWorkMonth(wm.month)
    }
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

  function updateItem(i: number, patch: Partial<QItem>) {
    setItems(prev => prev.map((v, idx) => idx === i ? { ...v, ...patch } : v))
  }

  function addItem() {
    setItems(prev => [...prev, { text: '', answered: false, answer: '' }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function buildWorkDate() {
    if (!workYear || !workMonth) return null
    return `${workYear}-${workMonth.padStart(2, '0')}-01`
  }

  const allAnswered = items.length > 0 && items.every(it => it.answered)
  const unansweredItems = items.filter(it => !it.answered && it.text.trim())

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const computedStatus = allAnswered ? '回答済' : '未回答'
    const { error } = await supabase.from('client_questions').update({
      client_id: form.client_id || null,
      client_code: form.client_code || null,
      client_name: form.client_name,
      question_date: form.question_date,
      work_date: buildWorkDate(),
      questioner: form.questioner || null,
      category: form.category || null,
      content: JSON.stringify(items),
      status: computedStatus,
      answered_date: allAnswered ? (form.answered_date || new Date().toISOString().split('T')[0]) : null,
      answer: null,
    }).eq('id', id)
    if (error) { alert('エラー: ' + error.message); setSaving(false); return }

    // 回答済みになった項目のテキストを前月以前のレコードにも反映
    const answeredTexts = new Set(
      items.filter(it => it.answered && it.text.trim()).map(it => it.text.trim())
    )
    if (answeredTexts.size > 0 && (form.client_code || form.client_id)) {
      let prevQuery = supabase
        .from('client_questions')
        .select('id, content')
        .neq('id', id)
      if (form.client_code) prevQuery = prevQuery.eq('client_code', form.client_code)
      else prevQuery = prevQuery.eq('client_id', form.client_id as string)
      const currentWorkDate = buildWorkDate()
      if (currentWorkDate) prevQuery = prevQuery.lt('work_date', currentWorkDate)

      const { data: prevRecords } = await prevQuery
      for (const record of (prevRecords || [])) {
        let recordItems: QItem[] = []
        try {
          const parsed = JSON.parse(record.content)
          if (Array.isArray(parsed)) recordItems = parsed
        } catch {
          const lines = (record.content || '').split('\n').filter((s: string) => s.trim())
          recordItems = lines.map((text: string) => ({ text, answered: false, answer: '' }))
        }
        let changed = false
        const updated = recordItems.map(item => {
          if (!item.answered && item.text.trim() && answeredTexts.has(item.text.trim())) {
            changed = true
            return { ...item, answered: true }
          }
          return item
        })
        if (changed) {
          const nowAllAnswered = updated.every(it => it.answered)
          await supabase.from('client_questions').update({
            content: JSON.stringify(updated),
            status: nowAllAnswered ? '回答済' : '未回答',
            answered_date: nowAllAnswered ? new Date().toISOString().split('T')[0] : null,
          }).eq('id', record.id)
        }
      }
    }

    setSaving(false)
    await load()
  }

  async function importPrevUnanswered() {
    if (!form.client_code && !form.client_id) { alert('顧客が設定されていません'); return }
    setImporting(true)
    const supabase = createClient()

    let query = supabase
      .from('client_questions')
      .select('id, work_date, question_date, content')
      .neq('id', id)
      .order('work_date', { ascending: false })
      .limit(24)

    if (form.client_code) query = query.eq('client_code', form.client_code)
    else query = query.eq('client_id', form.client_id as string)

    // 処理月が設定されていれば、それより前のレコードのみ対象
    const currentWorkDate = buildWorkDate()
    if (currentWorkDate) query = query.lt('work_date', currentWorkDate)

    const { data } = await query

    const existingTexts = new Set(items.map(it => it.text.trim()).filter(Boolean))
    const importedItems: QItem[] = []

    for (const record of (data || [])) {
      const recordItems = parseItems(record.content)
      for (const item of recordItems) {
        if (!item.answered && item.text.trim() && !existingTexts.has(item.text.trim())) {
          importedItems.push({ text: item.text, answered: false, answer: '' })
          existingTexts.add(item.text.trim())
        }
      }
    }

    setImporting(false)

    if (importedItems.length === 0) {
      alert('前月以前に未回答の質問はありません（または重複）')
      return
    }

    // 空のプレースホルダーを除去してから追加
    const currentNonEmpty = items.filter(it => it.text.trim())
    setItems([...currentNonEmpty, ...importedItems])
    alert(`${importedItems.length}件の未回答質問を取り込みました`)
  }

  function handlePrint() {
    const clientName = form.client_name || ''
    const questionDate = form.question_date || ''
    const questioner = form.questioner || ''
    const category = form.category || ''
    const processMonth = workYear && workMonth ? `${workYear}年${workMonth}月` : ''

    const itemRows = items
      .filter(it => it.text.trim())
      .map(it => {
        const box = it.answered ? '☑' : '☐'
        const escapedText = it.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        const answerHtml = it.answer
          ? `<div style="margin-left:24px;margin-top:4px;font-size:11px;color:#555">→ ${it.answer.replace(/\n/g, '<br>')}</div>`
          : ''
        return `<div style="margin-bottom:18px;page-break-inside:avoid">
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="font-size:15px;flex-shrink:0;line-height:1.4">${box}</span>
            <span style="font-size:12px;line-height:1.6">${escapedText}</span>
          </div>${answerHtml}
          <div style="margin-top:8px;margin-left:24px">
            <div style="border-bottom:1px solid #bbb;height:24px;margin-bottom:4px"></div>
            <div style="border-bottom:1px solid #bbb;height:24px"></div>
          </div>
        </div>`
      }).join('')

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>質問事項 ${clientName}</title>
<style>
body{font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;margin:20px;color:#333}
h1{font-size:15px;margin-bottom:4px}
.meta{font-size:11px;color:#666;margin-bottom:16px}
.section-title{font-size:11px;font-weight:bold;color:#444;margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid #eee}
@media print{@page{margin:15mm}}
</style></head><body>
<h1>質問事項　${clientName}</h1>
<div class="meta">
  処理月：${processMonth}　／　質問日：${questionDate}　／　質問者：${questioner}　／　区分：${category}
</div>
<div class="section-title">確認事項</div>
${itemRows}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  async function remove() {
    if (!confirm('削除しますか？')) return
    const supabase = createClient()
    await supabase.from('client_questions').delete().eq('id', id)
    router.push('/client-questions')
  }

  async function uploadFile(file: File) {
    setUploading(true)
    const supabase = createClient()
    // 日本語等の非ASCII文字はStorageのInvalid keyエラーになるためエンコードして除去
    const safeName = encodeURIComponent(file.name).replace(/%/g, '_')
    const path = `client-questions/${id}/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
    if (upErr) { alert('アップロードエラー: ' + upErr.message); setUploading(false); return }
    const { error: dbErr } = await supabase.from('client_question_attachments').insert({
      question_id: id, file_name: file.name, file_path: path, file_size: file.size,
    })
    if (dbErr) alert('エラー: ' + dbErr.message)
    setUploading(false)
    await load()
  }

  async function deleteAttachment(att: ClientQuestionAttachment) {
    if (!confirm(`"${att.file_name}" を削除しますか？`)) return
    const supabase = createClient()
    await supabase.storage.from('attachments').remove([att.file_path])
    await supabase.from('client_question_attachments').delete().eq('id', att.id)
    setAttachments(a => a.filter(x => x.id !== att.id))
  }

  async function downloadAttachment(att: ClientQuestionAttachment) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.file_path, 60)
    if (error || !data) { alert('ダウンロードエラー'); return }
    window.open(data.signedUrl, '_blank')
  }

  if (!question) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/client-questions" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
          <h1 className="text-2xl font-bold text-gray-800">質問事項</h1>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${allAnswered ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
            {allAnswered ? '回答済' : `未回答 ${unansweredItems.length}件`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            <Printer size={14} /> 印刷
          </button>
          <button onClick={remove} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700">
            <Trash2 size={14} /> 削除
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">質問日</label>
            <input type="date" className={ic} value={form.question_date || ''} onChange={e => setForm(f => ({ ...f, question_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">質問者</label>
            <input className={ic} value={form.questioner || ''} onChange={e => setForm(f => ({ ...f, questioner: e.target.value }))} />
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">区分</label>
            <select className={ic} value={form.category || ''} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">処理月</label>
            <div className="flex gap-2">
              <select className={ic} value={workYear} onChange={e => setWorkYear(e.target.value)}>
                <option value="">年</option>
                {YEARS.map(y => <option key={y} value={String(y)}>{y}年</option>)}
              </select>
              <select className={ic} value={workMonth} onChange={e => setWorkMonth(e.target.value)}>
                <option value="">月</option>
                {MONTHS.map(m => <option key={m} value={String(m)}>{m}月</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 質問内容＋回答 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-xs font-medium text-gray-500">質問内容・回答</label>
            <div className="flex gap-2">
              <button type="button" onClick={importPrevUnanswered} disabled={importing}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg disabled:opacity-50">
                {importing ? '取り込み中...' : '前月の未回答を取り込む'}
              </button>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg">
                <Plus size={12} /> 質問を追加
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className={`rounded-xl border p-3 transition ${item.answered ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-start gap-2 mb-2">
                  {/* チェックボックス */}
                  <button
                    type="button"
                    onClick={() => updateItem(i, { answered: !item.answered })}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                      item.answered ? 'bg-green-500 border-green-500 text-white' : 'border-gray-400 bg-white hover:border-green-400'
                    }`}
                    title={item.answered ? '未回答に戻す' : '回答済にする'}
                  >
                    {item.answered && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  {/* 質問テキスト */}
                  <textarea
                    className={`flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y ${
                      item.answered ? 'bg-white border-green-200 text-gray-600' : 'bg-white border-gray-300'
                    }`}
                    rows={2}
                    value={item.text}
                    onChange={e => updateItem(i, { text: e.target.value })}
                    placeholder={`質問事項 ${i + 1}`}
                  />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)}
                      className="mt-1 text-gray-300 hover:text-red-400 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {/* 回答欄 */}
                <div className="ml-7">
                  <textarea
                    className={`w-full border rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                      item.answered ? 'bg-white border-green-200' : 'bg-white border-gray-200'
                    }`}
                    rows={2}
                    value={item.answer}
                    onChange={e => updateItem(i, { answer: e.target.value })}
                    placeholder="回答内容を入力（任意）"
                  />
                </div>
              </div>
            ))}
          </div>
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
          <Link href="/client-questions" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">一覧に戻る</Link>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
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
