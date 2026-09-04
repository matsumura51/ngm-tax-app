'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { DailyReportDetail } from '@/lib/types'
import { ChevronLeft, Plus, Trash2, ChevronDown, Calendar } from 'lucide-react'
import Link from 'next/link'
import { Schedule } from '@/lib/types'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const TASK_TYPES = ['記帳', 'チェック', '決算', '来所', '訪問', '所内相談', '電話・メール', '給与計算', '環境整備', '朝礼', '確定申告', '年末調整', '相続税', '建設業', '医療法人', '社会保険', '税務調査', 'その他']

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

function emptyDetail(): Omit<DailyReportDetail, 'id' | 'report_id'> {
  return {
    sort_order: 0,
    start_time: '',
    end_time: '',
    work_time: '',
    task_type: '',
    client_code: '',
    client_name: '',
    task_code: '',
    task_name: '',
    report_type: '',
    report_content: '',
    details: '',
    subject: '',
  }
}

export default function DailyReportNewPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    total_hours: '',
  })
  const [details, setDetails] = useState([emptyDetail()])
  const [clients, setClients] = useState<{ code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ rowIndex: number; matches: { code: string; name: string }[]; top: number; left: number } | null>(null)
  const [daySchedules, setDaySchedules] = useState<Schedule[]>([])
  const [showScheduleImport, setShowScheduleImport] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
        setUserName(data?.name || user.email?.split('@')[0] || '')
      }
      const { data: clientsData } = await supabase.from('clients').select('code, name').order('code')
      setClients(clientsData || [])
    }
    loadUser()
  }, [])

  useEffect(() => {
    async function loadSchedules() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('schedules').select('*')
        .eq('user_id', user.id)
        .gte('start_datetime', form.date + 'T00:00:00')
        .lte('start_datetime', form.date + 'T23:59:59')
        .order('start_datetime')
      setDaySchedules(data || [])
      if ((data || []).length > 0) setShowScheduleImport(true)
    }
    if (form.date) loadSchedules()
  }, [form.date])

  function colorToTaskType(color: string | null): string {
    switch (color) {
      case '外出': return '訪問'
      case '来客（顧問先）': return '来所'
      case '来客（業者）': return '来所'
      case '所内ミーティング': return '所内相談'
      default: return ''
    }
  }

  function importSchedule(s: Schedule) {
    const startTime = new Date(s.start_datetime).toTimeString().slice(0, 5)
    const endTime = s.end_datetime ? new Date(s.end_datetime).toTimeString().slice(0, 5) : ''
    const newRow = {
      ...emptyDetail(),
      start_time: startTime,
      end_time: endTime,
      work_time: calcWorkTime(startTime, endTime),
      client_code: s.client_code || '',
      client_name: s.client_name || '',
      report_content: s.title || '',
      task_type: colorToTaskType(s.color),
    }
    setDetails(d => {
      const isEmpty = d.length === 1 && !d[0].start_time && !d[0].end_time && !d[0].task_type && !d[0].client_name && !d[0].report_content
      return isEmpty ? [newRow] : [...d, newRow]
    })
  }

  function addDetail() {
    setDetails(d => {
      const prevEndTime = d.length > 0 ? (d[d.length - 1].end_time ?? '') : ''
      return [...d, { ...emptyDetail(), start_time: prevEndTime }]
    })
  }

  function removeDetail(i: number) {
    setDetails(d => d.filter((_, idx) => idx !== i))
  }

  useEffect(() => {
    setForm(f => ({ ...f, total_hours: sumWorkTimes(details) }))
  }, [details])

  function selectClient(i: number, code: string, name: string) {
    setDetails(d => d.map((row, idx) => idx === i ? { ...row, client_code: code, client_name: name } : row))
    setSuggestions(null)
  }

  function onClientCodeChange(i: number, code: string) {
    const found = clients.find(c => c.code === code)
    if (found) {
      setDetails(d => d.map((row, idx) => idx === i ? { ...row, client_code: code, client_name: found.name } : row))
    } else {
      setDetail(i, 'client_code', code)
    }
  }

  function onClientNameChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setDetail(i, 'client_name', text)
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

  function setDetail(i: number, field: string, value: string) {
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

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('ログインが必要です'); setSaving(false); return }

    const { data: report, error } = await supabase.from('daily_reports').insert({
      user_id: user.id,
      user_name: userName,
      date: form.date,
      total_hours: form.total_hours || null,
      unread_check: '未チェック',
    }).select().single()

    if (error) { alert('エラー: ' + error.message); setSaving(false); return }

    const detailRows = details
      .filter(d => d.task_type || d.client_code || d.client_name || d.report_content || d.start_time || d.end_time)
      .map((d, i) => ({ ...d, report_id: report.id, sort_order: i }))

    if (detailRows.length > 0) {
      await supabase.from('daily_report_details').insert(detailRows)
    }

    router.push('/daily-reports')
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/daily-reports" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">日報 新規作成</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日付</label>
            <input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">氏名</label>
            <input className={inputClass} value={userName} onChange={e => setUserName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">合計時間</label>
            <input className={inputClass + ' bg-gray-50 text-gray-600'} value={form.total_hours} readOnly tabIndex={-1} placeholder="自動計算" />
          </div>
        </div>
      </div>

      {/* スケジュール取込パネル */}
      {daySchedules.length > 0 && (
        <div className="mb-4 border border-blue-100 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowScheduleImport(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition"
          >
            <span className="flex items-center gap-2">
              <Calendar size={14} />
              この日のスケジュールから取込（{daySchedules.length}件）
            </span>
            <ChevronDown size={14} className={`transition-transform ${showScheduleImport ? 'rotate-180' : ''}`} />
          </button>
          {showScheduleImport && (
            <div className="p-3 space-y-1.5 bg-white">
              {daySchedules.map(s => {
                const start = new Date(s.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                const end = s.end_datetime ? new Date(s.end_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-400 shrink-0">{start}{end ? ` - ${end}` : ''}</span>
                      {s.client_name && <span className="ml-2 font-medium text-gray-700">{s.client_name}：</span>}
                      <span className="text-gray-600">{s.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => importSchedule(s)}
                      className="shrink-0 px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-medium transition"
                    >
                      取込
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-6 mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-700">業務明細</h2>
          <button onClick={addDetail} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
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
                <th className="px-2 py-2 text-left w-52">処理期間</th>
                <th className="px-2 py-2 text-left w-24">顧客コード</th>
                <th className="px-2 py-2 text-left w-36">顧客名</th>
                <th className="px-2 py-2 text-left">作業内容</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {details.map((d, i) => (
                <tr key={i}>
                  <td className="px-1 py-1">
                    <input type="time" className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.start_time || ''} onChange={e => setDetail(i, 'start_time', e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="time" className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.end_time || ''} onChange={e => setDetail(i, 'end_time', e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="w-full border border-gray-100 rounded px-1 py-1 text-xs bg-gray-50 text-gray-600 text-center" value={d.work_time || ''} readOnly tabIndex={-1} placeholder="自動" />
                  </td>
                  <td className="px-1 py-1">
                    <select className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.task_type || ''} onChange={e => setDetail(i, 'task_type', e.target.value)}>
                      <option value="">選択</option>
                      {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <input type="month" className="border border-gray-200 rounded px-1 py-1 text-xs w-[88px]" value={d.subject || ''} onChange={e => setDetail(i, 'subject', e.target.value)} />
                      <span className="text-gray-400 text-xs shrink-0">～</span>
                      <input type="month" className="border border-gray-200 rounded px-1 py-1 text-xs w-[88px]" value={d.details || ''} onChange={e => setDetail(i, 'details', e.target.value)} />
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    <input className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.client_code || ''}
                      onChange={e => onClientCodeChange(i, e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="w-full border border-gray-200 rounded px-1 py-1 text-xs" value={d.client_name || ''}
                      onChange={e => onClientNameChange(i, e)}
                      onBlur={() => setTimeout(() => setSuggestions(null), 150)} />
                  </td>
                  <td className="px-1 py-1">
                    <textarea rows={2} className="w-full border border-gray-200 rounded px-1 py-1 text-xs resize-y" value={d.report_content || ''} onChange={e => setDetail(i, 'report_content', e.target.value)} />
                  </td>
                  <td className="px-1 py-1">
                    {details.length > 1 && (
                      <button onClick={() => removeDetail(i)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/daily-reports" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
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
