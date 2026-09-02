'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, Trash2, Printer, Download } from 'lucide-react'
import { PaymentReportItem } from '@/lib/types'
import * as XLSX from 'xlsx'

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const PROPERTY_USES = ['事務所', '工場', '事務所・工場', '社宅', '店舗', '倉庫', '駐車場', 'その他']
const ic = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full'

// 全角→半角変換
function zen2han(str: string): string {
  return str
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/／/g, '/').replace(/：/g, ':').replace(/－|ー|−/g, '-')
    .replace(/　/g, ' ')
}
// 金額入力: 全角→半角 + 数字のみ抽出
function sanitizeAmt(str: string): string {
  return zen2han(str).replace(/[^0-9]/g, '')
}
// 金額表示: カンマ付き
function fmtAmt(raw: string): string {
  if (!raw) return ''
  const n = parseInt(raw)
  return isNaN(n) ? '' : n.toLocaleString('ja-JP')
}

type MonthData = { date: string; amount: string }
type FormData = {
  payee_name: string
  payee_address: string
  property_address: string
  property_use: string
  monthly: Record<string, MonthData>
  renewal_date: string
  renewal_amount: string
  key_money_date: string
  key_money_amount: string
}

function emptyForm(): FormData {
  return {
    payee_name: '', payee_address: '', property_address: '', property_use: '',
    monthly: Object.fromEntries(MONTHS.map(m => [String(m), { date: '', amount: '' }])),
    renewal_date: '', renewal_amount: '', key_money_date: '', key_money_amount: '',
  }
}

function itemToForm(item: PaymentReportItem): FormData {
  const monthly: Record<string, MonthData> = {}
  for (const m of MONTHS) {
    const d = item.monthly_data?.[String(m)]
    monthly[String(m)] = { date: d?.date || '', amount: d?.amount ? String(d.amount) : '' }
  }
  return {
    payee_name: item.payee_name || '',
    payee_address: item.payee_address || '',
    property_address: item.property_address || '',
    property_use: item.property_use || '',
    monthly,
    renewal_date: item.renewal_date || '',
    renewal_amount: item.renewal_amount ? String(item.renewal_amount) : '',
    key_money_date: item.key_money_date || '',
    key_money_amount: item.key_money_amount ? String(item.key_money_amount) : '',
  }
}

function parseAmt(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, '') || '0') || 0
}

function calcFormTotal(form: FormData): number {
  const monthly = MONTHS.reduce((s, m) => s + parseAmt(form.monthly[String(m)]?.amount || ''), 0)
  return monthly + parseAmt(form.renewal_amount) + parseAmt(form.key_money_amount)
}

function itemTotal(item: PaymentReportItem): number {
  const monthly = Object.values(item.monthly_data || {}).reduce((s, d) => s + (d.amount || 0), 0)
  return monthly + (item.renewal_amount || 0) + (item.key_money_amount || 0)
}

interface Props {
  clientId: string
  clientCode: string | null
  clientName: string
}

export default function PaymentReportTab({ clientId, clientCode, clientName }: Props) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [items, setItems] = useState<PaymentReportItem[]>([])
  const [reportId, setReportId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [year, clientId])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    let q = supabase.from('payment_reports').select('id').eq('year', year)
    if (clientCode) q = q.eq('client_code', clientCode)
    else q = q.eq('client_id', clientId)
    const { data: rep } = await q.maybeSingle()
    if (!rep) { setReportId(null); setItems([]); setLoading(false); return }
    setReportId(rep.id)
    const { data } = await supabase.from('payment_report_items').select('*').eq('report_id', rep.id).order('sort_order')
    setItems(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(item: PaymentReportItem) {
    setEditingId(item.id)
    setForm(itemToForm(item))
    setModalOpen(true)
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    let repId = reportId
    if (!repId) {
      const { data: newRep, error } = await supabase
        .from('payment_reports')
        .insert({ client_id: clientId, client_code: clientCode, client_name: clientName, year })
        .select('id').single()
      if (error || !newRep) { alert('エラー: ' + error?.message); setSaving(false); return }
      repId = newRep.id
      setReportId(repId)
    }

    const monthly_data: Record<string, { date: string; amount: number }> = {}
    for (const m of MONTHS) {
      const d = form.monthly[String(m)]
      monthly_data[String(m)] = { date: d.date, amount: parseAmt(d.amount) }
    }

    const payload = {
      report_id: repId,
      payee_name: form.payee_name || null,
      payee_address: form.payee_address || null,
      property_address: form.property_address || null,
      property_use: form.property_use || null,
      monthly_data,
      renewal_date: form.renewal_date || null,
      renewal_amount: parseAmt(form.renewal_amount),
      key_money_date: form.key_money_date || null,
      key_money_amount: parseAmt(form.key_money_amount),
    }

    if (editingId) {
      const { error } = await supabase.from('payment_report_items').update(payload).eq('id', editingId)
      if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('payment_report_items').insert({ ...payload, sort_order: items.length })
      if (error) { alert('保存エラー: ' + error.message); setSaving(false); return }
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function deleteItem(id: string) {
    if (!confirm('この物件を削除しますか？')) return
    const supabase = createClient()
    await supabase.from('payment_report_items').delete().eq('id', id)
    load()
  }

  function setMonth(m: string, field: 'date' | 'amount', value: string) {
    setForm(f => ({ ...f, monthly: { ...f.monthly, [m]: { ...f.monthly[m], [field]: value } } }))
  }

  const grandTotal = items.reduce((s, item) => s + itemTotal(item), 0)
  const reiwa = year - 2018

  function handlePrint() {
    const title = `不動産使用料等の支払調書　令和${reiwa}年（${year}年）　${clientName}`

    const monthHeaders = MONTHS.map(m => `<th class="num">${m}月</th>`).join('')
    const dataRows = items.map((item, idx) => {
      const monthCells = MONTHS.map(m => {
        const d = item.monthly_data?.[String(m)]
        if (!d?.amount) return '<td class="num zero">—</td>'
        return `<td class="num">${d.amount.toLocaleString('ja-JP')}<br><span class="dt">${d.date || ''}</span></td>`
      }).join('')
      const renewal = item.renewal_amount ? item.renewal_amount.toLocaleString('ja-JP') : '—'
      const keyMoney = item.key_money_amount ? item.key_money_amount.toLocaleString('ja-JP') : '—'
      const bg = idx % 2 === 1 ? ' class="alt"' : ''
      return `<tr${bg}>
        <td class="name">${item.payee_name || '—'}<br><span class="dt">${item.payee_address || ''}</span></td>
        <td class="addr">${item.property_address || '—'}</td>
        <td class="use">${item.property_use || ''}</td>
        ${monthCells}
        <td class="num">${renewal}</td>
        <td class="num">${keyMoney}</td>
        <td class="total">${itemTotal(item).toLocaleString('ja-JP')}</td>
      </tr>`
    }).join('')

    const footCells = MONTHS.map(m => {
      const s = items.reduce((acc, item) => acc + (item.monthly_data?.[String(m)]?.amount || 0), 0)
      return `<td class="num foot">${s > 0 ? s.toLocaleString('ja-JP') : ''}</td>`
    }).join('')
    const totalRenewal = items.reduce((s, it) => s + (it.renewal_amount || 0), 0)
    const totalKeyMoney = items.reduce((s, it) => s + (it.key_money_amount || 0), 0)

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
    @page{size:A4 landscape;margin:8mm}
    *{box-sizing:border-box}
    body{font-family:'Meiryo',sans-serif;font-size:7.5pt;margin:0;padding:0}
    .hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
    .ttl{font-size:10pt;font-weight:bold}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #bbb;padding:2px 3px;vertical-align:top;word-break:break-all}
    th{background:#e8ecf5;font-size:6.5pt;text-align:center}
    thead{display:table-header-group}
    .name{width:13%}.addr{width:12%}.use{width:4%}.num{width:4.5%;text-align:right}.total{width:6%;text-align:right;font-weight:bold}
    .alt{background:#fafbff}.zero{color:#ccc}
    .dt{font-size:6pt;color:#666;display:block}
    tfoot td,.foot{background:#f0f3fb;font-weight:bold}
    .grand{font-size:10pt;font-weight:bold;text-align:right;margin-top:6px;padding-top:4px;border-top:2px solid #333}
    </style>
    </head><body>
    <div class="hdr"><span class="ttl">${title}</span></div>
    <table>
      <thead><tr>
        <th class="name">支払先名・住所</th>
        <th class="addr">物件所在地</th>
        <th class="use">用途</th>
        ${monthHeaders}
        <th class="num">更新料</th>
        <th class="num">礼金</th>
        <th class="total">合計（円）</th>
      </tr></thead>
      <tbody>${dataRows}</tbody>
      <tfoot><tr>
        <td colspan="3" class="foot">合計（${items.length}件）</td>
        ${footCells}
        <td class="num foot">${totalRenewal > 0 ? totalRenewal.toLocaleString('ja-JP') : ''}</td>
        <td class="num foot">${totalKeyMoney > 0 ? totalKeyMoney.toLocaleString('ja-JP') : ''}</td>
        <td class="total foot">${grandTotal.toLocaleString('ja-JP')}</td>
      </tr></tfoot>
    </table>
    <script>window.onload=function(){window.print()}<\/script></body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function handleExcel() {
    const rows: (string | number)[][] = []
    rows.push([`支払調書　令和${reiwa}年（${year}年）　${clientName}`])
    rows.push([])
    const headers = ['支払先名', '支払先住所', '物件所在地', '物件用途',
      ...MONTHS.flatMap(m => [`${m}月支払日`, `${m}月金額`]),
      '更新料支払日', '更新料', '礼金支払日', '礼金', '合計']
    rows.push(headers)
    for (const item of items) {
      rows.push([
        item.payee_name || '', item.payee_address || '',
        item.property_address || '', item.property_use || '',
        ...MONTHS.flatMap(m => {
          const d = item.monthly_data?.[String(m)]
          return [d?.date || '', d?.amount || 0]
        }),
        item.renewal_date || '', item.renewal_amount || 0,
        item.key_money_date || '', item.key_money_amount || 0,
        itemTotal(item),
      ])
    }
    rows.push([])
    rows.push(['総合計', '', '', '', ...Array(MONTHS.length * 2 + 4).fill(''), grandTotal])
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '支払調書')
    XLSX.writeFile(wb, `支払調書_令和${reiwa}年_${clientName}.xlsx`)
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden max-w-4xl">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-700">支払調書</span>
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
            <Plus size={12} /> 物件追加
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">読み込み中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-gray-400">支払調書データがありません</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b">
              <tr>
                <th className="text-left px-4 py-2">支払先</th>
                <th className="text-left px-4 py-2">物件所在地</th>
                <th className="text-left px-4 py-2">用途</th>
                <th className="text-right px-4 py-2">年間合計</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 group cursor-pointer" onClick={() => openEdit(item)}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{item.payee_name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 text-xs">{item.property_address || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{item.property_use || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">
                    {itemTotal(item) > 0 ? itemTotal(item).toLocaleString('ja-JP') + '円' : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={e => { e.stopPropagation(); deleteItem(item.id) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-4 py-2 font-bold text-gray-700 text-xs">
                  令和{reiwa}年 総合計
                </td>
                <td className="px-4 py-2 text-right font-bold font-mono text-gray-800">
                  {grandTotal > 0 ? grandTotal.toLocaleString('ja-JP') + '円' : '—'}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 追加・編集モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-gray-800">{editingId ? '物件編集' : '物件追加'}</h3>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">物件用途</label>
                  <input className={ic} value={form.property_use}
                    onChange={e => setForm(f => ({ ...f, property_use: e.target.value }))}
                    placeholder="事務所・工場、社宅 など"
                    list="prop-use-list" />
                  <datalist id="prop-use-list">
                    {PROPERTY_USES.map(u => <option key={u} value={u} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">支払先住所</label>
                <input className={ic} value={form.payee_address}
                  onChange={e => setForm(f => ({ ...f, payee_address: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">物件所在地</label>
                <input className={ic} value={form.property_address}
                  onChange={e => setForm(f => ({ ...f, property_address: e.target.value }))} />
              </div>

              {/* 月次支払グリッド */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">月次支払</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-400">
                      <tr>
                        <th className="px-3 py-1.5 text-center w-10">月</th>
                        <th className="px-2 py-1.5 text-center w-28">支払日</th>
                        <th className="px-2 py-1.5 text-center">金額（円）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTHS.map(m => (
                        <tr key={m} className={m % 2 === 0 ? 'bg-gray-50/50' : ''}>
                          <td className="px-3 py-0.5 text-center text-xs text-gray-500 font-medium">{m}月</td>
                          <td className="px-1 py-0.5">
                            <input className="border border-gray-200 rounded px-2 py-1 text-xs text-center w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                              value={form.monthly[String(m)]?.date || ''}
                              onChange={e => setMonth(String(m), 'date', zen2han(e.target.value))}
                              placeholder="例: 12/25" />
                          </td>
                          <td className="px-1 py-0.5">
                            <input className="border border-gray-200 rounded px-2 py-1 text-xs text-right w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                              value={fmtAmt(form.monthly[String(m)]?.amount || '')}
                              onChange={e => setMonth(String(m), 'amount', sanitizeAmt(e.target.value))}
                              placeholder="0" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 更新料・礼金 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">更新料</label>
                  <div className="flex gap-1.5">
                    <input className="border border-gray-300 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={form.renewal_date}
                      onChange={e => setForm(f => ({ ...f, renewal_date: zen2han(e.target.value) }))}
                      placeholder="支払日" />
                    <input className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={fmtAmt(form.renewal_amount)}
                      onChange={e => setForm(f => ({ ...f, renewal_amount: sanitizeAmt(e.target.value) }))}
                      placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">礼金</label>
                  <div className="flex gap-1.5">
                    <input className="border border-gray-300 rounded px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={form.key_money_date}
                      onChange={e => setForm(f => ({ ...f, key_money_date: zen2han(e.target.value) }))}
                      placeholder="支払日" />
                    <input className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={fmtAmt(form.key_money_amount)}
                      onChange={e => setForm(f => ({ ...f, key_money_amount: sanitizeAmt(e.target.value) }))}
                      placeholder="0" />
                  </div>
                </div>
              </div>

              {/* 合計プレビュー */}
              <div className="bg-blue-50 rounded-lg px-4 py-2 text-right">
                <span className="text-xs text-blue-400 mr-2">合計（プレビュー）</span>
                <span className="font-bold text-blue-700">
                  {calcFormTotal(form).toLocaleString('ja-JP')}円
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 pb-5">
              {editingId && (
                <button onClick={async () => { if (confirm('この物件を削除しますか？')) { await deleteItem(editingId); setModalOpen(false) } }}
                  className="mr-auto px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50">
                  削除
                </button>
              )}
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 ml-auto">
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
