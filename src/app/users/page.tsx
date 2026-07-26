'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { User } from '@/lib/types'
import { ChevronRight } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  staff: 'スタッフ',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data || [])
    setLoading(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">ユーザー管理</h1>
        <p className="text-sm text-gray-400">新規ユーザーはSupabaseダッシュボードから招待できます</p>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400">ユーザーがいません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">氏名</th>
                <th className="px-4 py-3 text-left">コード</th>
                <th className="px-4 py-3 text-left">部署</th>
                <th className="px-4 py-3 text-left">メールアドレス</th>
                <th className="px-4 py-3 text-left">権限</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/users/${u.id}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{u.code || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.department || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {ROLE_LABELS[u.role || 'staff'] || u.role || 'スタッフ'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><ChevronRight size={16} className="text-gray-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
