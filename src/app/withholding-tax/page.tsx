'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Search, Landmark } from 'lucide-react'

interface Summary {
  client_id: string | null
  client_code: string
  client_name: string
  record_id: string
  item_count: number
  total_gross: number
  total_tax: number
}

interface TaxFeeRow {
  client_code: string
  client_name: string
  monthly: Record<string, number>
  total: number
  year: number
}

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12']

function parseFee(s: string | number | null | undefined): number {
  if (s === null || s === undefined || s === '') return 0
  if (typeof s === 'number') return s
  const n = parseInt(String(s).replace(/,/g, ''), 10)
  return isNaN(n) ? 0 : n
}

export default function WithholdingTaxPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [tab, setTab] = useState<'社労士等' | '税理士報酬'>('社労士等')
  const [summaries, setSummaries] = useState<Summary[]>([])
  const [taxFees, setTaxFees] = useState<TaxFeeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (tab === '社労士等') loadWithholding()
    else loadTaxFees()
  }, [year, tab])

  async function loadWithholding() {
    setLoading(true)
    const supabase = createClient()
    // 当年・前年の2年分を取得し、クライアントごとに最新年を採用
    const { data: records } = await supabase
      .from('withholding_records')
      .select('id, client_code, client_name, client_id, year')
      .in('year', [year, year - 1])
      .order('year', { ascending: false })
      .order('client_name')

    if (!records || records.length === 0) { setSummaries([]); setLoading(false); return }

    // 同一client_codeで複数年ある場合は最新年のみ残す
    const seenCodes = new Set<string>()
    const deduped = records.filter(r => {
      const key = r.client_code || r.client_name
      if (seenCodes.has(key)) return false
      seenCodes.add(key)
      return true
    })

    // client_idがnullのレコードはclient_codeでclientsテーブルからIDを補完
    const missingCodes = deduped.filter(r => !r.client_id && r.client_code).map(r => r.client_code)
    const codeToId: Record<string, string> = {}
    if (missingCodes.length > 0) {
      const { data: clients } = await supabase.from('clients').select('id, code').in('code', missingCodes)
      for (const c of (clients || [])) codeToId[c.code] = c.id
    }

    const recordIds = deduped.map(r => r.id)
    const { data: items } = await supabase
      .from('withholding_record_items')
      .select('record_id, monthly_data')
      .in('record_id', recordIds)

    const sumMap: Record<string, { count: number; gross: number; tax: number }> = {}
    for (const item of (items || [])) {
      if (!sumMap[item.record_id]) sumMap[item.record_id] = { count: 0, gross: 0, tax: 0 }
      sumMap[item.record_id].count++
      const entries = Object.values(item.monthly_data || {}) as { date: string; gross: number; tax: number }[]
      for (const e of entries) {
        sumMap[item.record_id].gross += e.gross || 0
        sumMap[item.record_id].tax += e.tax || 0
      }
    }

    setSummaries(deduped.map(r => ({
      client_id: r.client_id || (r.client_code ? codeToId[r.client_code] || null : null),
      client_code: r.client_code || '',
      client_name: r.client_name,
      record_id: r.id,
      item_count: sumMap[r.id]?.count || 0,
      total_gross: sumMap[r.id]?.gross || 0,
      total_tax: sumMap[r.id]?.tax || 0,
    })))
    setLoading(false)
  }

  async function loadTaxFees() {
    setLoading(true)
    const supabase = createClient()
    // 年フィルターなし・全期間取得（月次進捗のyearと選択年がずれる場合に対応）
    const { data } = await supabase
      .from('monthly_progress')
      .select('client_code, client_name, monthly_fee, year')
      .gte('year', 2020)
      .order('year', { ascending: false })

    // client_codeごとに「報酬合計が最大のレコード」を採用
    const bestMap: Record<string, { client_name: string; monthly: Record<string, number>; total: number; year: number }> = {}

    for (const p of (data || [])) {
      const feeObj: Record<string, string | number | null> = (p.monthly_fee as Record<string, string | number | null>) || {}
      const monthly: Record<string, number> = {}
      let total = 0
      for (const m of MONTHS) {
        const amt = parseFee(feeObj[m])
        monthly[m] = amt
        total += amt
      }
      if (total === 0) continue
      const existing = bestMap[p.client_code]
      if (!existing || total > existing.total) {
        bestMap[p.client_code] = { client_name: p.client_name, monthly, total, year: p.year }
      }
    }

    const rows: TaxFeeRow[] = Object.entries(bestMap)
      .map(([client_code, v]) => ({ client_code, ...v }))
      .sort((a, b) => a.client_code.localeCompare(b.client_code))

    setTaxFees(rows)
    setLoading(false)
  }

  const filteredSummaries = summaries.filter(s => !filter || s.client_name.includes(filter))
  const filteredFees = taxFees.filter(r => !filter || r.client_name.includes(filter))
  const grandGross = filteredSummaries.reduce((s, r) => s + r.total_gross, 0)
  const grandTax = filteredSummaries.reduce((s, r) => s + r.total_tax, 0)
  const grandFeeTotal = filteredFees.reduce((s, r) => s + r.total, 0)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">源泉集計</h1>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>令和{y - 2018}年（{y}年）</option>
          ))}
        </select>
        <div className="flex rounded-lg overflow-hidden border border-gray-300 text-sm">
          {(['社労士等', '税理士報酬'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 ${tab === t ? 'bg-blue-600 text-white font-medium' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-48"
            placeholder="顧客名で絞り込み" value={filter}
            onChange={e => setFilter(e.target.value)} />
        </div>
        {tab === '社労士等' && (
          <div className="ml-auto flex gap-6 text-sm">
            <span className="text-gray-500">
              年間支払合計：<span className="font-bold text-gray-900 ml-1">{grandGross.toLocaleString('ja-JP')}円</span>
            </span>
            <span className="text-gray-500">
              年間源泉合計：<span className="font-bold text-red-600 ml-1">{grandTax.toLocaleString('ja-JP')}円</span>
            </span>
          </div>
        )}
        {tab === '税理士報酬' && (
          <div className="ml-auto text-sm text-gray-500">
            年間報酬合計：<span className="font-bold text-gray-900 ml-1">{grandFeeTotal.toLocaleString('ja-JP')}円</span>
          </div>
        )}
      </div>

      {/* ─── 社労士等タブ ─── */}
      {tab === '社労士等' && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-gray-400">読み込み中...</div>
          ) : filteredSummaries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Landmark size={32} className="mx-auto mb-2 text-gray-300" />
              <p>データがありません</p>
              <p className="text-xs mt-1">顧客カルテの「源泉集計」タブから入力してください</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">顧客名</th>
                  <th className="px-4 py-3 text-left w-24">顧客コード</th>
                  <th className="px-4 py-3 text-right w-20">支払先数</th>
                  <th className="px-4 py-3 text-right w-40">年間支払金額</th>
                  <th className="px-4 py-3 text-right w-40">年間源泉税額</th>
                  <th className="px-4 py-3 text-right w-40">差引支払額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSummaries.map(s => (
                  <tr key={s.record_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {s.client_id ? (
                        <Link href={`/clients/${s.client_id}`}
                          className="font-medium text-blue-600 hover:underline flex items-center gap-1.5">
                          <Landmark size={14} className="text-blue-400" />
                          {s.client_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-700 flex items-center gap-1.5">
                          <Landmark size={14} className="text-gray-400" />
                          {s.client_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500 text-xs">{s.client_code}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{s.item_count}件</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {s.total_gross > 0 ? s.total_gross.toLocaleString('ja-JP') + '円' : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-red-600 font-bold">
                      {s.total_tax > 0 ? s.total_tax.toLocaleString('ja-JP') + '円' : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">
                      {s.total_gross > 0 ? (s.total_gross - s.total_tax).toLocaleString('ja-JP') + '円' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-700 text-xs">
                    合計（{filteredSummaries.length}社）
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                    {grandGross.toLocaleString('ja-JP')}円
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-red-700">
                    {grandTax.toLocaleString('ja-JP')}円
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                    {(grandGross - grandTax).toLocaleString('ja-JP')}円
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ─── 税理士報酬タブ ─── */}
      {tab === '税理士報酬' && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-3 flex items-center gap-3">
            <span className="font-bold text-indigo-700 text-sm">税理士報酬の支払調書</span>
            <span className="text-xs text-gray-500">受取人：和み税理士法人　— 月次進捗表の報酬から自動集計</span>
          </div>
          {loading ? (
            <div className="text-center py-12 text-gray-400">読み込み中...</div>
          ) : filteredFees.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Landmark size={32} className="mx-auto mb-2 text-gray-300" />
              <p>報酬データがありません</p>
              <p className="text-xs mt-1">月次進捗表の「報酬」列に入力すると自動で反映されます</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">顧客名</th>
                    {MONTHS.map(m => (
                      <th key={m} className="px-2 py-2 text-right font-medium w-20">{m}月</th>
                    ))}
                    <th className="px-3 py-2 text-right font-bold w-28">年間合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredFees.map(r => (
                    <tr key={r.client_code} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                        {r.client_name}
                        <span className="ml-1.5 text-gray-400 font-mono text-[10px]">{r.client_code}</span>
                      </td>
                      {MONTHS.map(m => (
                        <td key={m} className="px-2 py-2 text-right tabular-nums text-gray-600">
                          {r.monthly[m] > 0 ? r.monthly[m].toLocaleString('ja-JP') : ''}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900">
                        {r.total.toLocaleString('ja-JP')}円
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                  <tr>
                    <td className="px-3 py-2 font-bold text-gray-700">
                      合計（{filteredFees.length}社）
                    </td>
                    {MONTHS.map(m => (
                      <td key={m} className="px-2 py-2 text-right tabular-nums font-medium text-gray-700">
                        {(() => {
                          const s = filteredFees.reduce((sum, r) => sum + r.monthly[m], 0)
                          return s > 0 ? s.toLocaleString('ja-JP') : ''
                        })()}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900">
                      {grandFeeTotal.toLocaleString('ja-JP')}円
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
