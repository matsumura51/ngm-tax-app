'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']
const STATUSES = ['未訂正', '確認中', '訂正済']
const TYPES = ['指摘', 'クレーム', '処理方法']

function ClientCheckNewForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [clients, setClients] = useState<{ id: string; code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: { id: string; code: string; name: string }[]; top: number; left: number } | null>(null)
  const [form, setForm] = useState({
    client_id: searchParams.get('client_id') || '',
    client_code: searchParams.get('client_code') || '',
    client_name: searchParams.get('client_name') || '',
    check_date: new Date().toISOString().split('T')[0],
    checker: '',
    category: '月次',
    type: '指摘',
    content: '',
    status: '未訂正',
    corrected_date: '',
    correction_note: '',
  })

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
        const name = data?.name || user.email?.split('@')[0] || ''
        setUserName(name)
        setForm(f => ({ ...f, checker: name }))
      }
      const { data: cl } = await supabase.from('clients').select('id, code, name').order('code')
      setClients(cl || [])
    }
    init()
  }, [])

  function onClientNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setForm(f => ({ ...f, client_name: text, client_id: '', client_code: '' }))
    if (text.length >= 1) {
      const matches = clients.filter(c => c.name.includes(text)).slice(0, 8)
      if (matches.length > 0) {
        const rect = e.target.getBoundingClientRect()
        setSuggestions({ matches, top: rect.bottom + 2, left: rect.left })
      } else setSuggestions(null)
    } else setSuggestions(null)
  }

  function onClientCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const code = e.target.value
    const found = clients.find(c => c.code === code)
    if (found) setForm(f => ({ ...f, client_id: found.id, client_code: found.code, client_name: found.name }))
    else setForm(f => ({ ...f, client_code: code }))
  }

  function selectClient(c: { id: string; code: string; name: string }) {
    setForm(f => ({ ...f, client_id: c.id, client_code: c.code, client_name: c.name }))
    setSuggestions(null)
  }

  async function save() {
    if (!form.content.trim()) { alert('指摘内容を入力してください'); return }
    if (!form.client_name.trim()) { alert('顧客名を入力してください'); return }
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_checks').insert({
      client_id: form.client_id || null,
      client_code: form.client_code || null,
      client_name: form.client_name,
      check_date: form.check_date,
      checker: form.checker || null,
      category: form.category || null,
      type: form.type || null,
      content: form.content,
      status: form.type === '処理方法' ? '訂正済' : form.status,
      corrected_date: form.corrected_date || null,
      correction_note: form.correction_note || null,
    })
    if (error) { alert('エラー: ' + error.message); setSaving(false); return }
    router.push('/client-checks')
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/client-checks" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-800">指摘・クレーム・処理方法 新規追加</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">指摘日</label>
            <input type="date" className={ic} value={form.check_date} onChange={e => setForm(f => ({ ...f, check_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">確認者</label>
            <input className={ic} value={form.checker} onChange={e => setForm(f => ({ ...f, checker: e.target.value }))} placeholder={userName} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">顧客</label>
          {form.client_name && form.client_id ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
              <span className="font-mono text-gray-500 text-xs">{form.client_code}</span>
              <span className="font-medium text-gray-800">{form.client_name}</span>
              <button onClick={() => setForm(f => ({ ...f, client_id: '', client_code: '', client_name: '' }))} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">×</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input className={ic} value={form.client_code} onChange={onClientCodeChange} placeholder="顧客コード" />
              <input className={ic} value={form.client_name} onChange={onClientNameChange}
                onBlur={() => setTimeout(() => setSuggestions(null), 150)} placeholder="顧客名（部分一致）" />
            </div>
          )}
        </div>

        {/* 種別選択 */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">種別</label>
          <div className="flex gap-2">
            {TYPES.map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${form.type === t
                  ? t === '指摘' ? 'bg-red-600 text-white border-red-600'
                    : t === 'クレーム' ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">区分</label>
            <select className={ic} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">状況</label>
            <select className={ic} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              disabled={form.type === '処理方法'}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {form.type === '処理方法' ? '処理方法・特殊対応の内容' : form.type === 'クレーム' ? 'クレーム内容' : '指摘内容'}
          </label>
          <textarea className={ic + ' resize-none'} rows={5} value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder={form.type === '処理方法' ? 'この顧客固有の特殊処理・注意事項を記入' : form.type === 'クレーム' ? 'クレームの内容・経緯を記入' : 'チェックして指摘した内容を記入'} />
        </div>

        {(form.status === '訂正済' || form.status === '確認中') && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">訂正日</label>
              <input type="date" className={ic} value={form.corrected_date} onChange={e => setForm(f => ({ ...f, corrected_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">訂正メモ</label>
              <textarea className={ic + ' resize-none'} rows={3} value={form.correction_note}
                onChange={e => setForm(f => ({ ...f, correction_note: e.target.value }))} placeholder="訂正内容・対応メモ" />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/client-checks" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</Link>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {suggestions && (
        <div style={{ position: 'fixed', top: suggestions.top, left: suggestions.left, minWidth: '260px', zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.matches.map(c => (
            <button key={c.id} type="button" onMouseDown={() => selectClient(c)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-2">
              <span className="font-mono text-gray-400 shrink-0">{c.code}</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ClientCheckNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <ClientCheckNewForm />
    </Suspense>
  )
}
