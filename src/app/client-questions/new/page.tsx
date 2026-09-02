'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']
const YEARS = [2023, 2024, 2025, 2026, 2027]
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

type QItem = { text: string; answered: boolean; answer: string }

function ClientQuestionNewForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [clients, setClients] = useState<{ id: string; code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: { id: string; code: string; name: string }[]; top: number; left: number } | null>(null)
  const [items, setItems] = useState<QItem[]>([{ text: '', answered: false, answer: '' }])
  const now = new Date()
  const [workYear, setWorkYear] = useState(String(now.getFullYear()))
  const [workMonth, setWorkMonth] = useState(String(now.getMonth() + 1))
  const [form, setForm] = useState({
    client_id: searchParams.get('client_id') || '',
    client_code: searchParams.get('client_code') || '',
    client_name: searchParams.get('client_name') || '',
    question_date: now.toISOString().split('T')[0],
    questioner: '',
    category: '月次',
  })

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
        const name = data?.name || user.email?.split('@')[0] || ''
        setForm(f => ({ ...f, questioner: name }))
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

  function updateItem(i: number, patch: Partial<QItem>) {
    setItems(prev => prev.map((v, idx) => idx === i ? { ...v, ...patch } : v))
  }

  function addItem() {
    setItems(prev => [...prev, { text: '', answered: false, answer: '' }])
  }

  async function importPrevUnanswered() {
    if (!form.client_code && !form.client_id) { alert('先に顧客を選択してください'); return }
    setImporting(true)
    const supabase = createClient()

    let query = supabase
      .from('client_questions')
      .select('id, work_date, content')
      .order('work_date', { ascending: false })
      .limit(24)

    if (form.client_code) query = query.eq('client_code', form.client_code)
    else query = query.eq('client_id', form.client_id)

    // 処理月が設定されていれば、それより前のレコードのみ対象
    const currentWorkDate = workYear && workMonth
      ? `${workYear}-${workMonth.padStart(2, '0')}-01`
      : null
    if (currentWorkDate) query = query.lt('work_date', currentWorkDate)

    const { data } = await query

    const existingTexts = new Set(items.map(it => it.text.trim()).filter(Boolean))
    const importedItems: QItem[] = []

    for (const record of (data || [])) {
      let recordItems: QItem[] = []
      try {
        const parsed = JSON.parse(record.content)
        if (Array.isArray(parsed)) recordItems = parsed
      } catch {
        const lines = (record.content || '').split('\n').filter((s: string) => s.trim())
        recordItems = lines.map((text: string) => ({ text, answered: false, answer: '' }))
      }
      for (const item of recordItems) {
        if (!item.answered && item.text.trim() && !existingTexts.has(item.text.trim())) {
          importedItems.push({ text: item.text, answered: false, answer: '' })
          existingTexts.add(item.text.trim())
        }
      }
    }

    setImporting(false)

    if (importedItems.length === 0) {
      alert('前月以前に未回答の質問はありません（または重複）')
      return
    }

    const currentNonEmpty = items.filter(it => it.text.trim())
    setItems([...currentNonEmpty, ...importedItems])
    alert(`${importedItems.length}件の未回答質問を取り込みました`)
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    const validItems = items.filter(s => s.text.trim())
    if (validItems.length === 0) { alert('質問内容を1件以上入力してください'); return }
    if (!form.client_name.trim()) { alert('顧客名を入力してください'); return }
    setSaving(true)
    const workDate = workYear && workMonth
      ? `${workYear}-${workMonth.padStart(2, '0')}-01`
      : null
    const supabase = createClient()
    const { error } = await supabase.from('client_questions').insert({
      client_id: form.client_id || null,
      client_code: form.client_code || null,
      client_name: form.client_name,
      question_date: form.question_date,
      work_date: workDate,
      questioner: form.questioner || null,
      category: form.category || null,
      content: JSON.stringify(items),
      status: '未回答',
      answered_date: null,
      answer: null,
    })
    if (error) { alert('エラー: ' + error.message); setSaving(false); return }
    router.push('/client-questions')
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/client-questions" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-800">質問事項 新規追加</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">質問日</label>
            <input type="date" className={ic} value={form.question_date} onChange={e => setForm(f => ({ ...f, question_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">質問者</label>
            <input className={ic} value={form.questioner} onChange={e => setForm(f => ({ ...f, questioner: e.target.value }))} />
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">区分</label>
            <select className={ic} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">処理月</label>
            <div className="flex gap-2">
              <select className={ic} value={workYear} onChange={e => setWorkYear(e.target.value)}>
                {YEARS.map(y => <option key={y} value={String(y)}>{y}年</option>)}
              </select>
              <select className={ic} value={workMonth} onChange={e => setWorkMonth(e.target.value)}>
                {MONTHS.map(m => <option key={m} value={String(m)}>{m}月</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 質問内容リスト */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-xs font-medium text-gray-500">質問内容</label>
            <div className="flex gap-2">
              <button type="button" onClick={importPrevUnanswered} disabled={importing}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg disabled:opacity-50">
                {importing ? '取り込み中...' : '前月の未回答を取り込む'}
              </button>
              <button type="button" onClick={addItem}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg">
                <Plus size={12} /> 質問を追加
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-start gap-2 mb-2">
                  <div className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 bg-white flex-shrink-0" />
                  <input
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    value={item.text}
                    onChange={e => updateItem(i, { text: e.target.value })}
                    placeholder={`質問事項 ${i + 1}`}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                  />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)}
                      className="mt-1 text-gray-300 hover:text-red-400 flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="ml-7">
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm resize-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    rows={2}
                    value={item.answer}
                    onChange={e => updateItem(i, { answer: e.target.value })}
                    placeholder="回答内容（任意）"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/client-questions" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</Link>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
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

export default function ClientQuestionNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <ClientQuestionNewForm />
    </Suspense>
  )
}
