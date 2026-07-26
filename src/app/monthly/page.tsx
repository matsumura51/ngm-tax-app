'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { MonthlyProgress } from '@/lib/types'
import { Plus, Search } from 'lucide-react'

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

export default function MonthlyPage() {
  const [records, setRecords] = useState<MonthlyProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()
  }, [year])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('monthly_progress')
      .select('*')
      .eq('year', year)
      .order('client_code')
    setRecords(data || [])
    setLoading(false)
  }

  const filtered = records.filter(r =>
    r.client_name?.includes(search) || r.client_code?.includes(search)
  )

  const currentMonth = new Date().getMonth() + 1

  function getStatus(r: MonthlyProgress, month: string) {
    const m = month
    const report = r.monthly_report?.[m]
    const completion = r.monthly_completion?.[m]
    const contact = r.monthly_contact?.[m]
    if (report) return 'done'
    if (completion) return 'complete'
    if (contact) return 'progress'
    return 'none'
  }

  const statusColor = {
    done: 'bg-green-500',
    complete: 'bg-blue-400',
    progress: 'bg-yellow-400',
    none: 'bg-gray-100',
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">月次進捗表</h1>
        <Link
          href="/monthly/new"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> 新規登録
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}年度</option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="顧客名・コードで検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm w-64"
          />
        </div>
        <span className="text-sm text-gray-500">{filtered.length}件</span>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">顧客名</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">担当</th>
              <th className="px-2 py-3 text-left font-semibold text-gray-600">消費税</th>
              {MONTHS.map(m => (
                <th
                  key={m}
                  className={`px-2 py-3 text-center font-semibold w-10 ${
                    String(currentMonth) === m ? 'text-blue-600' : 'text-gray-600'
                  }`}
                >
                  {m}月
                </th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={20} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={20} className="text-center py-8 text-gray-400">データがありません</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white px-4 py-2.5 whitespace-nowrap">
                  <div className="font-medium">{r.client_name}</div>
                  <div className="text-xs text-gray-400">{r.client_code}</div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{r.primary_staff}</td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{r.consumption_tax}</span>
                </td>
                {MONTHS.map(m => {
                  const status = getStatus(r, m)
                  return (
                    <td key={m} className="px-2 py-2.5 text-center">
                      <div
                        className={`w-5 h-5 rounded-full mx-auto ${statusColor[status]}`}
                        title={status === 'done' ? '完了' : status === 'complete' ? '月次完成' : status === 'progress' ? '進行中' : '未着手'}
                      />
                    </td>
                  )
                })}
                <td className="px-3 py-2.5 text-center">
                  <Link href={`/monthly/${r.id}`} className="text-blue-600 hover:underline text-xs">詳細</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> 報告済</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> 月次完成</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> 進行中</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-100 inline-block border" /> 未着手</span>
      </div>
    </div>
  )
}
