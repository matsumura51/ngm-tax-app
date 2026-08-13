'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { DailyReport, DailyReportDetail } from '@/lib/types'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'

export default function DailyReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [detailsMap, setDetailsMap] = useState<Record<string, DailyReportDetail[]>>({})
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: reportData } = await supabase
      .from('daily_reports')
      .select('*')
      .order('date', { ascending: false })
      .limit(50)
    const reports = reportData || []
    setReports(reports)

    if (reports.length > 0) {
      const ids = reports.map(r => r.id)
      const { data: detailData } = await supabase
        .from('daily_report_details')
        .select('*')
        .in('report_id', ids)
        .order('sort_order')
      const map: Record<string, DailyReportDetail[]> = {}
      for (const d of (detailData || [])) {
        if (!map[d.report_id]) map[d.report_id] = []
        map[d.report_id].push(d)
      }
      setDetailsMap(map)
    }
    setLoading(false)
  }

  function toggleCollapse(reportId: string) {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(reportId)) next.delete(reportId)
      else next.add(reportId)
      return next
    })
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
            {reports.map(r => {
              const collapsed = collapsedIds.has(r.id)
              const details = detailsMap[r.id] || []
              return (
                <li key={r.id}>
                  <div className="flex items-center px-6 py-4 hover:bg-gray-50 transition">
                    <Link href={`/daily-reports/${r.id}`} className="flex-1 min-w-0">
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
                    </Link>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      {r.total_hours && (
                        <span className="text-sm text-gray-400">{r.total_hours}</span>
                      )}
                      <button onClick={() => toggleCollapse(r.id)}
                        className="p-1 rounded hover:bg-gray-200 transition text-gray-400 hover:text-gray-600">
                        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                  {!collapsed && (
                    <div className="px-6 pb-3 bg-gray-50 border-t border-gray-100">
                      {details.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">業務明細なし</p>
                      ) : (
                        <table className="w-full text-xs mt-2">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left pb-1 w-16">時間</th>
                              <th className="text-left pb-1 w-24">業務区分</th>
                              <th className="text-left pb-1 w-32">顧客名</th>
                              <th className="text-left pb-1">作業内容</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {details.map((d, i) => (
                              <tr key={i} className="text-gray-600">
                                <td className="py-1">{d.work_time || ''}</td>
                                <td className="py-1">{d.task_type || ''}</td>
                                <td className="py-1 truncate max-w-[128px]">{d.client_name || ''}</td>
                                <td className="py-1 truncate">{d.report_content || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
