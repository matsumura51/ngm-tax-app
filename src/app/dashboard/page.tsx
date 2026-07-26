'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Users, ClipboardList, FileText, Calendar, Plus } from 'lucide-react'

interface Stats {
  totalClients: number
  todaySchedules: number
  unreadReports: number
  monthlyCount: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ totalClients: 0, todaySchedules: 0, unreadReports: 0, monthlyCount: 0 })
  const [recentReports, setRecentReports] = useState<{ id: string; date: string; user_name: string; unread_check: string }[]>([])
  const [todayScheduleList, setTodayScheduleList] = useState<{ id: string; title: string; start_datetime: string; user_name: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    const currentYear = new Date().getFullYear()

    const [
      { count: clientCount },
      { count: scheduleCount },
      { count: unreadCount },
      { count: monthlyCount },
      { data: reports },
      { data: schedules },
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('schedules').select('*', { count: 'exact', head: true })
        .gte('start_datetime', today + 'T00:00:00')
        .lte('start_datetime', today + 'T23:59:59'),
      supabase.from('daily_reports').select('*', { count: 'exact', head: true }).eq('unread_check', '未チェック'),
      supabase.from('monthly_progress').select('*', { count: 'exact', head: true }).eq('year', currentYear),
      supabase.from('daily_reports').select('id, date, user_name, unread_check').order('date', { ascending: false }).limit(5),
      supabase.from('schedules').select('id, title, start_datetime, user_name')
        .gte('start_datetime', today + 'T00:00:00')
        .order('start_datetime').limit(5),
    ])

    setStats({
      totalClients: clientCount || 0,
      todaySchedules: scheduleCount || 0,
      unreadReports: unreadCount || 0,
      monthlyCount: monthlyCount || 0,
    })
    setRecentReports(reports || [])
    setTodayScheduleList(schedules || [])
    setLoading(false)
  }

  const statCards = [
    { label: '顧客数', value: stats.totalClients, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', href: '/clients' },
    { label: '今日の予定', value: stats.todaySchedules, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50', href: '/schedules' },
    { label: '未読日報', value: stats.unreadReports, icon: FileText, color: 'text-red-500', bg: 'bg-red-50', href: '/daily-reports' },
    { label: '今年度の進捗記録', value: stats.monthlyCount, icon: ClipboardList, color: 'text-green-600', bg: 'bg-green-50', href: '/monthly' },
  ]

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, bg, href }) => (
          <Link key={label} href={href} className={`${bg} rounded-xl p-5 hover:opacity-90 transition`}>
            <Icon className={`${color} mb-3`} size={24} />
            <div className="text-3xl font-bold text-gray-800">{loading ? '-' : value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-700">今日の予定</h2>
            <Link href="/schedules" className="text-xs text-blue-600 hover:underline">すべて表示</Link>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">読み込み中...</p>
          ) : todayScheduleList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">今日の予定はありません</p>
          ) : (
            <ul className="space-y-1">
              {todayScheduleList.map(s => (
                <li key={s.id}>
                  <Link href={`/schedules/${s.id}`} className="flex items-center gap-3 text-sm hover:bg-gray-50 rounded-lg px-2 py-2">
                    <span className="text-gray-400 text-xs w-12 shrink-0">
                      {new Date(s.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-medium text-gray-800">{s.title}</span>
                    {s.user_name && <span className="text-xs text-gray-400 ml-auto">{s.user_name}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-700">最近の日報</h2>
            <Link href="/daily-reports" className="text-xs text-blue-600 hover:underline">すべて表示</Link>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">読み込み中...</p>
          ) : recentReports.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">日報がありません</p>
          ) : (
            <ul className="space-y-1">
              {recentReports.map(r => (
                <li key={r.id}>
                  <Link href={`/daily-reports/${r.id}`} className="flex items-center gap-3 text-sm hover:bg-gray-50 rounded-lg px-2 py-2">
                    <span className="text-gray-400 text-xs w-20 shrink-0">{r.date}</span>
                    <span className="font-medium text-gray-800">{r.user_name}</span>
                    {r.unread_check === '未チェック' && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full ml-auto">未読</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: '/clients/new', label: '顧客を追加', icon: Users, color: 'text-blue-600' },
          { href: '/monthly', label: '月次進捗を入力', icon: ClipboardList, color: 'text-indigo-600' },
          { href: '/daily-reports/new', label: '日報を書く', icon: FileText, color: 'text-green-600' },
          { href: '/schedules/new', label: '予定を追加', icon: Calendar, color: 'text-purple-600' },
        ].map(({ href, label, icon: Icon, color }) => (
          <Link key={href} href={href} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition">
            <Plus size={14} className="text-gray-400" />
            <Icon className={color} size={16} />
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
