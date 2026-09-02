'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ClientQuestion } from '@/lib/types'
import { Plus, Search, X, Upload, Trash2 } from 'lucide-react'
import Link from 'next/link'

const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']
const STATUSES = ['未回答', '回答済']

const statusStyle: Record<string, string> = {
  '未回答': 'bg-orange-100 text-orange-700',
  '回答済': 'bg-blue-100 text-blue-700',
}

export default function ClientQuestionsPage() {
  const [questions, setQuestions] = useState<ClientQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => { load() }, [])

  async function load(params?: { clientName?: string; status?: string; category?: string; dateFrom?: string; dateTo?: string }) {
    setLoading(true)
    setSelectedIds(new Set())
    const supabase = createClient()
    let q = supabase.from('client_questions').select('*').order('question_date', { ascending: false }).limit(200)
    const cn = params?.clientName ?? clientName
    const st = params?.status ?? status
    const ca = params?.category ?? category
    const df = params?.dateFrom ?? dateFrom
    const dt = params?.dateTo ?? dateTo
    if (cn) q = q.ilike('client_name', `%${cn}%`)
    if (st) q = q.eq('status', st)
    if (ca) q = q.eq('category', ca)
    if (df) q = q.gte('question_date', df)
    if (dt) q = q.lte('question_date', dt)
    const { data } = await q
    setQuestions(data || [])
    setLoading(false)
  }

  function search() { load() }
  function clear() {
    setClientName(''); setStatus(''); setCategory(''); setDateFrom(''); setDateTo('')
    load({ clientName: '', status: '', category: '', dateFrom: '', dateTo: '' })
  }

  async function remove(q: ClientQuestion) {
    if (!confirm(`「${q.client_name}」の質問事項を削除しますか？`)) return
    const supabase = createClient()
    const { error } = await supabase.from('client_questions').delete().eq('id', q.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setQuestions(qs => qs.filter(x => x.id !== q.id))
    setSelectedIds(ids => { const next = new Set(ids); next.delete(q.id); return next })
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`選択した${selectedIds.size}件を削除しますか？`)) return
    setBulkDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_questions').delete().in('id', Array.from(selectedIds))
    if (error) { alert('削除エラー: ' + error.message); setBulkDeleting(false); return }
    setQuestions(qs => qs.filter(q => !selectedIds.has(q.id)))
    setSelectedIds(new Set())
    setBulkDeleting(false)
  }

  function toggleAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(questions.map(q => q.id)))
    else setSelectedIds(new Set())
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const allSelected = questions.length > 0 && selectedIds.size === questions.length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">質問事項</h1>
        <div className="flex gap-2">
          <Link href="/client-questions/import"
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">
            <Upload size={16} /> Evernoteから
          </Link>
          <Link href="/client-questions/new"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> 新規追加
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-4">
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

      {/* 一括削除バー */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-3">
          <span className="text-sm text-red-700 font-medium">{selectedIds.size}件を選択中</span>
          <button onClick={bulkDelete} disabled={bulkDeleting}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50 ml-auto">
            <Trash2 size={14} /> {bulkDeleting ? '削除中...' : '選択した件を削除'}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-sm text-gray-500 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : questions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">該当する質問事項がありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-3 py-3 w-8 text-center">
                  <input type="checkbox" checked={allSelected} onChange={e => toggleAll(e.target.checked)} />
                </th>
                <th className="px-4 py-3 text-left w-28">業務年月日</th>
                <th className="px-4 py-3 text-left w-28">質問日</th>
                <th className="px-4 py-3 text-left w-44">顧客名</th>
                <th className="px-4 py-3 text-left w-20">区分</th>
                <th className="px-4 py-3 text-left w-20">質問者</th>
                <th className="px-4 py-3 text-left">質問内容</th>
                <th className="px-4 py-3 text-left w-20">状況</th>
                <th className="px-4 py-3 text-left w-24">回答日</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {questions.map(q => (
                <tr key={q.id} className={`hover:bg-gray-50 transition group ${selectedIds.has(q.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selectedIds.has(q.id)}
                      onChange={e => toggleOne(q.id, e.target.checked)} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {q.work_date ? `${q.work_date.slice(0, 4)}年${parseInt(q.work_date.slice(5, 7))}月` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{q.question_date}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <Link href={`/client-questions/${q.id}`} className="hover:text-blue-600">{q.client_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{q.category}</td>
                  <td className="px-4 py-3 text-gray-600">{q.questioner}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs">
                    <Link href={`/client-questions/${q.id}`} className="hover:text-blue-600 line-clamp-2">
                      {(() => {
                        try {
                          const parsed = JSON.parse(q.content)
                          if (Array.isArray(parsed)) {
                            return parsed.map((it: { text: string }) => it.text).filter(Boolean).join('　／　')
                          }
                        } catch { /* fall through */ }
                        return q.content
                      })()}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyle[q.status] || 'bg-gray-100 text-gray-600'}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{q.answered_date || ''}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => remove(q)}
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
      <div className="mt-2 text-xs text-gray-400 text-right">{questions.length}件</div>
    </div>
  )
}
