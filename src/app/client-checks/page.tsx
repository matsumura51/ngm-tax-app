'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ClientCheck } from '@/lib/types'
import { Plus, Search, X, Trash2 } from 'lucide-react'
import Link from 'next/link'

const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']
const STATUSES = ['未訂正', '訂正済', '確認中']
const TYPES = ['指摘', 'クレーム', '処理方法']

const statusStyle: Record<string, string> = {
  '未訂正': 'bg-red-100 text-red-700',
  '訂正済': 'bg-green-100 text-green-700',
  '確認中': 'bg-yellow-100 text-yellow-700',
}

const typeStyle: Record<string, string> = {
  '指摘':   'bg-red-50 text-red-700 border border-red-200',
  'クレーム': 'bg-orange-50 text-orange-700 border border-orange-200',
  '処理方法': 'bg-blue-50 text-blue-700 border border-blue-200',
}

export default function ClientChecksPage() {
  const [checks, setChecks] = useState<ClientCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [type, setType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { load() }, [])

  async function load(params?: { clientName?: string; status?: string; category?: string; type?: string; dateFrom?: string; dateTo?: string }) {
    setLoading(true)
    const supabase = createClient()
    let q = supabase.from('client_checks').select('*').order('check_date', { ascending: false }).limit(200)
    const cn = (params?.clientName ?? clientName).normalize('NFKC')
    const st = params?.status ?? status
    const ca = params?.category ?? category
    const tp = params?.type ?? type
    const df = params?.dateFrom ?? dateFrom
    const dt = params?.dateTo ?? dateTo
    if (cn) q = q.ilike('client_name', `%${cn}%`)
    if (st) q = q.eq('status', st)
    if (ca) q = q.eq('category', ca)
    if (tp) q = q.eq('type', tp)
    if (df) q = q.gte('check_date', df)
    if (dt) q = q.lte('check_date', dt)
    const { data } = await q
    setChecks(data || [])
    setLoading(false)
  }

  function search() { load() }
  function clear() {
    setClientName(''); setStatus(''); setCategory(''); setType(''); setDateFrom(''); setDateTo('')
    load({ clientName: '', status: '', category: '', type: '', dateFrom: '', dateTo: '' })
  }

  async function remove(c: ClientCheck) {
    if (!confirm(`「${c.client_name}」の記録を削除しますか？`)) return
    const supabase = createClient()
    const { error } = await supabase.from('client_checks').delete().eq('id', c.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setChecks(cs => cs.filter(x => x.id !== c.id))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">指摘・クレーム・処理方法</h1>
        <Link href="/client-checks/new"
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> 新規追加
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-4">
        {/* 種別フィルター（ボタン） */}
        <div className="flex gap-2 mb-3">
          <button onClick={() => { setType(''); load({ type: '' }) }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${!type ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            すべて
          </button>
          {TYPES.map(t => (
            <button key={t} onClick={() => { setType(t); load({ type: t }) }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition ${type === t
                ? t === '指摘' ? 'bg-red-600 text-white border-red-600'
                  : t === 'クレーム' ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-blue-600 text-white border-blue-600'
                : typeStyle[t] + ' hover:opacity-80'}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="顧客名" value={clientName} onChange={e => setClientName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()} />
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">状況：すべて</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">区分：すべて</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={search} className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Search size={14} /> 検索
          </button>
          <button onClick={clear} className="flex items-center gap-1 px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            <X size={14} /> クリア
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : checks.length === 0 ? (
          <div className="text-center py-12 text-gray-400">該当する記録がありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left w-28">日付</th>
                <th className="px-4 py-3 text-left w-20">種別</th>
                <th className="px-4 py-3 text-left w-24">顧客コード</th>
                <th className="px-4 py-3 text-left w-44">顧客名</th>
                <th className="px-4 py-3 text-left w-20">区分</th>
                <th className="px-4 py-3 text-left w-20">確認者</th>
                <th className="px-4 py-3 text-left">内容</th>
                <th className="px-4 py-3 text-left w-20">状況</th>
                <th className="px-4 py-3 text-left w-24">訂正日</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {checks.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition group">
                  <td className="px-4 py-3 text-gray-600">{c.check_date}</td>
                  <td className="px-4 py-3">
                    {c.type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeStyle[c.type] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                        {c.type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{c.client_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <Link href={`/client-checks/${c.id}`} className="hover:text-blue-600">{c.client_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.category}</td>
                  <td className="px-4 py-3 text-gray-600">{c.checker}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs">
                    <Link href={`/client-checks/${c.id}`} className="hover:text-blue-600 line-clamp-2">{c.content}</Link>
                  </td>
                  <td className="px-4 py-3">
                    {c.type !== '処理方法' && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle[c.status] || 'bg-gray-100 text-gray-600'}`}>
                        {c.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.corrected_date || ''}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => remove(c)}
                      className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-400 text-right">{checks.length}件</div>
    </div>
  )
}
