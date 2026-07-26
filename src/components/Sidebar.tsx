'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LayoutDashboard, FileText, Calendar, ClipboardList, LogOut } from 'lucide-react'

const nav = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
  { href: '/monthly', label: '月次進捗表', icon: ClipboardList },
  { href: '/daily-reports', label: '日報', icon: FileText },
  { href: '/schedules', label: 'スケジュール', icon: Calendar },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 bg-blue-800 text-white flex flex-col min-h-screen">
      <div className="px-6 py-5 border-b border-blue-700">
        <div className="font-bold text-lg leading-tight">業務管理</div>
        <div className="text-blue-300 text-xs mt-0.5">システム</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                active ? 'bg-blue-600 font-semibold' : 'hover:bg-blue-700 text-blue-100'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-blue-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-blue-200 hover:bg-blue-700 w-full transition"
        >
          <LogOut size={18} />
          ログアウト
        </button>
      </div>
    </aside>
  )
}
