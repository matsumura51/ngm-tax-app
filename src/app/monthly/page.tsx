'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MonthlyProgress, Client } from '@/lib/types'
import { Search, X } from 'lucide-react'

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const PROGRESS_ROWS = [
  { key: 'monthly_contact', label: '連絡' },
  { key: 'monthly_material', label: '資料' },
  { key: 'monthly_input', label: '入力' },
  { key: 'monthly_completion', label: '完了' },
  { key: 'monthly_report', label: '報告' },
]

type ModalState = { client: Client; month: number; progress: MonthlyProgress | null }

export default function MonthlyPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, MonthlyProgress>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [modalDates, setModalDates] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: clientsData }, { data: progressData }] = await Promise.all([
      supabase.from('clients').select('*').order('code'),
      supabase.from('monthly_progress').select('*').eq('year', year),
    ])
    setClients(clientsData || [])
    const map: Record<string, MonthlyProgress> = {}
    for (const p of (progressData || [])) map[p.client_code] = p
    setProgressMap(map)
    setLoading(false)
  }

  function openModal(client: Client, month: number) {
    const progress = progressMap[client.code] || null
    const dates: Record<string, string> = {}
    for (const row of PROGRESS_ROWS) {
      const val = progress?.[row.key as keyof MonthlyProgress] as Record<string, string | null> | undefined
      dates[row.key] = val?.[String(month)] || ''
    }
    setModalDates(dates)
    setModal({ client, month, progress })
  }

  async function saveModal() {
    if (!modal) return
    setSaving(true)
    const supabase = createClient()
    const { client, month, progress } = modal

    const updates: Record<string, Record<string, string | null>> = {}
    for (const row of PROGRESS_ROWS) {
      const existing = (progress?.[row.key as keyof MonthlyProgress] as Record<string, string | null>) || {}
      updates[row.key] = { ...existing, [String(month)]: modalDates[row.key] || null }
    }

    if (progress) {
      await supabase.from('monthly_progress').update(updates).eq('id', progress.id)
      setProgressMap(prev => ({ ...prev, [client.code]: { ...progress, ...updates } }))
    } else {
      const { data } = await supabase.from('monthly_progress').insert({
        client_id: client.id,
        client_code: client.code,
        client_name: client.name,
        year,
        fiscal_month: client.fiscal_month,
        industry: client.industry,
        consumption_tax: client.consumption_tax,
        withholding_tax: client.withholding_tax,
        invoice_registered: client.invoice_registered,
        primary_staff: client.primary_staff,
        ...updates,
      }).select().single()
      if (data) setProgressMap(prev => ({ ...prev, [client.code]: data }))
    }
    setSaving(false)
    setModal(null)
  }

  const filtered = clients.filter(c => c.name.includes(search) || c.code.includes(search))
  const currentMonth = new Date().getMonth() + 1

  function getStatus(clientCode: string, month: string) {
    const r = progressMap[clientCode]
    if (!r) return 'none'
    if (r.monthly_report?.[month]) return 'done'
    if (r.monthly_completion?.[month]) return 'complete'
    if (r.monthly_contact?.[month]) return 'progress'
    return 'none'
  }

  const statusColor = {
    done: 'bg-green-500 hover:bg-green-600',
    complete: 'bg-blue-400 hover:bg-blue-500',
    progress: 'bg-yellow-400 hover:bg-yellow-500',
    none: 'bg-gray-100 border border-gray-200 hover:bg-gray-200',
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">月次進捗表</h1>

      <div className="flex items-center gap-4 mb-4">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}年度</option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="顧客名・コードで検索" value={search} onChange={e => setSearch(e.target.value)} className="border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm w-64" />
        </div>
        <span className="text-sm text-gray-500">{filtered.length}件</span>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">顧客名</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">担当</th>
              <th className="px-2 py-3 text-left font-semibold text-gray-600">消費税</th>
              {MONTHS.map(m => (
                <th key={m} className={`px-2 py-3 text-center font-semibold w-10 ${String(currentMonth) === m ? 'text-blue-600' : 'text-gray-600'}`}>
                  {m}月
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={18} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={18} className="text-center py-8 text-gray-400">顧客が登録されていません</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="sticky left-0 z-10 bg-white px-4 py-2.5 whitespace-nowrap">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-gray-400">{c.code}</div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 text-xs whitespace-nowrap">{c.primary_staff || '-'}</td>
                <td className="px-2 py-2.5">
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{c.consumption_tax || '-'}</span>
                </td>
                {MONTHS.map(m => {
                  const status = getStatus(c.code, m)
                  return (
                    <td key={m} className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => openModal(c, parseInt(m))}
                        className={`w-5 h-5 rounded-full mx-auto transition cursor-pointer ${statusColor[status]}`}
                        title={`${c.name} ${m}月の進捗を入力`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> 報告済</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> 月次完成</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> 進行中</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-gray-100 border inline-block" /> 未着手</span>
        <span className="text-gray-300">｜</span>
        <span>ドットをクリックして日付を入力</span>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-gray-800">{modal.client.name}</div>
                <div className="text-sm text-blue-600 font-medium">{year}年 {modal.month}月</div>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {PROGRESS_ROWS.map(row => (
                <div key={row.key} className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-500 w-8 shrink-0">{row.label}</label>
                  <input
                    type="date"
                    value={modalDates[row.key] || ''}
                    onChange={e => setModalDates(d => ({ ...d, [row.key]: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {modalDates[row.key] && (
                    <button onClick={() => setModalDates(d => ({ ...d, [row.key]: '' }))} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={saveModal} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
