'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { DailyReport } from '@/lib/types'
import { Plus, ChevronRight } from 'lucide-react'

export default function DailyReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('daily_reports')
      .select('*')
      .order('date', { ascending: false })
      .limit(50)
    setReports(data || [])
    setLoading(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">日報</h1>
        <Link
          href="/daily-reports/new"
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> 新規作成
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-400">日報がありません</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {reports.map(r => (
              <li key={r.id}>
                <Link href={`/daily-reports/${r.id}`} className="flex items-center px-6 py-4 hover:bg-gray-50 transition">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-800">{r.date}</span>
                      <span className="text-sm text-gray-500">{r.user_name}</span>
                      {r.unread_check === '未チェック' && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">未読</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                      {r.important_report || r.performance_activity || '（内容なし）'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.total_hours && (
                      <span className="text-sm text-gray-400">{r.total_hours}</span>
                    )}
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
