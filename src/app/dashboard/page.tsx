'use client'

import Link from 'next/link'
import { ClipboardList, FileText, Calendar } from 'lucide-react'

const cards = [
  {
    href: '/monthly',
    label: '月次進捗表',
    icon: ClipboardList,
    desc: '顧問先の月次業務進捗を管理',
    color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    href: '/daily-reports',
    label: '日報',
    icon: FileText,
    desc: '日々の業務内容を記録・共有',
    color: 'bg-green-50 border-green-200 hover:bg-green-100',
    iconColor: 'text-green-600',
  },
  {
    href: '/schedules',
    label: 'スケジュール',
    icon: Calendar,
    desc: '担当者のスケジュール・TODO管理',
    color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    iconColor: 'text-purple-600',
  },
]

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map(({ href, label, icon: Icon, desc, color, iconColor }) => (
          <Link
            key={href}
            href={href}
            className={`border-2 rounded-xl p-6 transition ${color}`}
          >
            <Icon className={`${iconColor} mb-3`} size={36} />
            <div className="font-bold text-lg text-gray-800">{label}</div>
            <div className="text-sm text-gray-500 mt-1">{desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
