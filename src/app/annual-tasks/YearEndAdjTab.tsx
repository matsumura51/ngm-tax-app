'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Search, Printer, CheckCircle, Circle, X, AlertTriangle } from 'lucide-react'
import { YearEndAdjRecord } from '@/lib/types'
import * as XLSX from 'xlsx'

const ic = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'
const PAYMENT_METHODS = ['', 'ダイレクト', '納付書', 'クレジット', 'ネットバンク', 'e-Tax']
const RETURN_METHODS = ['', '郵送', '訪問時', '来所時', '決算資料と同封']

function fmtAmt(n: number) { return n ? n.toLocaleString('ja-JP') : '' }
function parseAmt(s: string) { return parseInt(s.replace(/[^0-9]/g, '') || '0') || 0 }
function fmtDisplay(n: number) { return n > 0 ? n.toLocaleString('ja-JP') + '円' : <span className="text-gray-300">—</span> }

type FormData = Omit<YearEndAdjRecord, 'id' | 'created_at'>

function emptyForm(year: number): FormData {
  return {
    client_id: null, client_code: null, client_name: '',
    year, status: '未完了', staff_name: null, input_staff: null,
    material_distributed_at: null, material_received_at: null,
    material_scanned: false,
    director_confirmed_at: null,
    payment_method: null, payment_note: null,
    sent_filed_at: null, payment_due_at: null,
    tax_amount: 0, payment_confirmed_at: null,
    direct_payment_confirmed_at: null, houjin_chosho: false,
    salary_report: false, depreciation_assets: false,
    returned: false, return_method: null, notes: null, next_year_notes: null,
  }
}

function DateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input type="date" className={ic}
      value={value || ''}
      onChange={e => onChange(e.target.value || null)} />
  )
}

interface Props { year: number }

export default function YearEndAdjTab({ year }: Props) {
  const [records, setRecords] = useState<YearEndAdjRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filterName, setFilterName] = useState('')
  const [filterStaff, setFilterStaff] = useState('')
  const [filterStatus, setFilterStatus] = useState<'全て' | '未完了' | '完了'>('全て')
  const [editingRecord, setEditingRecord] = useState<YearEndAdjRecord | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm(year))
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<{ name: string; division: string | null }[]>([])
  const [filterDivision, setFilterDivision] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data }, { data: users }] = await Promise.all([
      supabase.from('year_end_adj_records').select('*').eq('year', year).order('client_code', { ascending: true }),
      supabase.from('users').select('name, division').order('name'),
    ])
    setRecords(data || [])
    setAllUsers(users || [])
    setStaffList((users || []).map((u: { name: string }) => u.name).filter(Boolean))
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  function openEdit(rec: YearEndAdjRecord) {
    setEditingRecord(rec)
    setForm({ ...rec })
  }

  function setF<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function deleteRecord(id: string) {
    if (!confirm('このレコードを削除しますか？')) return
    const supabase = createClient()
    const { error } = await supabase.from('year_end_adj_records').delete().eq('id', id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setEditingRecord(null)
    load()
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('year_end_adj_records')
      .update(form)
      .eq('id', editingRecord!.id)
    if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    setSaving(false)
    setEditingRecord(null)
    load()
  }

  async function toggleStatus(rec: YearEndAdjRecord) {
    const newStatus = rec.status === '完了' ? '未完了' : '完了'
    const supabase = createClient()
    await supabase.from('year_end_adj_records').update({ status: newStatus }).eq('id', rec.id)
    setRecords(rs => rs.map(r => r.id === rec.id ? { ...r, status: newStatus } : r))
  }

  const divisionOptions = Array.from(new Set(allUsers.map(u => u.division).filter(Boolean))).sort() as string[]
  const staffInDivision = filterDivision ? allUsers.filter(u => u.division === filterDivision).map(u => u.name) : null

  const filtered = records.filter(r => {
    if (filterStatus !== '全て' && r.status !== filterStatus) return false
    if (filterName && !r.client_name.includes(filterName) && !(r.client_code || '').includes(filterName)) return false
    if (filterDivision && staffInDivision && !staffInDivision.includes(r.staff_name || '')) return false
    if (filterStaff && !(r.staff_name || '').includes(filterStaff)) return false
    return true
  })

  const doneCount = filtered.filter(r => r.status === '完了').length
  const totalTax = filtered.reduce((s, r) => s + (r.tax_amount || 0), 0)

  function handlePrint() {
    const reiwa = year - 2018
    const title = `年末調整業務管理表　令和${reiwa}年（${year}年）`
    const rows = filtered.map((r, i) => `<tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td>${r.client_code || ''}</td>
      <td class="name">${r.client_name}</td>
      <td>${r.staff_name || ''}</td>
      <td>${r.input_staff || ''}</td>
      <td class="dt">${r.material_distributed_at || ''}</td>
      <td class="dt">${r.material_received_at || ''}</td>
      <td class="c">${r.material_scanned ? '✓' : ''}</td>
      <td class="dt">${r.director_confirmed_at || ''}</td>
      <td>${r.payment_method || ''}</td>
      <td>${r.payment_note || ''}</td>
      <td class="dt">${r.sent_filed_at || ''}</td>
      <td class="dt">${r.payment_due_at || ''}</td>
      <td class="num">${r.tax_amount > 0 ? r.tax_amount.toLocaleString('ja-JP') : ''}</td>
      <td class="dt">${r.payment_confirmed_at || ''}</td>
      <td class="dt">${r.direct_payment_confirmed_at || ''}</td>
      <td class="c">${r.houjin_chosho ? '有' : ''}</td>
      <td class="c">${r.salary_report ? '✓' : ''}</td>
      <td class="c">${r.depreciation_assets ? '有' : ''}</td>
      <td class="c">${r.returned ? '✓' : ''}</td>
      <td>${r.return_method || ''}</td>
      <td class="note">${r.notes || ''}</td>
      <td class="note${r.next_year_notes ? ' hasnote' : ''}">${r.next_year_notes ? '⚠ ' + r.next_year_notes : ''}</td>
      <td class="c${r.status === '完了' ? ' done' : ''}">${r.status === '完了' ? '✓' : ''}</td>
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
    th{background:#dde4f0;font-size:5.5pt;text-align:center}
    thead{display:table-header-group}
    .alt{background:#f8f9ff}.done{color:#16a34a;font-weight:bold;text-align:center}.hasnote{color:#b45309;font-weight:600}
    .name{width:9%}.dt{width:4%;text-align:center}.c{width:2.5%;text-align:center}.note{width:6%}.num{width:4.5%;text-align:right}
    </style></head><body>
    <h1>${title}</h1>
    <div class="sub">完了 ${doneCount}件 / 全${filtered.length}件${totalTax > 0 ? `　　納税額合計：${totalTax.toLocaleString('ja-JP')}円` : ''}</div>
    <table>
      <thead><tr>
        <th style="width:4%">顧客CD</th><th class="name">顧客名</th>
        <th style="width:4.5%">担当者</th><th style="width:4.5%">入力担当</th>
        <th class="dt">資料配布</th><th class="dt">資料預り</th><th class="c">スキャン</th><th class="dt">所長確認</th>
        <th style="width:4%">納付方法</th><th style="width:4%">納付備考</th>
        <th class="dt">発送・申告日</th><th class="dt">納付期日</th>
        <th class="num">納税額</th><th class="dt">納付確認</th><th class="dt">ダイレクト確認</th>
        <th class="c">法調</th><th class="c">給与</th><th class="c">償却</th>
        <th class="c">返却</th><th style="width:4%">返却方法</th>
        <th class="note">備考</th><th class="note">翌年引継</th><th class="c">完了</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function handleExcel() {
    const reiwa = year - 2018
    const header = ['顧客CD', '顧客名', '担当者', '入力担当', '資料配布', '資料預り', 'スキャン', '所長確認',
      '納付方法', '納付備考', '発送・申告日', '納付期日', '納税額', '納付確認', 'ダイレクト確認',
      '法定調書', '給与支払', '償却資産', '返却', '返却方法', '備考', '翌年引継ぎ事項', '進捗']
    const rows = filtered.map(r => [
      r.client_code || '', r.client_name, r.staff_name || '', r.input_staff || '',
      r.material_distributed_at || '', r.material_received_at || '', r.material_scanned ? '✓' : '',
      r.director_confirmed_at || '',
      r.payment_method || '', r.payment_note || '',
      r.sent_filed_at || '', r.payment_due_at || '',
      r.tax_amount || 0, r.payment_confirmed_at || '', r.direct_payment_confirmed_at || '',
      r.houjin_chosho ? '有' : '', r.salary_report ? '✓' : '', r.depreciation_assets ? '有' : '',
      r.returned ? '✓' : '', r.return_method || '',
      r.notes || '', r.next_year_notes || '', r.status,
    ])
    const ws = XLSX.utils.aoa_to_sheet([[`年末調整業務管理表　令和${reiwa}年（${year}年）`], [], header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '年末調整')
    XLSX.writeFile(wb, `年末調整_令和${reiwa}年.xlsx`)
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
          <input className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-32"
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
          {(['全て', '未完了', '完了'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500 ml-1">
          完了 <span className="font-bold text-green-600">{doneCount}</span> / {filtered.length}件
          {totalTax > 0 && <span className="ml-3 text-gray-600">納税額合計：<span className="font-bold">{totalTax.toLocaleString('ja-JP')}円</span></span>}
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
          <table className="text-xs w-full" style={{ minWidth: '1600px' }}>
            <thead className="bg-gray-50 text-gray-500 border-b">
              <tr>
                <th className="px-2 py-2 text-left w-16 sticky left-0 bg-gray-50 z-10">顧客CD</th>
                <th className="px-2 py-2 text-left w-36 sticky left-16 bg-gray-50 z-10">顧客名</th>
                <th className="px-2 py-2 text-center w-20">担当者</th>
                <th className="px-2 py-2 text-center w-20">入力担当</th>
                <th className="px-2 py-2 text-center w-22">資料配布</th>
                <th className="px-2 py-2 text-center w-22">資料預り</th>
                <th className="px-2 py-2 text-center w-14">スキャン</th>
                <th className="px-2 py-2 text-center w-22">所長確認</th>
                <th className="px-2 py-2 text-center w-22">納付方法</th>
                <th className="px-2 py-2 text-center w-20">納付備考</th>
                <th className="px-2 py-2 text-center w-24">発送・申告日</th>
                <th className="px-2 py-2 text-center w-22">納付期日</th>
                <th className="px-2 py-2 text-right w-24">納税額</th>
                <th className="px-2 py-2 text-center w-24">納付確認</th>
                <th className="px-2 py-2 text-center w-24">ダイレクト確認</th>
                <th className="px-2 py-2 text-center w-14">法調</th>
                <th className="px-2 py-2 text-center w-14">給与</th>
                <th className="px-2 py-2 text-center w-14">償却</th>
                <th className="px-2 py-2 text-center w-14">返却</th>
                <th className="px-2 py-2 text-center w-22">返却方法</th>
                <th className="px-2 py-2 text-left w-32">備考</th>
                <th className="px-2 py-2 text-left w-28">翌年引継</th>
                <th className="px-2 py-2 text-center w-14">完了</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((rec, idx) => {
                const hasNextYear = !!rec.next_year_notes
                return (
                <tr key={rec.id}
                  className={`cursor-pointer transition ${hasNextYear ? 'bg-amber-50 hover:bg-amber-100' : idx % 2 === 1 ? 'bg-gray-50/50 hover:bg-blue-50' : 'hover:bg-blue-50'} ${rec.status === '完了' ? 'opacity-60' : ''}`}
                  onClick={() => openEdit(rec)}>
                  <td className="px-2 py-1.5 font-mono text-gray-500 sticky left-0 bg-inherit z-10">{rec.client_code}</td>
                  <td className="px-2 py-1.5 font-medium sticky left-16 bg-inherit z-10 flex items-center gap-1">
                    {hasNextYear && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
                    {rec.client_name}
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-600">{rec.staff_name}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{rec.input_staff}</td>
                  <td className="px-2 py-1.5 text-center">{rec.material_distributed_at ? <span className="text-green-700">✓ {rec.material_distributed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.material_received_at ? <span className="text-green-700">✓ {rec.material_received_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.material_scanned ? <span className="text-blue-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.director_confirmed_at ? <span className="text-green-700">✓ {rec.director_confirmed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600">{rec.payment_method || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center text-gray-500 text-xs">{rec.payment_note || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.sent_filed_at ? <span className="text-blue-700">{rec.sent_filed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600">{rec.payment_due_at || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtDisplay(rec.tax_amount)}</td>
                  <td className="px-2 py-1.5 text-center">{rec.payment_confirmed_at ? <span className="text-green-700">✓ {rec.payment_confirmed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.direct_payment_confirmed_at ? <span className="text-green-700">✓ {rec.direct_payment_confirmed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.houjin_chosho ? <span className="text-blue-600 font-bold">有</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.salary_report ? <span className="text-blue-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.depreciation_assets ? <span className="text-blue-600 font-bold">有</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.returned ? <span className="text-green-700 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600">{rec.return_method || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-xs">{rec.notes || ''}</td>
                  <td className="px-2 py-1.5 truncate max-w-xs">
                    {rec.next_year_notes
                      ? <span className="text-amber-700 font-medium">⚠ {rec.next_year_notes}</span>
                      : ''}
                  </td>
                  <td className="px-2 py-1.5 text-center" onClick={e => { e.stopPropagation(); toggleStatus(rec) }}>
                    {rec.status === '完了'
                      ? <CheckCircle size={16} className="mx-auto text-green-500" />
                      : <Circle size={16} className="mx-auto text-gray-300 hover:text-green-400" />}
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
                <div className="text-xs text-gray-400">{editingRecord.client_code} ／ {year}年</div>
              </div>
              <button onClick={() => setEditingRecord(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

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
              {/* 資料・確認 */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">資料配布</label>
                  <DateInput value={form.material_distributed_at} onChange={v => setF('material_distributed_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">資料預り</label>
                  <DateInput value={form.material_received_at} onChange={v => setF('material_received_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">所長確認</label>
                  <DateInput value={form.director_confirmed_at} onChange={v => setF('director_confirmed_at', v)} /></div>
              </div>
              {/* 申告・納付 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">納付方法</label>
                  <select className={ic} value={form.payment_method || ''} onChange={e => setF('payment_method', e.target.value || null)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select></div>
                <div><label className="text-xs text-gray-500 block mb-1">発送・申告日</label>
                  <DateInput value={form.sent_filed_at} onChange={v => setF('sent_filed_at', v)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">納付期日</label>
                  <DateInput value={form.payment_due_at} onChange={v => setF('payment_due_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">納税額（円）</label>
                  <input className={ic} value={fmtAmt(form.tax_amount)}
                    onChange={e => setF('tax_amount', parseAmt(e.target.value))}
                    placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">納付確認</label>
                  <DateInput value={form.payment_confirmed_at} onChange={v => setF('payment_confirmed_at', v)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">ダイレクト納付確認</label>
                  <DateInput value={form.direct_payment_confirmed_at} onChange={v => setF('direct_payment_confirmed_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">納付備考（0円申告等）</label>
                  <input className={ic} value={form.payment_note || ''} onChange={e => setF('payment_note', e.target.value || null)} placeholder="例：0円申告" /></div>
              </div>
              {/* チェック項目 */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.houjin_chosho}
                    onChange={e => setF('houjin_chosho', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  法定調書（税務署）
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.depreciation_assets}
                    onChange={e => setF('depreciation_assets', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  償却資産
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.salary_report}
                    onChange={e => setF('salary_report', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  給与支払（市役所）
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.material_scanned}
                    onChange={e => setF('material_scanned', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  資料スキャン
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.returned}
                    onChange={e => setF('returned', e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-600" />
                  返却
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
              {/* 進捗 */}
              <div className="flex items-center gap-3 pt-1 border-t">
                <span className="text-xs text-gray-500">進捗</span>
                {(['未完了', '完了'] as const).map(s => (
                  <button key={s} onClick={() => setF('status', s)}
                    className={`px-4 py-1.5 text-sm rounded-lg border ${form.status === s
                      ? s === '完了' ? 'bg-green-600 text-white border-green-600' : 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 pb-5">
              <button onClick={() => deleteRecord(editingRecord!.id)}
                className="mr-auto px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50">
                削除
              </button>
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
      )}
    </div>
  )
}
