'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Search, Printer, X, AlertTriangle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { TaxReturnRecord } from '@/lib/types'
import * as XLSX from 'xlsx'

const ic = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'
const STATUSES = ['未着手', '入力中', '申告書作成中', '完了', '返却完了']
const TAX_TYPES = ['', '青色', '白色', '贈与']
const INCOME_CATEGORIES = ['', '事業', '不動産', '給与', 'その他']
const PAYMENT_METHODS = ['', 'ダイレクト', '納付書', 'クレジット', 'ネットバンク', 'e-Tax']
const RETURN_METHODS = ['', '郵送', '訪問時', '来所時', '決算資料と同封']
const E_FILING_PDF_OPTIONS = ['', '未', '完了']

type FormData = Omit<TaxReturnRecord, 'id' | 'created_at'>

function emptyForm(year: number): FormData {
  return {
    client_id: null, client_code: null, client_name: '',
    year, status: '未着手', staff_name: null, input_staff: null,
    doc_received_at: null, data_input_completed_at: null,
    tax_type: null, income_category: null,
    consumption_tax: false,
    return_completed_at: null, accountant_check_at: null,
    e_filing_at: null, e_filing_pdf: null,
    payment_method: null, general_ledger_pdf: false,
    doc_returned: false, return_method: null,
    notes: null, next_year_notes: null,
  }
}

function DateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input type="date" className={ic} value={value || ''}
      onChange={e => onChange(e.target.value || null)} />
  )
}

const statusColor: Record<string, string> = {
  '未着手': 'bg-gray-100 text-gray-600',
  '入力中': 'bg-blue-100 text-blue-700',
  '申告書作成中': 'bg-amber-100 text-amber-700',
  '完了': 'bg-green-100 text-green-700',
  '返却完了': 'bg-teal-100 text-teal-700',
}

interface Props { year: number }

export default function TaxReturnTab({ year }: Props) {
  const [records, setRecords] = useState<TaxReturnRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filterName, setFilterName] = useState('')
  const [filterStaff, setFilterStaff] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('全て')
  const [editingRecord, setEditingRecord] = useState<TaxReturnRecord | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm(year))
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<{ name: string; division: string | null }[]>([])
  const [filterDivision, setFilterDivision] = useState('')
  const [checklistText, setChecklistText] = useState<string | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [showChecklist, setShowChecklist] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data }, { data: users }] = await Promise.all([
      supabase.from('tax_return_records').select('*').eq('year', year).order('client_code', { ascending: true }),
      supabase.from('users').select('name, division').order('name'),
    ])
    setRecords(data || [])
    setAllUsers(users || [])
    setStaffList((users || []).map((u: { name: string }) => u.name).filter(Boolean))
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  function openEdit(rec: TaxReturnRecord) {
    setEditingRecord(rec)
    setForm({ ...rec })
    setChecklistText(null)
    setChecklistError(null)
    setShowChecklist(false)
  }

  async function generateChecklist(clientId: string | null) {
    if (!clientId) { setChecklistError('client_id が不明なため生成できません'); return }
    setChecklistLoading(true)
    setChecklistError(null)
    setShowChecklist(true)
    try {
      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      })
      const json = await res.json()
      if (json.error) { setChecklistError(json.error); setChecklistLoading(false); return }
      setChecklistText(json.checklist)
    } catch (e: unknown) {
      setChecklistError(e instanceof Error ? e.message : '通信エラー')
    }
    setChecklistLoading(false)
  }

  function setF<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('tax_return_records')
      .update(form)
      .eq('id', editingRecord!.id)
    if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    setSaving(false)
    setEditingRecord(null)
    load()
  }

  async function deleteRecord() {
    if (!confirm(`「${editingRecord!.client_name}」の確定申告レコードを削除しますか？`)) return
    const supabase = createClient()
    const { error } = await supabase.from('tax_return_records').delete().eq('id', editingRecord!.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setEditingRecord(null)
    load()
  }

  async function toggleStatus(rec: TaxReturnRecord) {
    const idx = STATUSES.indexOf(rec.status)
    const newStatus = idx < STATUSES.length - 1 ? STATUSES[idx + 1] : STATUSES[0]
    const supabase = createClient()
    await supabase.from('tax_return_records').update({ status: newStatus }).eq('id', rec.id)
    setRecords(rs => rs.map(r => r.id === rec.id ? { ...r, status: newStatus } : r))
  }

  const DONE_STATUSES = ['完了', '返却完了']
  const divisionOptions = Array.from(new Set(allUsers.map(u => u.division).filter(Boolean))).sort() as string[]
  const staffInDivision = filterDivision ? allUsers.filter(u => u.division === filterDivision).map(u => u.name) : null

  const filtered = records.filter(r => {
    if (filterStatus !== '全て' && filterStatus === '完了系') {
      if (!DONE_STATUSES.includes(r.status)) return false
    } else if (filterStatus !== '全て' && filterStatus !== '完了系') {
      if (r.status !== filterStatus) return false
    }
    if (filterName && !r.client_name.includes(filterName) && !(r.client_code || '').includes(filterName)) return false
    if (filterDivision && staffInDivision && !staffInDivision.includes(r.staff_name || '')) return false
    if (filterStaff && !(r.staff_name || '').includes(filterStaff)) return false
    return true
  })

  const doneCount = filtered.filter(r => DONE_STATUSES.includes(r.status)).length
  const nextYearCount = filtered.filter(r => r.next_year_notes).length

  function handlePrint() {
    const reiwa = year - 2018
    const title = `確定申告 進捗管理表　令和${reiwa}年分（${year}年）`
    const rows = filtered.map((r, i) => `<tr class="${i % 2 === 1 ? 'alt' : ''}${r.next_year_notes ? ' hasnote' : ''}">
      <td>${r.client_code || ''}</td>
      <td class="name">${r.client_name}</td>
      <td>${r.staff_name || ''}</td>
      <td>${r.input_staff || ''}</td>
      <td class="dt">${r.doc_received_at || ''}</td>
      <td class="dt">${r.data_input_completed_at || ''}</td>
      <td>${r.tax_type || ''}</td>
      <td>${r.income_category || ''}</td>
      <td class="c">${r.consumption_tax ? '有' : ''}</td>
      <td class="dt">${r.return_completed_at || ''}</td>
      <td class="dt">${r.accountant_check_at || ''}</td>
      <td class="dt">${r.e_filing_at || ''}</td>
      <td>${r.e_filing_pdf || ''}</td>
      <td>${r.payment_method || ''}</td>
      <td class="c">${r.general_ledger_pdf ? '有' : ''}</td>
      <td class="c">${r.doc_returned ? '✓' : ''}</td>
      <td>${r.return_method || ''}</td>
      <td class="note">${r.notes || ''}</td>
      <td class="note">${r.next_year_notes ? '⚠ ' + r.next_year_notes : ''}</td>
      <td class="st">${r.status}</td>
    </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
    @page{size:A4 landscape;margin:8mm}
    *{box-sizing:border-box}
    body{font-family:'Meiryo',sans-serif;font-size:6pt;margin:0}
    h1{font-size:10pt;font-weight:bold;margin-bottom:4px}
    .sub{font-size:7pt;color:#555;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #bbb;padding:1.5px 2px;vertical-align:middle;word-break:break-all}
    th{background:#cfe2ff;font-size:5.5pt;text-align:center}
    thead{display:table-header-group}
    .alt{background:#f0f6ff}.hasnote{background:#fffbeb}
    .name{width:9%}.dt{width:4%;text-align:center}.c{width:2.5%;text-align:center}
    .note{width:7%}.st{width:4.5%;text-align:center}
    </style></head><body>
    <h1>${title}</h1>
    <div class="sub">完了 ${doneCount}件 / 全${filtered.length}件${nextYearCount > 0 ? `　⚠ 翌年引継 ${nextYearCount}件` : ''}</div>
    <table>
      <thead><tr>
        <th style="width:4%">顧客CD</th><th class="name">顧客名</th>
        <th style="width:4.5%">担当者</th><th style="width:4.5%">入力担当</th>
        <th class="dt">書類預り</th><th class="dt">入力完了</th>
        <th style="width:3.5%">申告種別</th><th style="width:4%">所得区分</th>
        <th class="c">消費税</th>
        <th class="dt">申告書完了</th><th class="dt">税理士確認</th><th class="dt">電子送信</th>
        <th style="width:3%">PDF</th><th style="width:4%">納付方法</th>
        <th class="c">元帳PDF</th><th class="c">書類返却</th>
        <th style="width:4%">返却方法</th>
        <th class="note">備考</th><th class="note">翌年引継</th>
        <th class="st">進捗</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function handleExcel() {
    const reiwa = year - 2018
    const header = ['顧客CD', '顧客名', '担当者', '入力担当', '書類預り日', 'データ入力完了',
      '申告種別', '所得区分', '消費税申告', '申告書完了', '税理士確認', '電子送信',
      '電子申告PDF', '納付方法', '元帳PDF', '書類返却', '返却方法', '備考', '翌年引継ぎ事項', '進捗']
    const rows = filtered.map(r => [
      r.client_code || '', r.client_name, r.staff_name || '', r.input_staff || '',
      r.doc_received_at || '', r.data_input_completed_at || '',
      r.tax_type || '', r.income_category || '', r.consumption_tax ? '有' : '',
      r.return_completed_at || '', r.accountant_check_at || '', r.e_filing_at || '',
      r.e_filing_pdf || '', r.payment_method || '',
      r.general_ledger_pdf ? '有' : '', r.doc_returned ? '✓' : '', r.return_method || '',
      r.notes || '', r.next_year_notes || '', r.status,
    ])
    const ws = XLSX.utils.aoa_to_sheet([[`確定申告 進捗管理表　令和${reiwa}年分（${year}年）`], [], header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '確定申告')
    XLSX.writeFile(wb, `確定申告_令和${reiwa}年分.xlsx`)
  }

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  return (
    <div>
      {/* フィルター */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-44"
            placeholder="顧客名・コード" value={filterName}
            onChange={e => setFilterName(e.target.value)} />
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-28"
            placeholder="担当者" value={filterStaff}
            onChange={e => setFilterStaff(e.target.value)} />
        </div>
        {divisionOptions.length > 0 && (
          <select value={filterDivision} onChange={e => { setFilterDivision(e.target.value); setFilterStaff('') }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700">
            <option value="">所属（全チーム）</option>
            {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {(['全て', ...STATUSES] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500 ml-1">
          完了 <span className="font-bold text-green-600">{doneCount}</span> / {filtered.length}件
          {nextYearCount > 0 && (
            <span className="ml-3 text-amber-600 font-medium">⚠ 翌年引継 {nextYearCount}件</span>
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300">
            <Printer size={12} /> 印刷
          </button>
          <button onClick={handleExcel}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg">
            Excel
          </button>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">データがありません</div>
        ) : (
          <table className="text-xs w-full" style={{ minWidth: '1700px' }}>
            <thead className="bg-blue-50 text-gray-500 border-b">
              <tr>
                <th className="px-2 py-2 text-left w-16 sticky left-0 bg-blue-50 z-10">顧客CD</th>
                <th className="px-2 py-2 text-left w-36 sticky left-16 bg-blue-50 z-10">顧客名</th>
                <th className="px-2 py-2 text-center w-20">担当者</th>
                <th className="px-2 py-2 text-center w-20">入力担当</th>
                <th className="px-2 py-2 text-center w-22">書類預り</th>
                <th className="px-2 py-2 text-center w-22">入力完了</th>
                <th className="px-2 py-2 text-center w-16">申告種別</th>
                <th className="px-2 py-2 text-center w-18">所得区分</th>
                <th className="px-2 py-2 text-center w-14">消費税</th>
                <th className="px-2 py-2 text-center w-22">申告書完了</th>
                <th className="px-2 py-2 text-center w-22">税理士確認</th>
                <th className="px-2 py-2 text-center w-22">電子送信</th>
                <th className="px-2 py-2 text-center w-14">PDF</th>
                <th className="px-2 py-2 text-center w-22">納付方法</th>
                <th className="px-2 py-2 text-center w-14">元帳PDF</th>
                <th className="px-2 py-2 text-center w-14">書類返却</th>
                <th className="px-2 py-2 text-center w-20">返却方法</th>
                <th className="px-2 py-2 text-left w-28">備考</th>
                <th className="px-2 py-2 text-left w-28">翌年引継</th>
                <th className="px-2 py-2 text-center w-20">進捗</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((rec, idx) => {
                const hasNextYear = !!rec.next_year_notes
                const isDone = DONE_STATUSES.includes(rec.status)
                return (
                  <tr key={rec.id}
                    className={`cursor-pointer transition
                      ${hasNextYear ? 'bg-amber-50 hover:bg-amber-100' : idx % 2 === 1 ? 'bg-gray-50/50 hover:bg-blue-50' : 'hover:bg-blue-50'}
                      ${isDone ? 'opacity-60' : ''}`}
                    onClick={() => openEdit(rec)}>
                    <td className="px-2 py-1.5 font-mono text-gray-500 sticky left-0 bg-inherit z-10">{rec.client_code}</td>
                    <td className="px-2 py-1.5 font-medium sticky left-16 bg-inherit z-10 flex items-center gap-1">
                      {hasNextYear && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                      {rec.client_name}
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{rec.staff_name}</td>
                    <td className="px-2 py-1.5 text-center text-gray-500">{rec.input_staff}</td>
                    <td className="px-2 py-1.5 text-center">{rec.doc_received_at ? <span className="text-green-700">✓ {rec.doc_received_at}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.data_input_completed_at ? <span className="text-green-700">✓ {rec.data_input_completed_at}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{rec.tax_type || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{rec.income_category || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.consumption_tax ? <span className="text-blue-600 font-bold">有</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.return_completed_at ? <span className="text-blue-700">{rec.return_completed_at}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.accountant_check_at ? <span className="text-green-700">✓ {rec.accountant_check_at}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.e_filing_at ? <span className="text-green-700">✓ {rec.e_filing_at}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{rec.e_filing_pdf || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{rec.payment_method || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.general_ledger_pdf ? <span className="text-blue-600 font-bold">有</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center">{rec.doc_returned ? <span className="text-green-700 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-center text-gray-600">{rec.return_method || <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-gray-600 truncate max-w-xs">{rec.notes || ''}</td>
                    <td className="px-2 py-1.5 truncate max-w-xs">
                      {rec.next_year_notes
                        ? <span className="text-amber-700 font-medium">⚠ {rec.next_year_notes}</span>
                        : ''}
                    </td>
                    <td className="px-2 py-1.5 text-center" onClick={e => { e.stopPropagation(); toggleStatus(rec) }}>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 ${statusColor[rec.status] || 'bg-gray-100 text-gray-600'}`}>
                        {rec.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 編集モーダル */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setEditingRecord(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <div className="font-bold text-gray-800 flex items-center gap-2">
                  {editingRecord.next_year_notes && <AlertTriangle size={16} className="text-amber-500" />}
                  {editingRecord.client_name}
                </div>
                <div className="text-xs text-gray-400">{editingRecord.client_code} ／ 令和{year - 2018}年分（{year}年）</div>
              </div>
              <button onClick={() => setEditingRecord(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* 翌年引継ぎ事項アラート */}
            {editingRecord.next_year_notes && (
              <div className="mx-6 mt-4 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 flex gap-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-amber-700 mb-0.5">翌年引継ぎ事項</div>
                  <div className="text-sm text-amber-800">{editingRecord.next_year_notes}</div>
                </div>
              </div>
            )}

            <div className="p-6 space-y-4 text-sm">
              {/* 担当 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">担当者</label>
                  <select className={ic} value={form.staff_name || ''} onChange={e => setF('staff_name', e.target.value || null)}>
                    <option value="">—</option>
                    {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select></div>
                <div><label className="text-xs text-gray-500 block mb-1">入力担当</label>
                  <select className={ic} value={form.input_staff || ''} onChange={e => setF('input_staff', e.target.value || null)}>
                    <option value="">—</option>
                    {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select></div>
              </div>
              {/* 書類・入力 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">書類預り日</label>
                  <DateInput value={form.doc_received_at} onChange={v => setF('doc_received_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">データ入力完了</label>
                  <DateInput value={form.data_input_completed_at} onChange={v => setF('data_input_completed_at', v)} /></div>
              </div>
              {/* 申告種別・所得区分 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">申告種別（青色・白色・贈与）</label>
                  <select className={ic} value={form.tax_type || ''} onChange={e => setF('tax_type', e.target.value || null)}>
                    {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><label className="text-xs text-gray-500 block mb-1">所得区分</label>
                  <select className={ic} value={form.income_category || ''} onChange={e => setF('income_category', e.target.value || null)}>
                    {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
              </div>
              {/* 申告書・確認・送信 */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">申告書完了</label>
                  <DateInput value={form.return_completed_at} onChange={v => setF('return_completed_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">税理士チェック完了</label>
                  <DateInput value={form.accountant_check_at} onChange={v => setF('accountant_check_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">電子送信完了</label>
                  <DateInput value={form.e_filing_at} onChange={v => setF('e_filing_at', v)} /></div>
              </div>
              {/* 電子申告PDF・納付方法 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">電子申告データPDF</label>
                  <select className={ic} value={form.e_filing_pdf || ''} onChange={e => setF('e_filing_pdf', e.target.value || null)}>
                    {E_FILING_PDF_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select></div>
                <div><label className="text-xs text-gray-500 block mb-1">納付方法</label>
                  <select className={ic} value={form.payment_method || ''} onChange={e => setF('payment_method', e.target.value || null)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select></div>
              </div>
              {/* チェック */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.consumption_tax}
                    onChange={e => setF('consumption_tax', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  消費税申告
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.general_ledger_pdf}
                    onChange={e => setF('general_ledger_pdf', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  総勘定元帳PDF
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.doc_returned}
                    onChange={e => setF('doc_returned', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  書類返却
                </label>
                <div><label className="text-xs text-gray-500 block mb-1">返却方法</label>
                  <select className={ic} value={form.return_method || ''} onChange={e => setF('return_method', e.target.value || null)}>
                    {RETURN_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select></div>
              </div>
              {/* 備考 */}
              <div><label className="text-xs text-gray-500 block mb-1">備考</label>
                <textarea className={ic + ' h-16 resize-none'} value={form.notes || ''}
                  onChange={e => setF('notes', e.target.value || null)} /></div>
              {/* 翌年引継ぎ事項 */}
              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50">
                <label className="text-xs font-medium text-amber-700 block mb-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> 翌年引継ぎ事項（翌年の進捗画面でアラート表示）
                </label>
                <textarea className={ic + ' h-16 resize-none bg-white border-amber-300'} value={form.next_year_notes || ''}
                  onChange={e => setF('next_year_notes', e.target.value || null)}
                  placeholder="翌年の担当者に引き継ぐ事項を記入（特殊処理・注意事項等）" />
              </div>

              {/* AIチェックリスト */}
              <div className="border border-blue-200 rounded-lg bg-blue-50/30">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
                    <Sparkles size={13} className="text-blue-500" />
                    AIチェックリスト（指摘・クレーム・処理方法 連動）
                  </div>
                  <div className="flex items-center gap-2">
                    {checklistText && (
                      <button onClick={() => setShowChecklist(v => !v)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                        {showChecklist ? <><ChevronUp size={12} />閉じる</> : <><ChevronDown size={12} />表示</>}
                      </button>
                    )}
                    <button
                      onClick={() => generateChecklist(editingRecord?.client_id || null)}
                      disabled={checklistLoading}
                      className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1">
                      <Sparkles size={11} />
                      {checklistLoading ? '生成中...' : checklistText ? '再生成' : 'AI生成'}
                    </button>
                  </div>
                </div>
                {checklistError && (
                  <div className="px-3 pb-2 text-xs text-red-600">{checklistError}</div>
                )}
                {showChecklist && checklistText && (
                  <div className="border-t border-blue-200 px-3 py-3">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {checklistText}
                    </pre>
                  </div>
                )}
              </div>

              {/* 進捗 */}
              <div className="flex items-center gap-2 pt-1 border-t flex-wrap">
                <span className="text-xs text-gray-500">進捗</span>
                {STATUSES.map(s => (
                  <button key={s} onClick={() => setF('status', s)}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${form.status === s
                      ? statusColor[s] + ' border-current'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between px-6 pb-5">
              <button onClick={deleteRecord}
                className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50">
                削除
              </button>
              <div className="flex gap-3">
                <button onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                  キャンセル
                </button>
                <button onClick={save} disabled={saving}
                  className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
