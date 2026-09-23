'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ClientCheck } from '@/lib/types'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { useSessionState } from '@/lib/useSessionState'
import { Plus, Search, X, Trash2, Printer } from 'lucide-react'
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
  const [clientName, setClientName] = useSessionState('clientChecks_clientName', '')
  const [status, setStatus] = useSessionState('clientChecks_status', '')
  const [category, setCategory] = useSessionState('clientChecks_category', '')
  const [type, setType] = useSessionState('clientChecks_type', '')
  const [dateFrom, setDateFrom] = useSessionState('clientChecks_dateFrom', '')
  const [dateTo, setDateTo] = useSessionState('clientChecks_dateTo', '')

  const [showTopMistakes, setShowTopMistakes] = useState(false)
  const [topMistakesLoaded, setTopMistakesLoaded] = useState(false)
  const [topMistakesLoading, setTopMistakesLoading] = useState(false)
  const [topMistakesError, setTopMistakesError] = useState<string | null>(null)
  const [topMistakesText, setTopMistakesText] = useState<string | null>(null)
  const [topMistakesGeneratedAt, setTopMistakesGeneratedAt] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  // タブを開いたときは前回の結果を表示するだけで、Geminiには問い合わせない
  function openTopMistakesTab() {
    setShowTopMistakes(true)
    if (topMistakesLoaded) return
    setTopMistakesLoading(true)
    setTopMistakesError(null)
    fetch('/api/checklist/top-mistakes')
      .then(res => res.json())
      .then(data => {
        if (data.report) {
          setTopMistakesText(data.report.checklist)
          setTopMistakesGeneratedAt(data.report.generated_at)
        }
        setTopMistakesLoaded(true)
      })
      .catch(() => setTopMistakesError('通信エラーが発生しました'))
      .finally(() => setTopMistakesLoading(false))
  }

  // 「再分析する」を押したときだけGeminiに問い合わせて結果を保存する
  async function generateTopMistakes() {
    setTopMistakesLoading(true)
    setTopMistakesError(null)
    try {
      const res = await fetch('/api/checklist/top-mistakes', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setTopMistakesError(data.error || 'エラーが発生しました'); return }
      setTopMistakesText(data.checklist)
      setTopMistakesGeneratedAt(data.generated_at)
      setTopMistakesLoaded(true)
    } catch {
      setTopMistakesError('通信エラーが発生しました')
    } finally {
      setTopMistakesLoading(false)
    }
  }

  async function load(params?: { clientName?: string; status?: string; category?: string; type?: string; dateFrom?: string; dateTo?: string }) {
    setLoading(true)
    const supabase = createClient()
    const cn = (params?.clientName ?? clientName).normalize('NFKC')
    const st = params?.status ?? status
    const ca = params?.category ?? category
    const tp = params?.type ?? type
    const df = params?.dateFrom ?? dateFrom
    const dt = params?.dateTo ?? dateTo

    function buildQuery() {
      let q = supabase.from('client_checks').select('*')
        .order('created_at', { ascending: false })
        .order('check_date', { ascending: false })
      if (cn) q = q.ilike('client_name', `%${cn}%`)
      if (st) q = q.eq('status', st)
      if (ca) q = q.eq('category', ca)
      if (tp) q = q.eq('type', tp)
      if (df) q = q.gte('check_date', df)
      if (dt) q = q.lte('check_date', dt)
      return q
    }

    const all = await fetchAllRows<ClientCheck>(buildQuery)
    setChecks(all)
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
        <div className="flex items-center gap-2">
          <button onClick={() => showTopMistakes ? setShowTopMistakes(false) : openTopMistakesTab()}
            className={`flex items-center gap-1 text-sm border px-3 py-2 rounded-lg font-medium transition ${
              showTopMistakes ? 'bg-indigo-600 text-white border-indigo-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
            }`}>
            ✨ 全社TOP10をAI分析
          </button>
          <Link href="/client-checks/new"
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> 新規追加
          </Link>
        </div>
      </div>

      {showTopMistakes && (
        <div className="bg-white rounded-xl shadow overflow-hidden mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-indigo-50">
            <span className="font-bold text-indigo-700 text-sm flex items-center gap-2">
              ✨ 全社 間違えやすい項目TOP10（Gemini生成）
              {topMistakesGeneratedAt && (
                <span className="text-xs font-normal text-indigo-400">
                  （最終生成日: {new Date(topMistakesGeneratedAt).toLocaleString('ja-JP')}）
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={generateTopMistakes} disabled={topMistakesLoading}
                className="flex items-center gap-1 text-xs border border-indigo-300 text-indigo-600 px-2.5 py-1 rounded hover:bg-indigo-50 disabled:opacity-50">
                🔄 再分析する
              </button>
              {topMistakesText && (
                <button
                  onClick={() => {
                    const w = window.open('', '_blank')
                    if (!w) return
                    const genDateStr = topMistakesGeneratedAt ? new Date(topMistakesGeneratedAt).toLocaleString('ja-JP') : new Date().toLocaleDateString('ja-JP')
                    w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>全社 間違えやすい項目TOP10</title><style>body{font-family:'Hiragino Kaku Gothic Pro',Meiryo,sans-serif;padding:32px;max-width:800px;margin:0 auto;font-size:14px;line-height:1.8;color:#222}h1{font-size:18px;border-bottom:2px solid #4f46e5;padding-bottom:8px;margin-bottom:24px}pre{white-space:pre-wrap;font-family:inherit}p.note{font-size:11px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:12px}@media print{button{display:none}}</style></head><body><h1>全社　間違えやすい項目TOP10</h1><pre>${topMistakesText}</pre><p class="note">※ 生成日：${genDateStr}　Gemini AIにより生成（顧客名・担当者名は含めずに送信）</p><script>window.onload=()=>window.print()<\/script></body></html>`)
                    w.document.close()
                  }}
                  className="flex items-center gap-1 text-xs border border-indigo-300 text-indigo-600 px-2.5 py-1 rounded hover:bg-indigo-50">
                  <Printer size={12} /> 印刷
                </button>
              )}
              <button onClick={() => setShowTopMistakes(false)}
                className="text-xs text-gray-400 hover:text-gray-600">✕ 閉じる</button>
            </div>
          </div>
          <div className="p-5">
            {topMistakesLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full"></span>
                Geminiが全顧客の指摘事項を分析中です...
              </div>
            ) : topMistakesError ? (
              <div className="text-sm text-red-600 py-2">{topMistakesError}</div>
            ) : topMistakesText ? (
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{topMistakesText}</div>
            ) : (
              <div className="text-sm text-gray-400 py-4">
                まだ生成されていません。「🔄 再分析する」を押すとGeminiが分析します。
              </div>
            )}
            <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
              ※ 全顧客の「指摘」区分の記録を対象に分析しています（顧客名・担当者名は送信していません）
            </p>
          </div>
        </div>
      )}

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
