'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { Menu } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <Sidebar isOpen={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-auto">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-blue-800 text-white sticky top-0 z-20 shrink-0">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1 rounded hover:bg-blue-700 transition"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-sm">業務管理システム</span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
