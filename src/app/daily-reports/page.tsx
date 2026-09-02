'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { DailyReport, DailyReportDetail } from '@/lib/types'
import { Plus, ChevronDown, ChevronRight, Search, X } from 'lucide-react'

export default function DailyReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [detailsMap, setDetailsMap] = useState<Record<string, DailyReportDetail[]>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // 検索条件
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [staffName, setStaffName] = useState('')
  const [staffOptions, setStaffOptions] = useState<string[]>([])

  useEffect(() => {
    // スタッフ一覧をusersテーブルから取得
    createClient().from('users').select('name').order('name').then(({ data }) => {
      setStaffOptions((data || []).map(u => u.name).filter(Boolean))
    })
    load()
  }, [])

  async function load(params?: { dateFrom?: string; dateTo?: string; staffName?: string }) {
    setLoading(true)
    const supabase = createClient()
    const df = params?.dateFrom ?? dateFrom
    const dt = params?.dateTo ?? dateTo
    const sn = params?.staffName ?? staffName

    let q = supabase.from('daily_reports').select('*').order('date', { ascending: false }).limit(200)
    if (df) q = q.gte('date', df)
    if (dt) q = q.lte('date', dt)
    if (sn) q = q.eq('user_name', sn)

    const { data: reportData } = await q
    const reps = reportData || []
    setReports(reps)

    if (reps.length > 0) {
      const ids = reps.map(r => r.id)
      const { data: detailData } = await supabase
        .from('daily_report_details').select('*').in('report_id', ids).order('sort_order')
      const map: Record<string, DailyReportDetail[]> = {}
      for (const d of (detailData || [])) {
        if (!map[d.report_id]) map[d.report_id] = []
        map[d.report_id].push(d)
      }
      setDetailsMap(map)
    } else {
      setDetailsMap({})
    }
    setLoading(false)
  }

  function search() { load() }

  function clear() {
    setDateFrom(''); setDateTo(''); setStaffName('')
    load({ dateFrom: '', dateTo: '', staffName: '' })
  }

  function buildTaskSummary(details: DailyReportDetail[]): string {
    const map: Record<string, number> = {}
    const order: string[] = []
    for (const d of details) {
      if (!d.task_type) continue
      if (!(d.task_type in map)) { map[d.task_type] = 0; order.push(d.task_type) }
      const parts = (d.work_time || '').split(':')
      if (parts.length === 2) {
        const h = parseInt(parts[0]), m = parseInt(parts[1])
        if (!isNaN(h) && !isNaN(m)) map[d.task_type] += h * 60 + m
      }
    }
    if (order.length === 0) return ''
    return order.map(type => {
      const mins = map[type]
      return mins === 0 ? type : `${type} ${Math.floor(mins / 60)}:${(mins % 60).toString().padStart(2, '0')}`
    }).join(' · ')
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">日報</h1>
        <Link href="/daily-reports/new"
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> 新規作成
        </Link>
      </div>

      {/* 検索フォーム */}
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日付（から）</label>
            <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">日付（まで）</label>
            <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={dateTo} onChange={e => setDateTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">担当者</label>
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 min-w-[140px]"
              value={staffName} onChange={e => setStaffName(e.target.value)}>
              <option value="">全員</option>
              {staffOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={search}
              className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
              <Search size={14} /> 検索
            </button>
            <button onClick={clear}
              className="flex items-center gap-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
              <X size={14} /> クリア
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-12 text-gray-400">日報がありません</div>
        ) : (
          <>
            <div className="px-6 py-2 text-xs text-gray-400 border-b border-gray-100">{reports.length}件</div>
            <ul className="divide-y divide-gray-100">
              {reports.map(r => {
                const expanded = expandedIds.has(r.id)
                const details = detailsMap[r.id] || []
                const summary = buildTaskSummary(details) || r.important_report || r.performance_activity || ''
                return (
                  <li key={r.id}>
                    <div className="flex items-center px-6 py-3 gap-3 hover:bg-gray-50 transition">
                      <Link href={`/daily-reports/${r.id}`} className="shrink-0 w-48">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800 text-sm">{r.date}</span>
                          <span className="text-sm text-gray-500">{r.user_name}</span>
                          {r.unread_check === '未チェック' && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">未読</span>
                          )}
                        </div>
                      </Link>
                      <Link href={`/daily-reports/${r.id}`} className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 truncate">{summary}</p>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.total_hours && <span className="text-sm text-gray-400">{r.total_hours}</span>}
                        <button onClick={() => toggleExpand(r.id)}
                          className="p-1 rounded hover:bg-gray-200 transition text-gray-400 hover:text-gray-600">
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="px-6 pb-3 bg-gray-50 border-t border-gray-100">
                        {details.length === 0 ? (
                          <p className="text-xs text-gray-400 py-2">業務明細なし</p>
                        ) : (
                          <table className="w-full text-xs mt-2">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left pb-1 w-16">時間</th>
                                <th className="text-left pb-1 w-24">業務区分</th>
                                <th className="text-left pb-1 w-28">処理期間</th>
                                <th className="text-left pb-1 w-32">顧客名</th>
                                <th className="text-left pb-1">作業内容</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {details.map((d, i) => (
                                <tr key={i} className="text-gray-600">
                                  <td className="py-1">{d.work_time || ''}</td>
                                  <td className="py-1">{d.task_type || ''}</td>
                                  <td className="py-1 text-gray-400">
                                    {d.subject ? (d.details && d.details !== d.subject ? `${d.subject}～${d.details}` : d.subject) : ''}
                                  </td>
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
          </>
        )}
      </div>
    </div>
  )
}
