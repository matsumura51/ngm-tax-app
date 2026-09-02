'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Printer, Download } from 'lucide-react'
import { WithholdingRecordItem } from '@/lib/types'
import * as XLSX from 'xlsx'

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const PAYEE_TYPES = ['社労士', '司法書士', '弁護士', '税理士', '公認会計士', '土地家屋調査士', '行政書士', 'その他']
const ic = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'

function zen2han(str: string): string {
  return str
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/／/g, '/').replace(/：/g, ':').replace(/　/g, ' ')
}
function sanitizeAmt(str: string): string {
  return zen2han(str).replace(/[^0-9]/g, '')
}
function fmtAmt(raw: string | number): string {
  const n = typeof raw === 'number' ? raw : parseInt(raw || '0')
  if (!n || isNaN(n)) return ''
  return n.toLocaleString('ja-JP')
}
function parseAmt(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, '') || '0') || 0
}
function parseFee(s: string | number | null | undefined): number {
  if (s === null || s === undefined || s === '') return 0
  if (typeof s === 'number') return s
  const n = parseInt(String(s).replace(/,/g, ''), 10)
  return isNaN(n) ? 0 : n
}

type MonthData = { date: string; gross: string; tax: string }
type FormData = {
  payee_name: string
  payee_type: string
  exempt: boolean
  monthly: Record<string, MonthData>
}

function emptyForm(): FormData {
  return {
    payee_name: '',
    payee_type: '社労士',
    exempt: false,
    monthly: Object.fromEntries(MONTHS.map(m => [String(m), { date: '', gross: '', tax: '' }])),
  }
}

function itemToForm(item: WithholdingRecordItem): FormData {
  const exempt = !!((item.monthly_data as Record<string, unknown>)._exempt)
  const monthly: Record<string, MonthData> = {}
  for (const m of MONTHS) {
    const d = item.monthly_data?.[String(m)]
    monthly[String(m)] = {
      date: d?.date || '',
      gross: d?.gross ? String(d.gross) : '',
      tax: d?.tax ? String(d.tax) : '',
    }
  }
  return {
    payee_name: item.payee_name || '',
    payee_type: item.payee_type || '社労士',
    exempt,
    monthly,
  }
}

function itemIsExempt(item: WithholdingRecordItem): boolean {
  return !!((item.monthly_data as Record<string, unknown>)?._exempt)
}
function itemAnnualGross(item: WithholdingRecordItem): number {
  return MONTHS.reduce((s, m) => s + (item.monthly_data?.[String(m)]?.gross || 0), 0)
}
function itemAnnualTax(item: WithholdingRecordItem): number {
  if (itemIsExempt(item)) return 0
  return MONTHS.reduce((s, m) => s + (item.monthly_data?.[String(m)]?.tax || 0), 0)
}

interface Props {
  clientId: string
  clientCode: string | null
  clientName: string
}

export default function WithholdingTaxTab({ clientId, clientCode, clientName }: Props) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [items, setItems] = useState<WithholdingRecordItem[]>([])
  const [recordId, setRecordId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [taxFeeMonthly, setTaxFeeMonthly] = useState<Record<string, number>>({})
  const [taxFeeTotal, setTaxFeeTotal] = useState(0)

  useEffect(() => { load() }, [year, clientId])

  async function load() {
    setLoading(true)
    const supabase = createClient()

    // 社労士等レコード読み込み
    let q = supabase.from('withholding_records').select('id').eq('year', year)
    if (clientCode) q = q.eq('client_code', clientCode)
    else q = q.eq('client_id', clientId)
    const { data: rec } = await q.maybeSingle()
    if (!rec) { setRecordId(null); setItems([]) }
    else {
      setRecordId(rec.id)
      const { data } = await supabase.from('withholding_record_items').select('*').eq('record_id', rec.id).order('sort_order')
      setItems(data || [])
    }

    // 月次進捗から税理士報酬を読み込み（年度ずれ対応：当年・前年の中で報酬がある方）
    let feeData: Record<string, string | number | null> | null = null
    for (const y of [year, year - 1]) {
      let fq = supabase.from('monthly_progress').select('monthly_fee').eq('year', y)
      if (clientCode) fq = fq.eq('client_code', clientCode)
      else fq = fq.eq('client_id', clientId)
      const { data: prog } = await fq.maybeSingle()
      if (prog?.monthly_fee) {
        const total = MONTHS.reduce((s, m) => s + parseFee((prog.monthly_fee as Record<string, string | null>)?.[String(m)]), 0)
        if (total > 0) { feeData = prog.monthly_fee as Record<string, string | null>; break }
      }
    }
    if (feeData) {
      const monthly: Record<string, number> = {}
      let total = 0
      for (const m of MONTHS) {
        const n = parseFee(feeData[String(m)])
        monthly[String(m)] = n
        total += n
      }
      setTaxFeeMonthly(monthly)
      setTaxFeeTotal(total)
    } else {
      setTaxFeeMonthly({})
      setTaxFeeTotal(0)
    }

    setLoading(false)
  }

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(item: WithholdingRecordItem) {
    setEditingId(item.id)
    setForm(itemToForm(item))
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    let recId = recordId
    if (!recId) {
      const { data: newRec, error } = await supabase
        .from('withholding_records')
        .insert({ client_id: clientId, client_code: clientCode, client_name: clientName, year })
        .select('id').single()
      if (error || !newRec) { alert('エラー: ' + error?.message); setSaving(false); return }
      recId = newRec.id
      setRecordId(recId)
    }

    const monthly_data: Record<string, unknown> = {}
    for (const m of MONTHS) {
      const d = form.monthly[String(m)]
      monthly_data[String(m)] = {
        date: d.date,
        gross: parseAmt(d.gross),
        tax: form.exempt ? 0 : parseAmt(d.tax),
      }
    }
    if (form.exempt) monthly_data._exempt = true

    const payload = {
      record_id: recId,
      payee_name: form.payee_name || null,
      payee_type: form.payee_type || null,
      monthly_data,
    }

    if (editingId) {
      const { error } = await supabase.from('withholding_record_items').update(payload).eq('id', editingId)
      if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('withholding_record_items').insert({ ...payload, sort_order: items.length })
      if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function deleteItem(id: string) {
    if (!confirm('この支払先を削除しますか？')) return
    const supabase = createClient()
    await supabase.from('withholding_record_items').delete().eq('id', id)
    load()
  }

  function setMonth(m: string, field: 'date' | 'gross' | 'tax', value: string) {
    setForm(f => ({ ...f, monthly: { ...f.monthly, [m]: { ...f.monthly[m], [field]: value } } }))
  }

  function autoCalcTax(m: string) {
    if (form.exempt) return
    if (form.monthly[m]?.tax) return  // 手入力済みの場合は上書きしない
    const gross = parseAmt(form.monthly[m]?.gross || '')
    if (!gross) return
    const tax = Math.floor(gross * 0.1021)
    setForm(f => ({ ...f, monthly: { ...f.monthly, [m]: { ...f.monthly[m], tax: String(tax) } } }))
  }

  const totalGross = items.reduce((s, it) => s + itemAnnualGross(it), 0)
  const totalTax = items.reduce((s, it) => s + itemAnnualTax(it), 0)
  const totalNet = totalGross - totalTax
  const reiwa = year - 2018

  function handlePrint() {
    const title = `源泉所得税集計　令和${reiwa}年（${year}年）　${clientName}`
    const monthHeaders = MONTHS.map(m => `<th colspan="2" class="mhd">${m}月</th>`).join('')
    const monthSubHeaders = MONTHS.map(() =>
      `<th class="num s">支払</th><th class="num s tax">源泉</th>`
    ).join('')
    const dataRows = items.map((item, idx) => {
      const gross = itemAnnualGross(item)
      const tax = itemAnnualTax(item)
      const exempt = itemIsExempt(item)
      const monthCells = MONTHS.map(m => {
        const d = item.monthly_data?.[String(m)]
        const g = d?.gross || 0, t = exempt ? 0 : (d?.tax || 0)
        return `<td class="num${g ? '' : ' zero'}">${g ? g.toLocaleString('ja-JP') : '—'}</td><td class="num tax${t ? '' : ' zero'}">${t ? t.toLocaleString('ja-JP') : '—'}</td>`
      }).join('')
      const bg = idx % 2 === 1 ? ' class="alt"' : ''
      const exemptBadge = exempt ? '（非対象）' : ''
      return `<tr${bg}>
        <td class="name">${item.payee_name || '—'}</td>
        <td class="kind">${item.payee_type || ''}${exemptBadge}</td>
        ${monthCells}
        <td class="total">${gross > 0 ? gross.toLocaleString('ja-JP') : '—'}</td>
        <td class="total tax">${!exempt && tax > 0 ? tax.toLocaleString('ja-JP') : '—'}</td>
        <td class="total net">${gross > 0 ? (gross - tax).toLocaleString('ja-JP') : '—'}</td>
      </tr>`
    }).join('')
    const footMonths = MONTHS.map(m => {
      const g = items.reduce((s, it) => s + (it.monthly_data?.[String(m)]?.gross || 0), 0)
      const t = items.reduce((s, it) => s + (itemIsExempt(it) ? 0 : (it.monthly_data?.[String(m)]?.tax || 0)), 0)
      return `<td class="num foot">${g > 0 ? g.toLocaleString('ja-JP') : ''}</td><td class="num tax foot">${t > 0 ? t.toLocaleString('ja-JP') : ''}</td>`
    }).join('')
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
    @page{size:A4 landscape;margin:8mm}
    *{box-sizing:border-box}
    body{font-family:'Meiryo',sans-serif;font-size:6.5pt;margin:0;padding:0}
    .hdr{margin-bottom:4px}
    .ttl{font-size:10pt;font-weight:bold}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #bbb;padding:1.5px 2px;vertical-align:middle;word-break:break-all;text-align:center}
    th{background:#e4e8f5;font-size:5.5pt}
    thead{display:table-header-group}
    .mhd{background:#d0d8f0}
    .s{font-size:5pt}
    .name{width:11%;text-align:left}.kind{width:5%}
    .num{width:3.5%;text-align:right;font-size:6pt}
    .zero{color:#ccc}.tax{color:#b00}.net{color:#006}
    .total{width:5.5%;text-align:right;font-weight:bold;font-size:6.5pt}
    .alt{background:#f8f9ff}
    tfoot td,.foot{background:#e8edf8;font-weight:bold}
    .grand{font-size:9.5pt;font-weight:bold;text-align:right;margin-top:6px;padding-top:4px;border-top:2px solid #333}
    </style>
    </head><body>
    <div class="hdr"><span class="ttl">${title}</span></div>
    <table>
      <thead>
        <tr>
          <th rowspan="2" class="name">支払先名</th>
          <th rowspan="2" class="kind">種別</th>
          ${monthHeaders}
          <th rowspan="2" class="total">年間<br>支払</th>
          <th rowspan="2" class="total tax">年間<br>源泉</th>
          <th rowspan="2" class="total net">差引<br>支払</th>
        </tr>
        <tr>${monthSubHeaders}</tr>
      </thead>
      <tbody>${dataRows}</tbody>
      <tfoot><tr>
        <td colspan="2" class="foot">合計（${items.length}件）</td>
        ${footMonths}
        <td class="total foot">${totalGross > 0 ? totalGross.toLocaleString('ja-JP') : ''}</td>
        <td class="total tax foot">${totalTax > 0 ? totalTax.toLocaleString('ja-JP') : ''}</td>
        <td class="total net foot">${totalNet > 0 ? totalNet.toLocaleString('ja-JP') : ''}</td>
      </tr></tfoot>
    </table>
    <div class="grand">総合計（${items.length}件）　支払：${totalGross.toLocaleString('ja-JP')}円　源泉：${totalTax.toLocaleString('ja-JP')}円　差引：${totalNet.toLocaleString('ja-JP')}円</div>
    <script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function handleExcel() {
    const rows: (string | number)[][] = []
    rows.push([`源泉集計　令和${reiwa}年（${year}年）　${clientName}`])
    rows.push([])
    const headers = ['支払先名', '種別',
      ...MONTHS.flatMap(m => [`${m}月支払日`, `${m}月支払金額`, `${m}月源泉税額`, `${m}月差引支払額`]),
      '年間支払金額', '年間源泉税額', '年間差引支払額']
    rows.push(headers)
    for (const item of items) {
      const gross = itemAnnualGross(item)
      const tax = itemAnnualTax(item)
      const exempt = itemIsExempt(item)
      rows.push([
        item.payee_name || '', `${item.payee_type || ''}${exempt ? '（非対象）' : ''}`,
        ...MONTHS.flatMap(m => {
          const d = item.monthly_data?.[String(m)]
          const g = d?.gross || 0, t = exempt ? 0 : (d?.tax || 0)
          return [d?.date || '', g, t, g - t]
        }),
        gross, tax, gross - tax,
      ])
    }
    rows.push([])
    rows.push(['総合計', '', ...Array(MONTHS.length * 4).fill(''), totalGross, totalTax, totalNet])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '源泉集計')
    XLSX.writeFile(wb, `源泉集計_令和${reiwa}年_${clientName}.xlsx`)
  }

  const formGross = MONTHS.reduce((s, m) => s + parseAmt(form.monthly[String(m)]?.gross || ''), 0)
  const formTax = form.exempt ? 0 : MONTHS.reduce((s, m) => s + parseAmt(form.monthly[String(m)]?.tax || ''), 0)

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden max-w-4xl">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-700">源泉集計</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm">
            {[2023, 2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>令和{y - 2018}年（{y}年）</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button onClick={handlePrint}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg border border-gray-300">
                <Printer size={12} /> 印刷
              </button>
              <button onClick={handleExcel}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                <Download size={12} /> Excel
              </button>
            </>
          )}
          <button onClick={openAdd}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
            <Plus size={12} /> 支払先追加
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">読み込み中...</div>
      ) : (
        <>
          {/* ── 社労士等 支払先一覧 ── */}
          {items.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">源泉集計データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                  <tr>
                    <th className="text-left px-4 py-2">支払先</th>
                    <th className="text-left px-4 py-2">種別</th>
                    <th className="text-right px-4 py-2">年間支払金額</th>
                    <th className="text-right px-4 py-2">年間源泉税額</th>
                    <th className="text-right px-4 py-2">差引支払額</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => {
                    const gross = itemAnnualGross(item)
                    const tax = itemAnnualTax(item)
                    const exempt = itemIsExempt(item)
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 group cursor-pointer" onClick={() => openEdit(item)}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{item.payee_name || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.payee_type && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                {item.payee_type}
                              </span>
                            )}
                            {exempt && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                源泉非対象
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                          {gross > 0 ? gross.toLocaleString('ja-JP') + '円' : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-red-600">
                          {!exempt && tax > 0 ? tax.toLocaleString('ja-JP') + '円' : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">
                          {gross > 0 ? (gross - tax).toLocaleString('ja-JP') + '円' : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button onClick={e => { e.stopPropagation(); deleteItem(item.id) }}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 font-bold text-gray-700 text-xs">
                      令和{year - 2018}年 合計
                    </td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-gray-800">
                      {totalGross > 0 ? totalGross.toLocaleString('ja-JP') + '円' : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-red-700">
                      {totalTax > 0 ? totalTax.toLocaleString('ja-JP') + '円' : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-bold font-mono text-gray-900">
                      {totalNet > 0 ? totalNet.toLocaleString('ja-JP') + '円' : '—'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── 税理士報酬（月次進捗より自動取得） ── */}
          {taxFeeTotal > 0 && (
            <div className="border-t border-indigo-100 bg-indigo-50/40">
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="text-xs font-medium text-indigo-700">税理士報酬（月次進捗から自動取得）</span>
                <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">源泉非対象</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-white/60">
                    <td className="px-4 py-2.5 font-medium text-indigo-800">和み税理士法人</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">税理士</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                      {taxFeeTotal.toLocaleString('ja-JP')}円
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-400">—</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-800">
                      {taxFeeTotal.toLocaleString('ja-JP')}円
                    </td>
                    <td className="w-10"></td>
                  </tr>
                </tbody>
              </table>
              <div className="px-4 pb-2.5">
                <div className="flex gap-3 text-xs text-indigo-600">
                  {MONTHS.map(m => taxFeeMonthly[String(m)] > 0 ? (
                    <span key={m}>{m}月: {taxFeeMonthly[String(m)].toLocaleString('ja-JP')}円</span>
                  ) : null)}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 追加・編集モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-gray-800">{editingId ? '支払先編集' : '支払先追加'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">支払先名</label>
                  <input className={ic} value={form.payee_name}
                    onChange={e => setForm(f => ({ ...f, payee_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">種別</label>
                  <select className={ic} value={form.payee_type}
                    onChange={e => setForm(f => ({ ...f, payee_type: e.target.value }))}>
                    {PAYEE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* 源泉対象/非対象トグル */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-500">源泉徴収</span>
                <button
                  onClick={() => setForm(f => ({ ...f, exempt: false }))}
                  className={`px-4 py-1.5 text-xs rounded-full font-medium border transition-colors ${!form.exempt ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
                  源泉対象（10.21%）
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, exempt: true }))}
                  className={`px-4 py-1.5 text-xs rounded-full font-medium border transition-colors ${form.exempt ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}>
                  源泉非対象
                </button>
              </div>

              {/* 月次グリッド */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">月次支払</label>
                  {!form.exempt && (
                    <span className="text-xs text-gray-400">支払金額入力後、源泉欄をクリックで自動計算（10.21%）</span>
                  )}
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-400">
                      <tr>
                        <th className="px-2 py-1.5 text-center w-10">月</th>
                        <th className="px-2 py-1.5 text-center w-24">支払日</th>
                        <th className="px-2 py-1.5 text-center">支払金額</th>
                        <th className={`px-2 py-1.5 text-center ${form.exempt ? 'text-gray-300' : ''}`}>源泉税額</th>
                        <th className="px-2 py-1.5 text-center w-28">差引支払額</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTHS.map(m => {
                        const gross = parseAmt(form.monthly[String(m)]?.gross || '')
                        const tax = form.exempt ? 0 : parseAmt(form.monthly[String(m)]?.tax || '')
                        const net = gross - tax
                        return (
                          <tr key={m} className={m % 2 === 0 ? 'bg-gray-50/50' : ''}>
                            <td className="px-2 py-0.5 text-center text-xs text-gray-500 font-medium">{m}月</td>
                            <td className="px-1 py-0.5">
                              <input className="border border-gray-200 rounded px-1.5 py-1 text-xs text-center w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                                value={form.monthly[String(m)]?.date || ''}
                                onChange={e => setMonth(String(m), 'date', zen2han(e.target.value))}
                                placeholder="1/25" />
                            </td>
                            <td className="px-1 py-0.5">
                              <input className="border border-gray-200 rounded px-1.5 py-1 text-xs text-right w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                                value={fmtAmt(form.monthly[String(m)]?.gross || '')}
                                onChange={e => setMonth(String(m), 'gross', sanitizeAmt(e.target.value))}
                                placeholder="0" />
                            </td>
                            <td className="px-1 py-0.5">
                              {form.exempt ? (
                                <div className="border border-gray-100 bg-gray-50 rounded px-1.5 py-1 text-xs text-right w-full text-gray-300">
                                  —
                                </div>
                              ) : (
                                <input className="border border-gray-200 rounded px-1.5 py-1 text-xs text-right w-full focus:outline-none focus:ring-1 focus:ring-blue-400 text-red-600"
                                  value={fmtAmt(form.monthly[String(m)]?.tax || '')}
                                  onChange={e => setMonth(String(m), 'tax', sanitizeAmt(e.target.value))}
                                  onFocus={() => autoCalcTax(String(m))}
                                  placeholder="0" />
                              )}
                            </td>
                            <td className="px-2 py-0.5 text-right text-xs font-mono text-gray-600">
                              {net > 0 ? net.toLocaleString('ja-JP') : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 合計プレビュー */}
              <div className={`rounded-lg px-4 py-2.5 ${form.exempt ? 'bg-gray-50' : 'bg-indigo-50'}`}>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xs text-indigo-400 mb-0.5">年間支払合計</div>
                    <div className="font-bold text-indigo-700 text-sm">{formGross.toLocaleString('ja-JP')}円</div>
                  </div>
                  <div>
                    <div className={`text-xs mb-0.5 ${form.exempt ? 'text-gray-400' : 'text-red-400'}`}>年間源泉税合計</div>
                    <div className={`font-bold text-sm ${form.exempt ? 'text-gray-400' : 'text-red-600'}`}>
                      {form.exempt ? '非対象' : `${formTax.toLocaleString('ja-JP')}円`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-0.5">差引支払合計</div>
                    <div className="font-bold text-gray-800 text-sm">{(formGross - formTax).toLocaleString('ja-JP')}円</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-5">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={save} disabled={saving}
                className="px-6 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
