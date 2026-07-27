'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Client } from '@/lib/types'
import { Plus, Search, ChevronRight, Upload, Download } from 'lucide-react'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').order('code')
    setClients(data || [])
    setLoading(false)
  }

  const filtered = clients.filter(c =>
    c.name.includes(search) || c.code.includes(search)
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">顧客カルテ</h1>
        <div className="flex gap-2">
          <Link
            href="/clients/export"
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Download size={16} /> Excelエクスポート
          </Link>
          <Link
            href="/clients/import"
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Upload size={16} /> CSVインポート
          </Link>
          <Link
            href="/clients/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> 新規追加
          </Link>
        </div>
      </div>

      <div className="mb-4 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="顧客名・コードで検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">顧客がありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">コード</th>
                  <th className="px-4 py-3 text-left">顧客名</th>
                  <th className="px-4 py-3 text-left">法個</th>
                  <th className="px-4 py-3 text-left">決算月</th>
                  <th className="px-4 py-3 text-left">契約状態</th>
                  <th className="px-4 py-3 text-left">主担当</th>
                  <th className="px-4 py-3 text-left">TEL</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/clients/${c.id}`}>
                    <td className="px-4 py-3 font-mono text-gray-600">{c.code}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.entity_type || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.fiscal_month === 0 ? '個人' : c.fiscal_month ? `${c.fiscal_month}月` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.contract_status || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.primary_staff || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.phone || '-'}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={16} className="text-gray-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
