'use client'

import { useEffect, useState, use, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Client, MonthlyProgress, Schedule, Director, ClientDocument, ClientCheck, ClientQuestion } from '@/lib/types'
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertCircle, HelpCircle, Download } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import PaymentReportTab from './PaymentReportTab'
import WithholdingTaxTab from './WithholdingTaxTab'

const WITHHOLDING_TAX_OPTIONS = ['納特', '毎月', '不要']
const CONTRACT_STATUS_OPTIONS = ['契約中', '契約終了', '見込み', '休止']
const ENTITY_TYPE_OPTIONS = ['法人', '個人']
const YES_NO_OPTIONS = ['有', '無']
const BLUE_WHITE_OPTIONS = ['青色', '白色']
const PROGRESS_ROWS = [
  { key: 'monthly_contact', label: '連絡' },
  { key: 'monthly_material', label: '資料' },
  { key: 'monthly_input', label: '入力' },
  { key: 'monthly_completion', label: '完了' },
  { key: 'monthly_report', label: '報告' },
]

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const TASK_TYPES = ['記帳', 'チェック', '決算', '来所', '訪問', '所内相談', '電話・メール', '給与計算', '環境整備', '朝礼', '確定申告', '年末調整', '相続税', '建設業', '医療法人', '社会保険', '税務調査', 'その他']

type Tab = '基本情報' | '月次進捗' | '業務ログ' | '指摘事項' | '質問事項' | '支払調書' | '源泉集計'

type WorkLog = {
  id: string
  report_id: string
  date: string
  user_name: string
  start_time: string | null
  end_time: string | null
  work_time: string | null
  task_type: string | null
  report_content: string | null
}

const checkStatusStyle: Record<string, string> = {
  '未訂正': 'bg-red-100 text-red-700',
  '訂正済': 'bg-green-100 text-green-700',
  '確認中': 'bg-yellow-100 text-yellow-700',
}
const questionStatusStyle: Record<string, string> = {
  '未回答': 'bg-orange-100 text-orange-700',
  '回答済': 'bg-blue-100 text-blue-700',
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [form, setForm] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('基本情報')
  const [progressYear, setProgressYear] = useState(new Date().getFullYear())
  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [clientChecks, setClientChecks] = useState<ClientCheck[]>([])
  const [clientQuestions, setClientQuestions] = useState<ClientQuestion[]>([])
  const [exportModal, setExportModal] = useState<null | 'checks' | 'questions'>(null)
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [checklistText, setChecklistText] = useState<string | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [showChecklist, setShowChecklist] = useState(false)
  const [logDetailReportId, setLogDetailReportId] = useState<string | null>(null)
  const [addLogOpen, setAddLogOpen] = useState(false)
  const [addLogForm, setAddLogForm] = useState({ date: new Date().toISOString().split('T')[0], user_name: '', task_type: '記帳', start_time: '', end_time: '', work_time: '', report_content: '' })
  const [addLogSaving, setAddLogSaving] = useState(false)
  const [logUsers, setLogUsers] = useState<{ id: string; name: string }[]>([])

  useEffect(() => { loadClient() }, [id])
  useEffect(() => { if (tab === '月次進捗' && client) loadProgress() }, [tab, progressYear, client])
  useEffect(() => { if (tab === '業務ログ' && client) loadWorkLogs() }, [tab, client])
  useEffect(() => { if (tab === '指摘事項' && client) loadChecks() }, [tab, client])
  useEffect(() => { if (tab === '質問事項' && client) loadQuestions() }, [tab, client])

  async function loadClient() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').eq('id', id).single()
    if (data) {
      setClient(data)
      setForm({ ...data, directors: data.directors || [], documents: data.documents || [] })
      setIsDirty(false)
    }
  }

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  async function loadProgress() {
    const supabase = createClient()
    const { data } = await supabase.from('monthly_progress').select('*').eq('client_code', client!.code).eq('year', progressYear).maybeSingle()
    setProgress(data)
  }

  async function loadSchedules() {
    const supabase = createClient()
    const { data } = await supabase.from('schedules').select('*').eq('client_id', id).order('start_datetime').limit(30)
    setSchedules(data || [])
  }

  async function loadWorkLogs() {
    const supabase = createClient()
    const { data: details } = await supabase
      .from('daily_report_details')
      .select('id, report_id, start_time, end_time, work_time, task_type, report_content')
      .eq('client_code', client!.code)
      .limit(200)
    if (!details || details.length === 0) { setWorkLogs([]); return }
    const reportIds = [...new Set(details.map(d => d.report_id))]
    const { data: reports } = await supabase
      .from('daily_reports').select('id, date, user_name').in('id', reportIds)
    const rmap: Record<string, { date: string; user_name: string }> = {}
    for (const r of (reports || [])) rmap[r.id] = { date: r.date, user_name: r.user_name }
    const logs = details
      .map(d => ({ ...d, date: rmap[d.report_id]?.date || '', user_name: rmap[d.report_id]?.user_name || '' }))
      .filter(d => d.date)
      .sort((a, b) => b.date.localeCompare(a.date))
    setWorkLogs(logs)
  }

  async function openAddLog() {
    const supabase = createClient()
    const { data: us } = await supabase.from('users').select('id, name').order('name')
    setLogUsers(us || [])
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: u } = await supabase.from('users').select('name').eq('id', user.id).single()
      setAddLogForm(f => ({ ...f, user_name: u?.name || '' }))
    }
    setAddLogOpen(true)
  }

  function calcWorkTimeLocal(start: string, end: string): string {
    if (!start || !end) return ''
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff <= 0) return ''
    return `${Math.floor(diff / 60)}:${String(diff % 60).padStart(2, '0')}`
  }

  async function saveAddLog() {
    if (!client) return
    if (!addLogForm.date || !addLogForm.user_name) { alert('日付と担当者を入力してください'); return }
    setAddLogSaving(true)
    const supabase = createClient()
    // 担当者のuser_idを取得
    const { data: userRow } = await supabase.from('users').select('id').eq('name', addLogForm.user_name).single()
    const userId = userRow?.id || null
    // その日の日報を検索、なければ作成
    const { data: existingReport } = await supabase
      .from('daily_reports').select('id').eq('date', addLogForm.date).eq('user_name', addLogForm.user_name).maybeSingle()
    let reportId = existingReport?.id
    if (!reportId) {
      const { data: newReport, error: rErr } = await supabase
        .from('daily_reports')
        .insert({ date: addLogForm.date, user_name: addLogForm.user_name, user_id: userId, unread_check: '未読' })
        .select('id').single()
      if (rErr || !newReport) { alert('日報作成エラー: ' + rErr?.message); setAddLogSaving(false); return }
      reportId = newReport.id
    }
    // 業務ログ明細を追加
    const work_time = addLogForm.work_time || calcWorkTimeLocal(addLogForm.start_time, addLogForm.end_time)
    const { error } = await supabase.from('daily_report_details').insert({
      report_id: reportId,
      sort_order: 0,
      start_time: addLogForm.start_time || null,
      end_time: addLogForm.end_time || null,
      work_time: work_time || null,
      task_type: addLogForm.task_type || null,
      client_code: client.code,
      client_name: client.name,
      report_content: addLogForm.report_content || null,
    })
    if (error) { alert('保存エラー: ' + error.message); setAddLogSaving(false); return }
    setAddLogSaving(false)
    setAddLogOpen(false)
    setAddLogForm({ date: new Date().toISOString().split('T')[0], user_name: '', task_type: '記帳', start_time: '', end_time: '', work_time: '', report_content: '' })
    await loadWorkLogs()
  }

  async function loadChecks() {
    const supabase = createClient()
    const { data } = await supabase.from('client_checks').select('*').eq('client_id', id).order('check_date', { ascending: false }).limit(50)
    setClientChecks(data || [])
  }

  async function loadQuestions() {
    const supabase = createClient()
    const { data } = await supabase.from('client_questions').select('*').eq('client_id', id).order('question_date', { ascending: false }).limit(50)
    setClientQuestions(data || [])
  }

  function doExport() {
    const today = new Date().toISOString().slice(0, 10)
    const inRange = (date: string) => {
      if (exportFrom && date < exportFrom) return false
      if (exportTo && date > exportTo) return false
      return true
    }
    const periodLabel = exportFrom || exportTo
      ? `_${exportFrom || ''}〜${exportTo || ''}`
      : ''

    if (exportModal === 'checks') {
      const rows = clientChecks.filter(c => inRange(c.check_date)).map(c => ({
        '指摘日': c.check_date,
        '顧客名': c.client_name,
        '区分': c.category || '',
        '確認者': c.checker || '',
        '指摘内容': c.content,
        '状況': c.status,
        '訂正日': c.corrected_date || '',
        '訂正メモ': c.correction_note || '',
      }))
      if (rows.length === 0) { alert('該当するデータがありません'); return }
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [10, 20, 8, 10, 40, 8, 10, 30].map(w => ({ wch: w }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '指摘事項')
      XLSX.writeFile(wb, `${client!.name}_指摘事項${periodLabel}_${today}.xlsx`)
    } else {
      const rows = clientQuestions.filter(q => inRange(q.question_date)).map(q => ({
        '質問日': q.question_date,
        '顧客名': q.client_name,
        '区分': q.category || '',
        '質問者': q.questioner || '',
        '質問内容': q.content,
        '状況': q.status,
        '回答日': q.answered_date || '',
        '回答内容': q.answer || '',
      }))
      if (rows.length === 0) { alert('該当するデータがありません'); return }
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [10, 20, 8, 10, 40, 8, 10, 40].map(w => ({ wch: w }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '質問事項')
      XLSX.writeFile(wb, `${client!.name}_質問事項${periodLabel}_${today}.xlsx`)
    }
    setExportModal(null)
  }

  async function generateChecklist() {
    setChecklistLoading(true)
    setChecklistError(null)
    setShowChecklist(true)
    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id }),
      })
      const data = await res.json()
      if (!res.ok) { setChecklistError(data.error || 'エラーが発生しました'); return }
      setChecklistText(data.checklist)
    } catch {
      setChecklistError('通信エラーが発生しました')
    } finally {
      setChecklistLoading(false)
    }
  }

  const REQUIRED_FIELDS: { key: keyof typeof form; label: string }[] = [
    { key: 'code', label: '顧客コード' },
    { key: 'name', label: '顧客名' },
    { key: 'entity_type', label: '法・個区分' },
    { key: 'fiscal_month', label: '決算月' },
    { key: 'contract_status', label: '契約ステータス' },
    { key: 'withholding_tax', label: '源泉税' },
    { key: 'year_end_adjustment', label: '年調有無' },
    { key: 'notification_send', label: '申告のお知らせ送付' },
    { key: 'jumin_tax', label: '住民税' },
    { key: 'primary_staff', label: '主担当' },
  ]

  function getValidationErrors(): { key: string; label: string }[] {
    return REQUIRED_FIELDS.filter(f => !form[f.key] && form[f.key] !== 0)
  }

  async function save() {
    const missing = getValidationErrors()
    if (missing.length > 0) {
      setErrorFields(new Set(missing.map(f => f.key)))
      alert(`以下の必須項目を入力してください：\n・${missing.map(f => f.label).join('\n・')}`)
      return
    }
    setErrorFields(new Set())
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update(form).eq('id', id)
    if (error) alert('保存エラー: ' + error.message)
    else { setSaved(true); setIsDirty(false); setTimeout(() => setSaved(false), 2000); await loadClient() }
    setSaving(false)
  }

  async function updateCell(field: string, month: number, value: string | null) {
    const supabase = createClient()
    if (!progress) {
      const newRec = {
        client_id: client!.id, client_code: client!.code, client_name: client!.name,
        year: progressYear, fiscal_month: client!.fiscal_month, industry: client!.industry,
        consumption_tax: client!.consumption_tax, withholding_tax: client!.withholding_tax,
        invoice_registered: client!.invoice_registered,
        primary_staff: client!.primary_staff, sub_staff: client!.sub_staff, manager: client!.manager,
        [field]: { [String(month)]: value },
      }
      const { data } = await supabase.from('monthly_progress').insert(newRec).select().single()
      setProgress(data)
    } else {
      const current = (progress[field as keyof MonthlyProgress] as Record<string, string | null>) || {}
      const updated = { ...current, [String(month)]: value }
      await supabase.from('monthly_progress').update({ [field]: updated }).eq('id', progress.id)
      setProgress({ ...progress, [field]: updated } as MonthlyProgress)
    }
  }

  function set(field: keyof Client, value: string | boolean | number | null | Director[] | ClientDocument[]) {
    setForm(f => ({ ...f, [field]: value }))
    setIsDirty(true)
    if (errorFields.has(field as string)) {
      setErrorFields(prev => { const n = new Set(prev); n.delete(field as string); return n })
    }
  }

  function setDirector(index: number, key: keyof Director, value: string) {
    const dirs = [...(form.directors || [])]
    dirs[index] = { ...dirs[index], [key]: value }
    set('directors', dirs)
  }

  function addDirector() {
    set('directors', [...(form.directors || []), { role: '', name: '' }])
  }

  function removeDirector(index: number) {
    set('directors', (form.directors || []).filter((_, i) => i !== index))
  }

  function setDocument(index: number, key: keyof ClientDocument, value: string) {
    const docs = [...(form.documents || [])]
    docs[index] = { ...docs[index], [key]: value }
    set('documents', docs)
  }

  function addDocument() {
    set('documents', [...(form.documents || []), { date: '', document_name: '' }])
  }

  function removeDocument(index: number) {
    set('documents', (form.documents || []).filter((_, i) => i !== index))
  }

  if (!client) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6">
      {isDirty && !saving && (
        <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-4 bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between shadow">
          <span className="text-sm font-medium">⚠ 保存していない変更があります</span>
          <button onClick={save}
            className="text-sm font-bold bg-white text-amber-600 px-4 py-1 rounded-lg hover:bg-amber-50 transition">
            今すぐ保存
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <div className="flex items-center gap-3 flex-1">
          <div>
            <div className="text-sm text-gray-500 font-mono">{client.code}</div>
            <h1 className="text-2xl font-bold text-gray-800">{client.name}</h1>
          </div>
          {client.entity_type && (
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">{client.entity_type}</span>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['基本情報', '月次進捗', '業務ログ', '指摘事項', '質問事項', '支払調書', '源泉集計'] as Tab[]).map(t => (
          <button key={t} onClick={() => {
            if (isDirty && tab === '基本情報' && t !== '基本情報') {
              if (!confirm('基本情報が保存されていません。このまま移動しますか？')) return
              setIsDirty(false)
            }
            setTab(t)
          }}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === '基本情報' && (
        <div className="max-w-4xl space-y-6">
          {/* 顧客情報 */}
          <Section title="顧客情報">
            <div className="mb-4 flex flex-wrap gap-5">
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={!!form.show_in_monthly}
                  onChange={e => set('show_in_monthly', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm font-medium text-blue-700">月次進捗表に表示する</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={!!form.include_year_end_adj}
                  onChange={e => set('include_year_end_adj', e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-600"
                />
                <span className="text-sm font-medium text-amber-700">年末調整 対象</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={!!form.include_withholding_semi}
                  onChange={e => set('include_withholding_semi', e.target.checked)}
                  className="w-4 h-4 rounded accent-teal-600"
                />
                <span className="text-sm font-medium text-teal-700">源泉納期の特例（7月） 対象</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={!!form.include_tax_return}
                  onChange={e => set('include_tax_return', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm font-medium text-blue-700">確定申告 対象</span>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <F label="顧客コード" required hasError={errorFields.has('code')}>
                <input className={ic} value={form.code || ''} onChange={e => set('code', e.target.value)} />
              </F>
              <F label="顧客名" cn="col-span-2" required hasError={errorFields.has('name')}>
                <input className={ic} value={form.name || ''} onChange={e => set('name', e.target.value)} />
              </F>
              <F label="法・個区分" required hasError={errorFields.has('entity_type')}>
                <select className={ic} value={form.entity_type || ''} onChange={e => set('entity_type', e.target.value)}>
                  <option value="">選択</option>
                  {ENTITY_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>

              <F label="決算月" required hasError={errorFields.has('fiscal_month')}>
                <select className={ic} value={form.fiscal_month?.toString() || ''} onChange={e => set('fiscal_month', e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">選択</option>
                  <option value="0">個人</option>
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
                </select>
              </F>
              <F label="契約ステータス" required hasError={errorFields.has('contract_status')}>
                <select className={ic} value={form.contract_status || ''} onChange={e => set('contract_status', e.target.value)}>
                  <option value="">選択</option>
                  {CONTRACT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>

              <F label="契約開始日" cn="col-span-2">
                <input type="date" className={ic} value={form.contract_start_date || ''} onChange={e => set('contract_start_date', e.target.value || null)} />
              </F>
              <F label="契約終了日" cn="col-span-2">
                <input type="date" className={ic} value={form.contract_end_date || ''} onChange={e => set('contract_end_date', e.target.value || null)} />
              </F>

              <F label="源泉税" required hasError={errorFields.has('withholding_tax')}>
                <select className={ic} value={form.withholding_tax || ''} onChange={e => set('withholding_tax', e.target.value)}>
                  <option value="">選択</option>
                  {WITHHOLDING_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="消費税">
                <select className={ic} value={form.consumption_tax || ''} onChange={e => set('consumption_tax', e.target.value)}>
                  <option value="">選択</option>
                  {['免税', '本則', '簡易', '2割特例'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="年調有無" required hasError={errorFields.has('year_end_adjustment')}>
                <select className={ic} value={form.year_end_adjustment || ''} onChange={e => set('year_end_adjustment', e.target.value)}>
                  <option value="">選択</option>
                  {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="申告のお知らせ送付" required hasError={errorFields.has('notification_send')}>
                <select className={ic} value={form.notification_send || ''} onChange={e => set('notification_send', e.target.value)}>
                  <option value="">選択</option>
                  {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="住民税" required hasError={errorFields.has('jumin_tax')}>
                <select className={ic} value={form.jumin_tax || ''} onChange={e => set('jumin_tax', e.target.value)}>
                  <option value="">選択</option>
                  <option value="毎月（納付書）">毎月（納付書）</option>
                  <option value="毎月（ダイレクト）">毎月（ダイレクト）</option>
                  <option value="一括（ダイレクト）">一括（ダイレクト）</option>
                  <option value="普通徴収">普通徴収</option>
                  <option value="その他">その他</option>
                </select>
              </F>
            </div>
          </Section>

          {/* 代表者情報 */}
          <Section title="代表者情報">
            <div className="grid grid-cols-4 gap-4">
              <F label="代表者名" cn="col-span-2">
                <input className={ic} value={form.representative || ''} onChange={e => set('representative', e.target.value)} />
              </F>
              <F label="敬称">
                <input className={ic} value={form.honorific || ''} onChange={e => set('honorific', e.target.value)} placeholder="様" />
              </F>
              <F label="役職名">
                <input className={ic} value={form.representative_title || ''} onChange={e => set('representative_title', e.target.value)} placeholder="代表取締役" />
              </F>
              <F label="従業員数">
                <input type="number" className={ic} value={form.employee_count?.toString() || ''} onChange={e => set('employee_count', e.target.value ? parseInt(e.target.value) : null)} />
              </F>
              <F label="インボイス番号" cn="col-span-2">
                <input className={ic} value={form.invoice_number || ''} onChange={e => set('invoice_number', e.target.value)} placeholder="T1234567890123" />
              </F>
              <F label="部署名">
                <input className={ic} value={form.client_department || ''} onChange={e => set('client_department', e.target.value)} />
              </F>
              <F label="顧客担当者名" cn="col-span-2">
                <input className={ic} value={form.client_contact || ''} onChange={e => set('client_contact', e.target.value)} />
              </F>
              <F label="ホームページ" cn="col-span-4">
                <input className={ic} value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://" />
              </F>
            </div>
          </Section>

          {/* 連絡先 */}
          <Section title="連絡先">
            <div className="grid grid-cols-4 gap-4">
              <F label="郵便番号">
                <input className={ic} value={form.postal_code || ''} onChange={e => set('postal_code', e.target.value)} placeholder="000-0000" />
              </F>
              <F label="住所" cn="col-span-3">
                <input className={ic} value={form.address || ''} onChange={e => set('address', e.target.value)} />
              </F>
              <F label="TEL" cn="col-span-2">
                <input className={ic} value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="00-0000-0000" />
              </F>
              <F label="FAX" cn="col-span-2">
                <input className={ic} value={form.fax || ''} onChange={e => set('fax', e.target.value)} placeholder="00-0000-0000" />
              </F>
              <F label="メールアドレス" cn="col-span-4">
                <input type="email" className={ic} value={form.email || ''} onChange={e => set('email', e.target.value)} />
              </F>
            </div>
          </Section>

          {/* 送付先 */}
          <Section title="送付先">
            <div className="grid grid-cols-4 gap-4">
              <F label="送付先郵便番号">
                <input className={ic} value={form.send_postal_code || ''} onChange={e => set('send_postal_code', e.target.value)} placeholder="000-0000" />
              </F>
              <F label="送付先住所" cn="col-span-2">
                <input className={ic} value={form.send_address || ''} onChange={e => set('send_address', e.target.value)} />
              </F>
              <F label="送付先TEL">
                <input className={ic} value={form.send_tel || ''} onChange={e => set('send_tel', e.target.value)} />
              </F>
              <F label="送付先宛先" cn="col-span-4">
                <input className={ic} value={form.send_recipient || ''} onChange={e => set('send_recipient', e.target.value)} placeholder="株式会社〇〇 〇〇 様" />
              </F>
            </div>
          </Section>

          {/* その他 */}
          <Section title="その他">
            <div className="grid grid-cols-4 gap-4">
              <F label="資本金">
                <input type="number" className={ic} value={form.capital?.toString() || ''} onChange={e => set('capital', e.target.value ? parseInt(e.target.value) : null)} placeholder="5000000" />
              </F>
              <F label="管轄税務署名">
                <input className={ic} value={form.tax_office || ''} onChange={e => set('tax_office', e.target.value)} />
              </F>
              <F label="青白区分">
                <select className={ic} value={form.blue_white_type || ''} onChange={e => set('blue_white_type', e.target.value)}>
                  <option value="">選択</option>
                  {BLUE_WHITE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="役員変更">
                <input className={ic} value={form.director_changed || ''} onChange={e => set('director_changed', e.target.value)} />
              </F>
              <F label="連絡・注意事項" cn="col-span-4">
                <textarea className={ic + ' resize-none'} rows={3} value={form.contact_notes || ''} onChange={e => set('contact_notes', e.target.value)} />
              </F>
              <F label="備考" cn="col-span-4">
                <textarea className={ic + ' resize-none'} rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
              </F>
            </div>
          </Section>

          {/* 役員構成 */}
          <Section title="役員構成">
            <table className="w-full text-sm mb-3">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium w-1/3">役職</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">氏名</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(form.directors || []).map((d, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input className={ic} value={d.role} onChange={e => setDirector(i, 'role', e.target.value)} placeholder="代表取締役" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={ic} value={d.name} onChange={e => setDirector(i, 'name', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeDirector(i)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addDirector} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> 行を追加
            </button>
          </Section>

          {/* 書類 */}
          <Section title="書類">
            <table className="w-full text-sm mb-3">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium w-40">日付</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">書類名</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(form.documents || []).map((d, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input type="date" className={ic} value={d.date} onChange={e => setDocument(i, 'date', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={ic} value={d.document_name} onChange={e => setDocument(i, 'document_name', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeDocument(i)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addDocument} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> 行を追加
            </button>
          </Section>

          {/* 担当スタッフ */}
          <Section title="担当スタッフ">
            <div className="grid grid-cols-3 gap-4">
              <F label="主担当" required hasError={errorFields.has('primary_staff')}>
                <input className={ic} value={form.primary_staff || ''} onChange={e => set('primary_staff', e.target.value)} />
              </F>
              <F label="副担当">
                <input className={ic} value={form.sub_staff || ''} onChange={e => set('sub_staff', e.target.value)} />
              </F>
              <F label="所長/責任者">
                <input className={ic} value={form.manager || ''} onChange={e => set('manager', e.target.value)} />
              </F>
            </div>
          </Section>

          <div className="flex justify-end items-center gap-3 pb-6">
            {isDirty && !saving && (
              <span className="text-xs text-amber-600 font-medium">未保存の変更があります</span>
            )}
            <button onClick={save} disabled={saving}
              className={`px-8 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${isDirty && !saving ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {saved ? '保存しました ✓' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {tab === '月次進捗' && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setProgressYear(y => y - 1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
            <span className="font-bold text-lg">{progressYear}年</span>
            <button onClick={() => setProgressYear(y => y + 1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm w-16 sticky left-0 bg-gray-50">項目</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i + 1} className="border border-gray-200 px-1 py-2 text-center w-24">{i + 1}月</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROGRESS_ROWS.map(row => (
                  <tr key={row.key}>
                    <td className="border border-gray-200 px-3 py-1.5 font-medium bg-gray-50 whitespace-nowrap sticky left-0 text-sm">{row.label}</td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1
                      const data = progress?.[row.key as keyof MonthlyProgress] as Record<string, string | null> | undefined
                      const date = data?.[String(month)] || ''
                      return (
                        <td key={month} className="border border-gray-200 p-0">
                          <input type="date" value={date} onChange={e => updateCell(row.key, month, e.target.value || null)}
                            className="w-full text-xs px-1 py-1.5 border-none outline-none bg-transparent cursor-pointer text-center" />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === '業務ログ' && (
        <div className="bg-white rounded-xl shadow overflow-hidden max-w-4xl">
          <div className="flex justify-between items-center p-4 border-b">
            <span className="font-medium text-gray-700">業務ログ</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{workLogs.length}件</span>
              <button onClick={openAddLog}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
                <Plus size={12} /> 追加
              </button>
            </div>
          </div>
          {workLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-400">業務ログはありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">日付</th>
                    <th className="text-left px-4 py-2 font-medium">担当者</th>
                    <th className="text-left px-4 py-2 font-medium">業務区分</th>
                    <th className="text-left px-4 py-2 font-medium">時間</th>
                    <th className="text-left px-4 py-2 font-medium">作業内容</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-gray-700 text-xs">{log.date}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-600 text-xs">{log.user_name}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {log.task_type && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{log.task_type}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs font-mono">{log.work_time || ''}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs max-w-xs truncate">{log.report_content || ''}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button onClick={() => setLogDetailReportId(log.report_id)}
                          className="text-xs text-blue-500 hover:underline hover:text-blue-700">日報</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 業務ログ詳細モーダル */}
      {logDetailReportId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setLogDetailReportId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="font-bold text-gray-800">業務ログ詳細</h3>
                <p className="text-xs text-gray-500 mt-0.5">{client?.name} の作業のみ</p>
              </div>
              <button onClick={() => setLogDetailReportId(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto p-6">
              {workLogs.filter(l => l.report_id === logDetailReportId).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">該当する業務ログがありません</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                    <tr>
                      <th className="text-left px-3 py-2">日付</th>
                      <th className="text-left px-3 py-2">担当者</th>
                      <th className="text-left px-3 py-2">業務区分</th>
                      <th className="text-left px-3 py-2">時間</th>
                      <th className="text-left px-3 py-2">作業内容</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {workLogs.filter(l => l.report_id === logDetailReportId).map((log, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{log.date}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{log.user_name}</td>
                        <td className="px-3 py-2">
                          {log.task_type && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{log.task_type}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-gray-500">{log.work_time || ''}</td>
                        <td className="px-3 py-2 text-xs text-gray-600">{log.report_content || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 業務ログ追加モーダル */}
      {addLogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAddLogOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-gray-800">業務ログ 追加</h3>
              <button onClick={() => setAddLogOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">日付</label>
                  <input type="date" className={ic} value={addLogForm.date}
                    onChange={e => setAddLogForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">担当者</label>
                  {logUsers.length > 0 ? (
                    <select className={ic} value={addLogForm.user_name}
                      onChange={e => setAddLogForm(f => ({ ...f, user_name: e.target.value }))}>
                      <option value="">選択してください</option>
                      {logUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                  ) : (
                    <input className={ic} value={addLogForm.user_name}
                      onChange={e => setAddLogForm(f => ({ ...f, user_name: e.target.value }))} placeholder="担当者名" />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">業務区分</label>
                <select className={ic} value={addLogForm.task_type}
                  onChange={e => setAddLogForm(f => ({ ...f, task_type: e.target.value }))}>
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">開始時刻</label>
                  <input type="time" className={ic} value={addLogForm.start_time}
                    onChange={e => setAddLogForm(f => ({ ...f, start_time: e.target.value, work_time: calcWorkTimeLocal(e.target.value, f.end_time) }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">終了時刻</label>
                  <input type="time" className={ic} value={addLogForm.end_time}
                    onChange={e => setAddLogForm(f => ({ ...f, end_time: e.target.value, work_time: calcWorkTimeLocal(f.start_time, e.target.value) }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">業務時間</label>
                  <input className={ic} value={addLogForm.work_time} placeholder="例: 1:30"
                    onChange={e => setAddLogForm(f => ({ ...f, work_time: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">作業内容</label>
                <textarea className={ic} rows={3} value={addLogForm.report_content}
                  onChange={e => setAddLogForm(f => ({ ...f, report_content: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-5">
              <button onClick={() => setAddLogOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button onClick={saveAddLog} disabled={addLogSaving}
                className="px-6 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                {addLogSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === '指摘事項' && (
        <div className="space-y-4 max-w-4xl">

          {/* AIチェックリストパネル */}
          {showChecklist && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b bg-indigo-50">
                <span className="font-bold text-indigo-700 text-sm flex items-center gap-2">
                  ✨ AIチェックリスト（Gemini生成）
                </span>
                <div className="flex items-center gap-2">
                  {checklistText && (
                    <button
                      onClick={() => {
                        const w = window.open('', '_blank')
                        if (!w) return
                        w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${client.name} チェックリスト</title><style>body{font-family:'Hiragino Kaku Gothic Pro',Meiryo,sans-serif;padding:32px;max-width:800px;margin:0 auto;font-size:14px;line-height:1.8;color:#222}h1{font-size:18px;border-bottom:2px solid #4f46e5;padding-bottom:8px;margin-bottom:24px}h2{font-size:15px;margin-top:24px;margin-bottom:8px;color:#4f46e5}pre{white-space:pre-wrap;font-family:inherit}p.note{font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px}@media print{button{display:none}}</style></head><body><h1>${client.name}　指摘事項チェックリスト</h1><pre>${checklistText}</pre><p class="note">※ 生成日：${new Date().toLocaleDateString('ja-JP')}　Gemini AIにより生成（顧客名・担当者名は匿名化して送信）</p><script>window.onload=()=>window.print()<\/script></body></html>`)
                        w.document.close()
                      }}
                      className="flex items-center gap-1 text-xs border border-indigo-300 text-indigo-600 px-2.5 py-1 rounded hover:bg-indigo-50">
                      🖨 印刷
                    </button>
                  )}
                  <button onClick={() => setShowChecklist(false)}
                    className="text-xs text-gray-400 hover:text-gray-600">✕ 閉じる</button>
                </div>
              </div>
              <div className="p-5">
                {checklistLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full"></span>
                    Geminiが分析中です...
                  </div>
                ) : checklistError ? (
                  <div className="text-sm text-red-600 py-2">{checklistError}</div>
                ) : checklistText ? (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{checklistText}</div>
                ) : null}
                <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                  ※ 顧客名・担当者名は匿名化してGeminiに送信しています
                </p>
              </div>
            </div>
          )}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <AlertCircle size={16} className="text-red-500" /> 指摘事項一覧
            </div>
            <div className="flex items-center gap-2">
              {clientChecks.length > 0 && (
                <button onClick={generateChecklist}
                  className="flex items-center gap-1 text-sm border border-indigo-300 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50">
                  ✨ AIチェックリスト生成
                </button>
              )}
              {clientChecks.length > 0 && (
                <button onClick={() => { setExportFrom(''); setExportTo(''); setExportModal('checks') }}
                  className="flex items-center gap-1 text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  <Download size={14} /> Excel出力
                </button>
              )}
              <Link href={`/client-checks/new?client_id=${client.id}&client_code=${client.code}&client_name=${encodeURIComponent(client.name)}`}
                className="flex items-center gap-1 text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700">
                <Plus size={14} /> 新規追加
              </Link>
            </div>
          </div>
          {clientChecks.length === 0 ? (
            <div className="text-center py-10 text-gray-400">指摘事項はありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left w-28">指摘日</th>
                  <th className="px-4 py-3 text-left w-20">区分</th>
                  <th className="px-4 py-3 text-left w-20">確認者</th>
                  <th className="px-4 py-3 text-left">指摘内容</th>
                  <th className="px-4 py-3 text-left w-20">状況</th>
                  <th className="px-4 py-3 text-left w-24">訂正日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientChecks.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-600">{c.check_date}</td>
                    <td className="px-4 py-3 text-gray-600">{c.category}</td>
                    <td className="px-4 py-3 text-gray-600">{c.checker}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      <Link href={`/client-checks/${c.id}`} className="hover:text-blue-600 line-clamp-2">{c.content}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${checkStatusStyle[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.corrected_date || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )}

      {tab === '質問事項' && (
        <div className="bg-white rounded-xl shadow overflow-hidden max-w-4xl">
          <div className="flex justify-between items-center p-4 border-b">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
              <HelpCircle size={16} className="text-indigo-500" /> 質問事項一覧
            </div>
            <div className="flex items-center gap-2">
              {clientQuestions.length > 0 && (
                <button onClick={() => { setExportFrom(''); setExportTo(''); setExportModal('questions') }}
                  className="flex items-center gap-1 text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                  <Download size={14} /> Excel出力
                </button>
              )}
              <Link href={`/client-questions/new?client_id=${client.id}&client_code=${client.code}&client_name=${encodeURIComponent(client.name)}`}
                className="flex items-center gap-1 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
                <Plus size={14} /> 新規追加
              </Link>
            </div>
          </div>
          {clientQuestions.length === 0 ? (
            <div className="text-center py-10 text-gray-400">質問事項はありません</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left w-28">質問日</th>
                  <th className="px-4 py-3 text-left w-20">区分</th>
                  <th className="px-4 py-3 text-left w-20">質問者</th>
                  <th className="px-4 py-3 text-left">質問内容</th>
                  <th className="px-4 py-3 text-left w-20">状況</th>
                  <th className="px-4 py-3 text-left w-24">回答日</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientQuestions.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 text-gray-600">{q.question_date}</td>
                    <td className="px-4 py-3 text-gray-600">{q.category}</td>
                    <td className="px-4 py-3 text-gray-600">{q.questioner}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      <Link href={`/client-questions/${q.id}`} className="hover:text-blue-600 line-clamp-2">
                        {(() => {
                          try {
                            const parsed = JSON.parse(q.content)
                            if (Array.isArray(parsed)) return parsed.map((it: { text: string }) => it.text).filter(Boolean).join('　／　')
                          } catch { /* fall through */ }
                          return q.content
                        })()}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${questionStatusStyle[q.status] || 'bg-gray-100 text-gray-600'}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{q.answered_date || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === '支払調書' && client && (
        <PaymentReportTab
          clientId={client.id}
          clientCode={client.code}
          clientName={client.name}
        />
      )}

      {tab === '源泉集計' && client && (
        <WithholdingTaxTab
          clientId={client.id}
          clientCode={client.code}
          clientName={client.name}
        />
      )}

      {/* Excel出力 期間選択モーダル */}
      {exportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setExportModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-1">
              {exportModal === 'checks' ? '指摘事項' : '質問事項'} Excel出力
            </h3>
            <p className="text-xs text-gray-400 mb-4">期間を指定しない場合は全件出力します</p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">開始日</label>
                <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">終了日</label>
                <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setExportModal(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={doExport}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                <Download size={14} /> 出力
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function F({ label, children, cn = '', required = false, hasError = false }: { label: string; children: React.ReactNode; cn?: string; required?: boolean; hasError?: boolean }) {
  return (
    <div className={cn}>
      <label className={`block text-xs font-medium mb-1 ${hasError ? 'text-red-600' : 'text-gray-500'}`}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {hasError && <span className="ml-1 text-red-500">（必須）</span>}
      </label>
      <div className={hasError ? 'ring-2 ring-red-400 rounded-lg' : ''}>
        {children}
      </div>
    </div>
  )
}
