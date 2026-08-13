'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase'
import { DailyReport, DailyReportDetail } from '@/lib/types'
import { ChevronLeft, Trash2, Plus } from 'lucide-react'
import Link from 'next/link'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const TASK_TYPES = ['記帳', '決算', '確定申告', '相続税', '年末調整', '給与計算', '社会保険', '建設業', '医療法人', '訪問', '来所', '所内相談', 'チェック', '税務調査', '電話・メール', '環境整備', '朝礼', 'その他']

function calcWorkTime(start: string, end: string): string {
  if (!start || !end) return ''
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff <= 0) return ''
  return `${Math.floor(diff / 60)}:${(diff % 60).toString().padStart(2, '0')}`
}

function sumWorkTimes(rows: { work_time: string | null | undefined }[]): string {
  let total = 0
  for (const r of rows) {
    const parts = (r.work_time || '').split(':')
    if (parts.length === 2) {
      const h = parseInt(parts[0]), m = parseInt(parts[1])
      if (!isNaN(h) && !isNaN(m)) total += h * 60 + m
    }
  }
  if (total === 0) return ''
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

export default function DailyReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [report, setReport] = useState<DailyReport | null>(null)
  const [details, setDetails] = useState<DailyReportDetail[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<DailyReport>>({})
  const [clients, setClients] = useState<{ code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ rowIndex: number; matches: { code: string; name: string }[]; top: number; left: number } | null>(null)

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const [{ data: r }, { data: d }, { data: clientsData }] = await Promise.all([
      supabase.from('daily_reports').select('*').eq('id', id).single(),
      supabase.from('daily_report_details').select('*').eq('report_id', id).order('sort_order'),
      supabase.from('clients').select('code, name').order('code'),
    ])
    if (r) { setReport(r); setForm(r) }
    setDetails(d || [])
    setClients(clientsData || [])
  }

  async function deleteReport() {
    if (!confirm('この日報を削除しますか？')) return
    const res = await fetch('/api/daily-reports/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const json = await res.json()
      alert('削除エラー: ' + (json.error || '不明なエラー'))
      return
    }
    window.location.href = '/daily-reports'
  }

  function selectClient(i: number, code: string, name: string) {
    setDetails(d => d.map((row, idx) => idx === i ? { ...row, client_code: code, client_name: name } : row))
    setSuggestions(null)
  }

  function onClientCodeChange(i: number, code: string) {
    const found = clients.find(c => c.code === code)
    if (found) {
      setDetails(d => d.map((row, idx) => idx === i ? { ...row, client_code: code, client_name: found.name } : row))
    } else {
      setRow(i, 'client_code', code)
    }
  }

  function onClientNameChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setRow(i, 'client_name', text)
    if (text.length >= 1) {
      const matches = clients.filter(c => c.name.includes(text)).slice(0, 8)
      if (matches.length > 0) {
        const rect = e.target.getBoundingClientRect()
        setSuggestions({ rowIndex: i, matches, top: rect.bottom + 2, left: rect.left })
      } else {
        setSuggestions(null)
      }
    } else {
      setSuggestions(null)
    }
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('daily_reports').update({
      date: form.date,
      user_name: form.user_name,
      important_report: form.important_report,
      performance_activity: form.performance_activity,
      total_hours: form.total_hours,
      manager_comment: form.manager_comment,
      unread_check: form.unread_check,
    }).eq('id', id)

    await supabase.from('daily_report_details').delete().eq('report_id', id)
    const rows = details
      .filter(d => d.task_type || d.client_code || d.client_name || d.report_content || d.start_time || d.end_time)
      .map((d, i) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...rest } = d
        return { ...rest, report_id: id, sort_order: i }
      })
    if (rows.length > 0) {
      const { error } = await supabase.from('daily_report_details').insert(rows)
      if (error) { alert('明細の保存エラー: ' + error.message); setSaving(false); return }
    }

    setSaving(false)
    await load()
  }

  function addRow() {
    setDetails(d => [...d, {
      id: '', report_id: id, sort_order: d.length,
      start_time: null, end_time: null, work_time: null,
      task_type: null, client_code: null, client_name: null,
      task_code: null, task_name: null, report_type: null,
      report_content: null, details: null, subject: null,
    }])
  }

  useEffect(() => {
    if (details.length > 0) {
      setForm(f => ({ ...f, total_hours: sumWorkTimes(details) }))
    }
  }, [details])

  function setRow(i: number, field: string, value: string) {
    setDetails(d => d.map((row, idx) => {
      if (idx !== i) return row
      const updated = { ...row, [field]: value }
      if (field === 'start_time' || field === 'end_time') {
        const start = field === 'start_time' ? value : (row.start_time || '')
        const end = field === 'end_time' ? value : (row.end_time || '')
        updated.work_time = calcWorkTime(start, end)
      }
      return updated
    }))
  }

  if (!report) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/daily-reports" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">日報</h1>
        {report.unread_check === '未チェック' && (
          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">未読</span>
        )}
        <button onClick={deleteReport}
          className="ml-auto flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg">
          <Trash2 size={14} /> 削除
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日付</label>
            <input type="date" className={inputClass} value={form.date || ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">氏名</label>
            <input className={inputClass} value={form.user_name || ''} onChange={e => setForm(f => ({ ...f, user_name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">合計時間</label>
            <input className={inputClass + ' bg-gray-50 text-gray-600'} value={form.total_hours || ''} readOnly tabIndex={-1} placeholder="自動計算" />
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">所長コメント</label>
          <textarea className={inputClass + ' resize-none'} rows={2} value={form.manager_comment || ''} onChange={e => setForm(f => ({ ...f, manager_comment: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">チェック状態</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.unread_check || '未チェック'} onChange={e => setForm(f => ({ ...f, unread_check: e.target.value }))}>
            <option value="未チェック">未チェック</option>
            <option value="チェック済">チェック済</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-700">業務明細</h2>
          <button onClick={addRow} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
            <Plus size={14} /> 行を追加
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-2 py-2 text-left w-20">開始</th>
                <th className="px-2 py-2 text-left w-20">終了</th>
                <th className="px-2 py-2 text-left w-20">時間</th>
                <th className="px-2 py-2 text-left w-28">業務区分</th>
                <th className="px-2 py-2 text-left w-24">顧客コード</th>
                <th className="px-2 py-2 text-left w-36">顧客名</th>
                <th className="px-2 py-2 text-left">作業内容</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {details.map((d, i) => (
                <tr key={i}>
                  <td className="px-1 py-1"><input type="time" className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.start_time || ''} onChange={e => setRow(i, 'start_time', e.target.value)} /></td>
                  <td className="px-1 py-1"><input type="time" className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.end_time || ''} onChange={e => setRow(i, 'end_time', e.target.value)} /></td>
                  <td className="px-1 py-1"><input className="w-full border border-gray-100 rounded px-1 py-1 text-xs bg-gray-50 text-gray-600 text-center" value={d.work_time || ''} readOnly tabIndex={-1} placeholder="自動" /></td>
                  <td className="px-1 py-1">
                    <select className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.task_type || ''} onChange={e => setRow(i, 'task_type', e.target.value)}>
                      <option value="">選択</option>
                      {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1"><input className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.client_code || ''} onChange={e => onClientCodeChange(i, e.target.value)} /></td>
                  <td className="px-1 py-1"><input className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.client_name || ''} onChange={e => onClientNameChange(i, e)} onBlur={() => setTimeout(() => setSuggestions(null), 150)} /></td>
                  <td className="px-1 py-1"><input className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.report_content || ''} onChange={e => setRow(i, 'report_content', e.target.value)} /></td>
                  <td className="px-1 py-1">
                    <button onClick={() => setDetails(d => d.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/daily-reports" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          戻る
        </Link>
        <button onClick={save} disabled={saving} className="px-6 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50">
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {suggestions && (
        <div style={{ position: 'fixed', top: suggestions.top, left: suggestions.left, minWidth: '220px', zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.matches.map(c => (
            <button key={c.code} type="button"
              onMouseDown={() => selectClient(suggestions.rowIndex, c.code, c.name)}
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
