'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FileText, Search } from 'lucide-react'

interface PaymentSummary {
  client_id: string | null
  client_code: string
  client_name: string
  report_id: string
  item_count: number
  total: number
}

export default function PaymentReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [summaries, setSummaries] = useState<PaymentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: reports } = await supabase
      .from('payment_reports')
      .select('id, client_code, client_name, client_id')
      .eq('year', year)
      .order('client_name')

    if (!reports || reports.length === 0) { setSummaries([]); setLoading(false); return }

    // client_idがnullのレコードはclient_codeでclientsテーブルからIDを補完
    const missingCodes = reports.filter(r => !r.client_id && r.client_code).map(r => r.client_code)
    const codeToId: Record<string, string> = {}
    if (missingCodes.length > 0) {
      const { data: clients } = await supabase.from('clients').select('id, code').in('code', missingCodes)
      for (const c of (clients || [])) codeToId[c.code] = c.id
    }

    const reportIds = reports.map(r => r.id)
    const { data: items } = await supabase
      .from('payment_report_items')
      .select('report_id, monthly_data, renewal_amount, key_money_amount')
      .in('report_id', reportIds)

    const summaryMap: Record<string, { count: number; total: number }> = {}
    for (const item of (items || [])) {
      if (!summaryMap[item.report_id]) summaryMap[item.report_id] = { count: 0, total: 0 }
      summaryMap[item.report_id].count++
      const entries = Object.values(item.monthly_data || {}) as { date: string; amount: number }[]
      const monthlyTotal = entries.reduce((s, d) => s + (d.amount || 0), 0)
      summaryMap[item.report_id].total += monthlyTotal + (item.renewal_amount || 0) + (item.key_money_amount || 0)
    }

    setSummaries(reports.map(r => ({
      client_id: r.client_id || (r.client_code ? codeToId[r.client_code] || null : null),
      client_code: r.client_code || '',
      client_name: r.client_name,
      report_id: r.id,
      item_count: summaryMap[r.id]?.count || 0,
      total: summaryMap[r.id]?.total || 0,
    })))
    setLoading(false)
  }

  const filtered = summaries.filter(s => !filter || s.client_name.includes(filter))
  const grandTotal = filtered.reduce((s, r) => s + r.total, 0)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">支払調書</h1>
      <p className="text-xs text-gray-500 mb-5">不動産使用料等の支払調書</p>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>令和{y - 2018}年（{y}年）</option>
          ))}
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-48"
            placeholder="顧客名で絞り込み" value={filter}
            onChange={e => setFilter(e.target.value)} />
        </div>
        <div className="ml-auto text-sm text-gray-500">
          年間支払合計：<span className="font-bold text-gray-900 ml-1">{grandTotal.toLocaleString('ja-JP')}円</span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText size={32} className="mx-auto mb-2 text-gray-300" />
            <p>データがありません</p>
            <p className="text-xs mt-1">顧客カルテの「支払調書」タブから入力してください</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b">
              <tr>
                <th className="px-4 py-3 text-left">顧客名</th>
                <th className="px-4 py-3 text-left w-24">顧客コード</th>
                <th className="px-4 py-3 text-right w-20">物件数</th>
                <th className="px-4 py-3 text-right w-40">年間支払合計</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => (
                <tr key={s.report_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {s.client_id ? (
                      <Link href={`/clients/${s.client_id}`}
                        className="font-medium text-blue-600 hover:underline flex items-center gap-1.5">
                        <FileText size={14} className="text-blue-400" />
                        {s.client_name}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-700 flex items-center gap-1.5">
                        <FileText size={14} className="text-gray-400" />
                        {s.client_name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{s.client_code}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{s.item_count}件</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-800">
                    {s.total > 0 ? s.total.toLocaleString('ja-JP') + '円' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-bold text-gray-700 text-xs">
                  合計（{filtered.length}社）
                </td>
                <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                  {grandTotal.toLocaleString('ja-JP')}円
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
