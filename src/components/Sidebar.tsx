'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LayoutDashboard, FileText, Calendar, ClipboardList, LogOut, Users, UserCog, AlertCircle, HelpCircle, BarChart2, Receipt, Landmark, ListChecks, BookOpen, X, MessageSquare } from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/bulletins', label: '掲示板', icon: MessageSquare },
  { href: '/clients', label: '顧客カルテ', icon: Users },
  { href: '/monthly', label: '月次進捗表', icon: ClipboardList },
  { href: '/daily-reports', label: '日報', icon: FileText },
  { href: '/schedules', label: 'スケジュール', icon: Calendar },
  { href: '/client-checks', label: '指摘・クレーム・処理方法', icon: AlertCircle },
  { href: '/client-questions', label: '質問事項', icon: HelpCircle },
  { href: '/annual-tasks', label: '年調・源泉進捗', icon: ListChecks },
  { href: '/tax-return', label: '確定申告進捗', icon: BookOpen },
  { href: '/payment-reports', label: '支払調書', icon: Receipt },
  { href: '/withholding-tax', label: '源泉集計', icon: Landmark },
  { href: '/reports', label: '実績レポート', icon: BarChart2 },
  { href: '/users', label: 'ユーザー管理', icon: UserCog },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleNav() {
    onClose?.()
  }

  return (
    <aside className={`app-sidebar fixed md:sticky top-0 left-0 z-40 h-screen w-64 md:w-56 bg-blue-800 text-white flex flex-col shrink-0${isOpen ? ' open' : ''}`}>
      <div className="px-6 py-5 border-b border-blue-700 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg leading-tight">業務管理</div>
          <div className="text-blue-300 text-xs mt-0.5">システム</div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded hover:bg-blue-700 transition text-blue-200"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={handleNav}
              className={`flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm transition ${
                active ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-700 text-blue-100'
              }`}
            >
              <Icon size={18} className="shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-blue-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm text-blue-200 hover:bg-blue-700 w-full transition"
        >
          <LogOut size={18} className="shrink-0" />
          ログアウト
        </button>
      </div>
    </aside>
  )
}
