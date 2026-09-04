'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Client } from '@/lib/types'
import { Plus, Search, ChevronRight, Upload, Download, FileDown, Trash2, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { CLIENT_COLUMNS } from '@/lib/clientColumns'

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (key === 'fiscal_month') return value === 0 ? '個人' : `${value}月`
  if (typeof value === 'boolean') return value ? '○' : ''
  if (Array.isArray(value)) return ''
  return String(value)
}

const FISCAL_MONTHS = [
  { value: '', label: 'すべて' },
  { value: '0', label: '個人' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}月` })),
]

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [allUsers, setAllUsers] = useState<{ name: string; division: string | null }[]>([])
  const [search, setSearch] = useState('')
  const [staffFilter, setStaffFilter] = useState('')
  const [filterDivision, setFilterDivision] = useState('')
  const [fiscalFilter, setFiscalFilter] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const isFirstLoad = useRef(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: clientsData }, { data: usersData }, authResult] = await Promise.all([
      supabase.from('clients').select('*').order('code'),
      supabase.from('users').select('name, division').order('name'),
      supabase.auth.getUser(),
    ])
    setClients(clientsData || [])
    setAllUsers(usersData || [])
    // 初回ロード時のみログイン中の担当者でデフォルトフィルター
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      const currentUser = authResult.data.user
      if (currentUser) {
        const { data: me } = await supabase.from('users').select('name').eq('id', currentUser.id).maybeSingle()
        if (me?.name) setStaffFilter(me.name)
      }
    }
    setSelectedIds(new Set())
    setLoading(false)
  }

  function exportFiltered() {
    const rows = filtered.map(c => {
      const row: Record<string, string> = {}
      CLIENT_COLUMNS.forEach(col => {
        row[col.label] = formatValue(col.key, (c as unknown as Record<string, unknown>)[col.key])
      })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '顧客カルテ')
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `顧客カルテ_絞り込み_${date}.xlsx`)
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    if (!confirm(`選択した ${selectedIds.size} 件を削除しますか？\nこの操作は取り消せません。`)) return
    setDeleting(true)
    const res = await fetch('/api/clients/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    const json = await res.json()
    if (!res.ok) {
      alert('削除エラー: ' + json.error)
    } else {
      await load()
    }
    setDeleting(false)
  }

  async function toggleMonthly(id: string, current: boolean, e: React.MouseEvent) {
    e.stopPropagation()
    const next = !current
    setClients(prev => prev.map(c => c.id === id ? { ...c, show_in_monthly: next } : c))
    const supabase = createClient()
    await supabase.from('clients').update({ show_in_monthly: next }).eq('id', id)
  }

  async function bulkSetMonthly(value: boolean) {
    if (selectedIds.size === 0) return
    setBulkUpdating(true)
    const ids = Array.from(selectedIds)
    setClients(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, show_in_monthly: value } : c))
    const supabase = createClient()
    await supabase.from('clients').update({ show_in_monthly: value }).in('id', ids)
    setBulkUpdating(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)))
    }
  }

  const divisionOptions = Array.from(new Set(allUsers.map(u => u.division).filter(Boolean))).sort() as string[]
  const staffInDivision = filterDivision ? allUsers.filter(u => u.division === filterDivision).map(u => u.name) : null
  const staffOptions = Array.from(new Set(clients.map(c => c.primary_staff).filter(s => !staffInDivision || staffInDivision.includes(s || '')).filter(Boolean))).sort() as string[]

  const filtered = clients.filter(c => {
    if (!showAll && (c.contract_end_date || c.contract_status === '契約終了')) return false
    if (search && !c.name.includes(search) && !c.code.includes(search)) return false
    if (filterDivision && staffInDivision && !staffInDivision.includes(c.primary_staff || '')) return false
    if (staffFilter && c.primary_staff !== staffFilter) return false
    if (fiscalFilter !== '') {
      const fv = Number(fiscalFilter)
      if (c.fiscal_month !== fv) return false
    }
    return true
  })

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length
  const allMonthlyChecked = filtered.length > 0 && filtered.every(c => c.show_in_monthly)

  async function toggleAllMonthly() {
    const next = !allMonthlyChecked
    const ids = filtered.map(c => c.id)
    setClients(prev => prev.map(c => ids.includes(c.id) ? { ...c, show_in_monthly: next } : c))
    const supabase = createClient()
    await supabase.from('clients').update({ show_in_monthly: next }).in('id', ids)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">顧客カルテ</h1>
        <div className="flex gap-2">
          <Link href="/clients/export"
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">
            <Download size={16} /> Excelエクスポート
          </Link>
          <Link href="/clients/import"
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">
            <Upload size={16} /> CSVインポート
          </Link>
          <Link href="/clients/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> 新規追加
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="顧客名・コードで検索" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {divisionOptions.length > 0 && (
          <select value={filterDivision} onChange={e => { setFilterDivision(e.target.value); setStaffFilter('') }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">所属（全チーム）</option>
            {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
          className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">{filterDivision ? `${filterDivision}の全員` : '担当者（全員）'}</option>
          {staffOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fiscalFilter} onChange={e => setFiscalFilter(e.target.value)}
          className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {FISCAL_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {(staffFilter || filterDivision) && (
          <button onClick={() => { setStaffFilter(''); setFilterDivision('') }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <X size={14} />絞り込み解除
          </button>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none whitespace-nowrap">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} className="w-4 h-4 rounded" />
          契約終了を含む全て表示
        </label>
        <span className="text-xs text-gray-400">{filtered.length}件</span>
        <button onClick={exportFiltered} disabled={filtered.length === 0}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
          <FileDown size={15} /> 絞り込み結果をエクスポート
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex-wrap">
          <span className="text-sm text-blue-700 font-medium">{selectedIds.size}件選択中</span>
          <button onClick={() => bulkSetMonthly(true)} disabled={bulkUpdating}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {bulkUpdating ? '更新中...' : '月次進捗にチェックを付ける'}
          </button>
          <button onClick={() => bulkSetMonthly(false)} disabled={bulkUpdating}
            className="flex items-center gap-1.5 bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
            {bulkUpdating ? '更新中...' : '月次進捗のチェックを外す'}
          </button>
          <button onClick={deleteSelected} disabled={deleting}
            className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
            <Trash2 size={14} /> {deleting ? '削除中...' : '削除'}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700 ml-auto">
            選択解除
          </button>
        </div>
      )}

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
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-4 h-4 rounded accent-blue-600" />
                  </th>
                  <th className="px-3 py-3 text-center whitespace-nowrap text-blue-600">
                    <div className="flex flex-col items-center gap-1">
                      <span>月次進捗</span>
                      <input type="checkbox" checked={allMonthlyChecked} onChange={toggleAllMonthly}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                    </div>
                  </th>
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
                  <tr key={c.id}
                    className={`hover:bg-gray-50 cursor-pointer ${c.contract_end_date ? 'opacity-50' : ''} ${selectedIds.has(c.id) ? 'bg-blue-50' : ''}`}
                    onClick={() => window.location.href = `/clients/${c.id}`}>
                    <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleSelect(c.id) }}>
                      <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)}
                        className="w-4 h-4 rounded accent-blue-600" />
                    </td>
                    <td className="px-3 py-3 text-center" onClick={e => toggleMonthly(c.id, c.show_in_monthly, e)}>
                      <input type="checkbox" checked={!!c.show_in_monthly} onChange={() => {}}
                        className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
                    </td>
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
