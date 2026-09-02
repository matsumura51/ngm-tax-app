'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Search, Printer, CheckCircle, Circle, X } from 'lucide-react'
import { WithholdingSemiRecord } from '@/lib/types'
import * as XLSX from 'xlsx'

const ic = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'
const PAYMENT_METHODS = ['', 'ダイレクト', '納付書', 'クレジット', 'ネットバンク', 'e-Tax']

function fmtAmt(n: number) { return n ? n.toLocaleString('ja-JP') : '' }
function parseAmt(s: string) { return parseInt(s.replace(/[^0-9]/g, '') || '0') || 0 }
function fmtDisplay(n: number) { return n > 0 ? n.toLocaleString('ja-JP') + '円' : <span className="text-gray-300">—</span> }

type FormData = Omit<WithholdingSemiRecord, 'id' | 'created_at'>

function DateInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <input type="date" className={ic} value={value || ''}
      onChange={e => onChange(e.target.value || null)} />
  )
}

interface Props { year: number }

export default function WithholdingSemiTab({ year }: Props) {
  const [records, setRecords] = useState<WithholdingSemiRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [filterName, setFilterName] = useState('')
  const [filterStaff, setFilterStaff] = useState('')
  const [filterDivision, setFilterDivision] = useState('')
  const [filterStatus, setFilterStatus] = useState<'全て' | '未完了' | '完了'>('全て')
  const [allUsers, setAllUsers] = useState<{ name: string; division: string | null }[]>([])
  const [editingRecord, setEditingRecord] = useState<WithholdingSemiRecord | null>(null)
  const [form, setForm] = useState<FormData | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data }, { data: users }] = await Promise.all([
      supabase.from('withholding_semi_records').select('*').eq('year', year).order('client_code', { ascending: true }),
      supabase.from('users').select('name, division').order('name'),
    ])
    setRecords(data || [])
    setAllUsers(users || [])
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  function openEdit(rec: WithholdingSemiRecord) {
    setEditingRecord(rec)
    setForm({ ...rec })
  }

  function setF<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => f ? { ...f, [key]: val } : f)
  }

  async function save() {
    if (!form || !editingRecord) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('withholding_semi_records')
      .update(form)
      .eq('id', editingRecord.id)
    if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    setSaving(false)
    setEditingRecord(null)
    load()
  }

  async function toggleStatus(rec: WithholdingSemiRecord) {
    const newStatus = rec.status === '完了' ? '未完了' : '完了'
    const supabase = createClient()
    await supabase.from('withholding_semi_records').update({ status: newStatus }).eq('id', rec.id)
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
  const totalLabor = filtered.reduce((s, r) => s + (r.labor_insurance_amount || 0), 0)

  function handlePrint() {
    const reiwa = year - 2018
    const title = `源泉所得税 納期の特例（7月）　令和${reiwa}年（${year}年）`
    const rows = filtered.map((r, i) => `<tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td>${r.client_code || ''}</td>
      <td class="name">${r.client_name}</td>
      <td>${r.staff_name || ''}</td>
      <td class="dt">${r.doc_received_at || ''}</td>
      <td class="dt">${r.confirmed_at || ''}</td>
      <td>${r.payment_method || ''}</td>
      <td class="dt">${r.sent_filed_at || ''}</td>
      <td class="dt">${r.direct_payment_at || ''}</td>
      <td class="num">${r.tax_amount > 0 ? r.tax_amount.toLocaleString('ja-JP') : ''}</td>
      <td class="dt">${r.payment_confirmed_at || ''}</td>
      <td class="c">${r.has_labor_insurance ? '有' : ''}</td>
      <td class="num">${r.labor_insurance_amount > 0 ? r.labor_insurance_amount.toLocaleString('ja-JP') : ''}</td>
      <td class="dt">${r.labor_insurance_sent_at || ''}</td>
      <td class="c">${r.has_santeikiso ? '有' : ''}</td>
      <td class="dt">${r.santeikiso_sent_at || ''}</td>
      <td class="note">${r.notes || ''}</td>
      <td class="c${r.status === '完了' ? ' done' : ''}">${r.status === '完了' ? '✓' : ''}</td>
    </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
    @page{size:A4 landscape;margin:8mm}
    *{box-sizing:border-box}
    body{font-family:'Meiryo',sans-serif;font-size:6.5pt;margin:0}
    h1{font-size:10pt;font-weight:bold;margin-bottom:4px}
    .sub{font-size:7pt;color:#555;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #bbb;padding:1.5px 2px;vertical-align:middle;word-break:break-all}
    th{background:#d0ece5;font-size:5.5pt;text-align:center}
    thead{display:table-header-group}
    .alt{background:#f0faf7}.done{color:#16a34a;font-weight:bold;text-align:center}
    .name{width:10%}.dt{width:4.5%;text-align:center}.c{width:2.5%;text-align:center}
    .num{width:5%;text-align:right}.note{width:8%}
    </style></head><body>
    <h1>${title}</h1>
    <div class="sub">完了 ${doneCount}件 / 全${filtered.length}件　　納税額合計：${totalTax.toLocaleString('ja-JP')}円　　労働保険合計：${totalLabor.toLocaleString('ja-JP')}円</div>
    <table>
      <thead><tr>
        <th style="width:4%">顧客CD</th><th class="name">顧客名</th>
        <th style="width:5%">担当者</th>
        <th class="dt">書類受取</th><th class="dt">確認</th>
        <th style="width:5%">納付方法</th>
        <th class="dt">送付・申告日</th><th class="dt">ダイレクト日</th>
        <th class="num">納税額</th><th class="dt">納付確認</th>
        <th class="c">労保</th><th class="num">労保額</th><th class="dt">労保送付日</th>
        <th class="c">算定</th><th class="dt">算定送付日</th>
        <th class="note">備考</th><th class="c">完了</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function handleExcel() {
    const reiwa = year - 2018
    const header = ['顧客CD', '顧客名', '担当者', '書類受取', '確認', '納付方法',
      '送付日・申告日', 'ダイレクト納付日', '納税額', '納付確認',
      '労働保険', '労働保険額', '労働保険送付日', '算定基礎届', '算定基礎届送付日', '備考', '進捗']
    const rows = filtered.map(r => [
      r.client_code || '', r.client_name, r.staff_name || '',
      r.doc_received_at || '', r.confirmed_at || '', r.payment_method || '',
      r.sent_filed_at || '', r.direct_payment_at || '',
      r.tax_amount || 0, r.payment_confirmed_at || '',
      r.has_labor_insurance ? '有' : '', r.labor_insurance_amount || 0, r.labor_insurance_sent_at || '',
      r.has_santeikiso ? '有' : '', r.santeikiso_sent_at || '',
      r.notes || '', r.status,
    ])
    const ws = XLSX.utils.aoa_to_sheet([[`源泉所得税 納期の特例（7月）　令和${reiwa}年（${year}年）`], [], header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '源泉7月')
    XLSX.writeFile(wb, `源泉納期の特例_令和${reiwa}年7月.xlsx`)
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
              className={`px-3 py-1.5 ${filterStatus === s ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
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
          <table className="text-xs w-full" style={{ minWidth: '1300px' }}>
            <thead className="bg-teal-50 text-gray-500 border-b">
              <tr>
                <th className="px-2 py-2 text-left w-16 sticky left-0 bg-teal-50 z-10">顧客CD</th>
                <th className="px-2 py-2 text-left w-36 sticky left-16 bg-teal-50 z-10">顧客名</th>
                <th className="px-2 py-2 text-center w-20">担当者</th>
                <th className="px-2 py-2 text-center w-22">書類受取</th>
                <th className="px-2 py-2 text-center w-22">確認</th>
                <th className="px-2 py-2 text-center w-24">納付方法</th>
                <th className="px-2 py-2 text-center w-24">送付・申告日</th>
                <th className="px-2 py-2 text-center w-24">ダイレクト日</th>
                <th className="px-2 py-2 text-right w-24">納税額</th>
                <th className="px-2 py-2 text-center w-24">納付確認</th>
                <th className="px-2 py-2 text-center w-14">労保</th>
                <th className="px-2 py-2 text-right w-24">労保納付額</th>
                <th className="px-2 py-2 text-center w-24">労保送付日</th>
                <th className="px-2 py-2 text-center w-14">算定</th>
                <th className="px-2 py-2 text-center w-24">算定送付日</th>
                <th className="px-2 py-2 text-left w-32">備考</th>
                <th className="px-2 py-2 text-center w-14">完了</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((rec, idx) => (
                <tr key={rec.id}
                  className={`hover:bg-teal-50 cursor-pointer ${idx % 2 === 1 ? 'bg-gray-50/50' : ''} ${rec.status === '完了' ? 'opacity-60' : ''}`}
                  onClick={() => openEdit(rec)}>
                  <td className="px-2 py-1.5 font-mono text-gray-500 sticky left-0 bg-inherit z-10">{rec.client_code}</td>
                  <td className="px-2 py-1.5 font-medium sticky left-16 bg-inherit z-10">{rec.client_name}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600">{rec.staff_name}</td>
                  <td className="px-2 py-1.5 text-center">{rec.doc_received_at ? <span className="text-green-700">✓ {rec.doc_received_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.confirmed_at ? <span className="text-green-700">✓ {rec.confirmed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center text-gray-600">{rec.payment_method || <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.sent_filed_at ? <span className="text-blue-700">{rec.sent_filed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.direct_payment_at ? <span className="text-blue-700">{rec.direct_payment_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtDisplay(rec.tax_amount)}</td>
                  <td className="px-2 py-1.5 text-center">{rec.payment_confirmed_at ? <span className="text-green-700">✓ {rec.payment_confirmed_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.has_labor_insurance ? <span className="text-teal-600 font-bold">有</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtDisplay(rec.labor_insurance_amount)}</td>
                  <td className="px-2 py-1.5 text-center">{rec.labor_insurance_sent_at ? <span className="text-green-700">✓ {rec.labor_insurance_sent_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.has_santeikiso ? <span className="text-teal-600 font-bold">有</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-center">{rec.santeikiso_sent_at ? <span className="text-green-700">✓ {rec.santeikiso_sent_at}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-gray-600 truncate max-w-xs">{rec.notes || ''}</td>
                  <td className="px-2 py-1.5 text-center" onClick={e => { e.stopPropagation(); toggleStatus(rec) }}>
                    {rec.status === '完了'
                      ? <CheckCircle size={16} className="mx-auto text-green-500" />
                      : <Circle size={16} className="mx-auto text-gray-300 hover:text-green-400" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 編集モーダル */}
      {editingRecord && form && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setEditingRecord(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <div className="font-bold text-gray-800">{editingRecord.client_name}</div>
                <div className="text-xs text-gray-400">{editingRecord.client_code} ／ {year}年 源泉納期の特例</div>
              </div>
              <button onClick={() => setEditingRecord(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              {/* 担当 */}
              <div><label className="text-xs text-gray-500 block mb-1">担当者</label>
                <input className={ic} value={form.staff_name || ''} onChange={e => setF('staff_name', e.target.value || null)} /></div>
              {/* 書類・確認 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">書類受取</label>
                  <DateInput value={form.doc_received_at} onChange={v => setF('doc_received_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">確認</label>
                  <DateInput value={form.confirmed_at} onChange={v => setF('confirmed_at', v)} /></div>
              </div>
              {/* 納付 */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">納付方法</label>
                  <select className={ic} value={form.payment_method || ''} onChange={e => setF('payment_method', e.target.value || null)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select></div>
                <div><label className="text-xs text-gray-500 block mb-1">送付日・電子申告日</label>
                  <DateInput value={form.sent_filed_at} onChange={v => setF('sent_filed_at', v)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">ダイレクト納付日</label>
                  <DateInput value={form.direct_payment_at} onChange={v => setF('direct_payment_at', v)} /></div>
                <div><label className="text-xs text-gray-500 block mb-1">納税額（円）</label>
                  <input className={ic} value={fmtAmt(form.tax_amount)}
                    onChange={e => setF('tax_amount', parseAmt(e.target.value))}
                    placeholder="0" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">納付確認</label>
                  <DateInput value={form.payment_confirmed_at} onChange={v => setF('payment_confirmed_at', v)} /></div>
              </div>
              {/* 労働保険 */}
              <div className="border rounded-lg p-3 space-y-3 bg-teal-50/40">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-teal-700">
                  <input type="checkbox" checked={form.has_labor_insurance}
                    onChange={e => setF('has_labor_insurance', e.target.checked)}
                    className="w-4 h-4 rounded accent-teal-600" />
                  労働保険 対象
                </label>
                {form.has_labor_insurance && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500 block mb-1">労働保険 納付額（円）</label>
                      <input className={ic} value={fmtAmt(form.labor_insurance_amount)}
                        onChange={e => setF('labor_insurance_amount', parseAmt(e.target.value))}
                        placeholder="0" /></div>
                    <div><label className="text-xs text-gray-500 block mb-1">労働保険 送付日</label>
                      <DateInput value={form.labor_insurance_sent_at} onChange={v => setF('labor_insurance_sent_at', v)} /></div>
                  </div>
                )}
              </div>
              {/* 算定基礎届 */}
              <div className="border rounded-lg p-3 space-y-3 bg-teal-50/40">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-teal-700">
                  <input type="checkbox" checked={form.has_santeikiso}
                    onChange={e => setF('has_santeikiso', e.target.checked)}
                    className="w-4 h-4 rounded accent-teal-600" />
                  算定基礎届 対象
                </label>
                {form.has_santeikiso && (
                  <div><label className="text-xs text-gray-500 block mb-1">算定基礎届 送付日</label>
                    <DateInput value={form.santeikiso_sent_at} onChange={v => setF('santeikiso_sent_at', v)} /></div>
                )}
              </div>
              {/* 備考 */}
              <div><label className="text-xs text-gray-500 block mb-1">備考</label>
                <textarea className={ic + ' h-20 resize-none'} value={form.notes || ''}
                  onChange={e => setF('notes', e.target.value || null)} /></div>
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
            <div className="flex justify-end gap-3 px-6 pb-5">
              <button onClick={() => setEditingRecord(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={save} disabled={saving}
                className="px-6 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
