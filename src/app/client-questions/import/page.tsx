'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, Upload, CheckCircle, Wand2, Search } from 'lucide-react'
import Link from 'next/link'

interface ParsedNote {
  title: string
  date: string
  rawContent: string
  content: string
  tags: string[]
  selected: boolean
  client_id: string
  client_code: string
  client_name: string
  questioner: string
  category: string
  autoDetected: boolean
}

interface ClientOption { id: string; code: string; name: string }

const CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', 'その他']

function extractText(enml: string): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(enml, 'text/html')
    return (doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return enml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
}

function extractFields(text: string): { client_name: string; questioner: string; content: string } {
  const clientPatterns = [/^顧客名[\s　：:]+(.+)/m, /^顧客[\s　：:]+(.+)/m, /^客先[\s　：:]+(.+)/m, /^会社名[\s　：:]+(.+)/m]
  const questionerPatterns = [/^質問者[\s　：:]+(.+)/m, /^担当者[\s　：:]+(.+)/m, /^担当[\s　：:]+(.+)/m, /^確認者[\s　：:]+(.+)/m, /^作成者[\s　：:]+(.+)/m]
  const contentPatterns = [/^(?:質問内容|内容|質問)[\s　：:]+([^]*)/m]
  let client_name = '', questioner = '', content = text
  for (const p of clientPatterns) { const m = text.match(p); if (m) { client_name = m[1].trim(); break } }
  for (const p of questionerPatterns) { const m = text.match(p); if (m) { questioner = m[1].trim(); break } }
  for (const p of contentPatterns) { const m = text.match(p); if (m) { content = m[1].trim(); break } }
  return { client_name, questioner, content }
}

function parseEnex(xml: string): ParsedNote[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  return Array.from(doc.querySelectorAll('note')).map(note => {
    const title = note.querySelector('title')?.textContent || ''
    const created = note.querySelector('created')?.textContent || ''
    const contentRaw = note.querySelector('content')?.textContent || ''
    const tags = Array.from(note.querySelectorAll('tag')).map(t => t.textContent || '').filter(Boolean)
    let date = new Date().toISOString().split('T')[0]
    if (created && created.length >= 8) date = `${created.slice(0,4)}-${created.slice(4,6)}-${created.slice(6,8)}`
    const rawContent = extractText(contentRaw) || title
    const { client_name, questioner, content } = extractFields(rawContent)
    return { title, date, rawContent, content: content || rawContent, tags, selected: true, client_id: '', client_code: '', client_name, questioner, category: '月次', autoDetected: !!(client_name || questioner) }
  })
}

export default function EvernoteImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const clientInputRef = useRef<HTMLInputElement>(null)
  const [notes, setNotes] = useState<ParsedNote[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [importCount, setImportCount] = useState(0)
  const [fileName, setFileName] = useState('')

  // 一括顧客選択
  const [clients, setClients] = useState<ClientOption[]>([])
  const [clientQuery, setClientQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null)
  const [suggestions, setSuggestions] = useState<ClientOption[]>([])
  const [showSug, setShowSug] = useState(false)

  // 一括質問者
  const [globalQuestioner, setGlobalQuestioner] = useState('')

  useEffect(() => {
    createClient().from('clients').select('id, code, name').order('code').then(({ data }) => setClients(data || []))
  }, [])

  function onClientQuery(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setClientQuery(q)
    setSelectedClient(null)
    if (q.length >= 1) {
      setSuggestions(clients.filter(c => c.name.includes(q) || c.code.includes(q)).slice(0, 10))
      setShowSug(true)
    } else {
      setSuggestions([])
      setShowSug(false)
    }
  }

  function selectClient(c: ClientOption) {
    setSelectedClient(c)
    setClientQuery(c.name)
    setShowSug(false)
    // 全行に即時反映
    setNotes(ns => ns.map(n => ({ ...n, client_id: c.id, client_code: c.code, client_name: c.name })))
  }

  function clearClient() {
    setSelectedClient(null)
    setClientQuery('')
    setNotes(ns => ns.map(n => ({ ...n, client_id: '', client_code: '', client_name: '' })))
  }

  function applyQuestioner() {
    if (!globalQuestioner) return
    setNotes(ns => ns.map(n => ({ ...n, questioner: globalQuestioner })))
  }

  function handleFile(file: File) {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseEnex(text)
      if (parsed.length === 0) { alert('ノートが見つかりませんでした。ENEXファイルか確認してください。'); return }
      // 既に顧客が選択されていれば全行に反映
      if (selectedClient) {
        setNotes(parsed.map(n => ({ ...n, client_id: selectedClient.id, client_code: selectedClient.code, client_name: selectedClient.name })))
      } else {
        setNotes(parsed)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  function updateNote(i: number, patch: Partial<ParsedNote>) {
    setNotes(ns => ns.map((n, j) => j === i ? { ...n, ...patch } : n))
  }

  async function doImport() {
    const selected = notes.filter(n => n.selected)
    if (selected.length === 0) { alert('インポートするノートを選択してください'); return }
    setImporting(true)
    const supabase = createClient()
    const { error } = await supabase.from('client_questions').insert(selected.map(n => ({
      client_id: n.client_id || null,
      client_code: n.client_code || null,
      client_name: n.client_name || '',
      question_date: n.date,
      questioner: n.questioner || null,
      category: n.category || null,
      content: n.content,
      status: '未回答',
      answered_date: null,
      answer: null,
    })))
    if (error) { alert('インポートエラー: ' + error.message); setImporting(false); return }
    setImportCount(selected.length)
    setDone(true)
    setImporting(false)
  }

  const selectedCount = notes.filter(n => n.selected).length
  const autoCount = notes.filter(n => n.autoDetected).length

  if (done) {
    return (
      <div className="p-6 max-w-xl">
        <div className="bg-green-50 border border-green-200 rounded-xl p-10 text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <div className="text-xl font-bold text-green-700 mb-2">{importCount}件をインポートしました</div>
          <p className="text-sm text-gray-500 mb-6">質問事項一覧から確認・編集できます</p>
          <Link href="/client-questions" className="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            一覧へ戻る
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/client-questions" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-800">Evernoteからインポート</h1>
      </div>

      {/* 一括設定パネル（常時表示） */}
      <div className="bg-white rounded-xl shadow p-5 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">一括設定（全件に適用）</p>
        <div className="flex items-end gap-4 flex-wrap">

          {/* 顧客名オートコンプリート */}
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">顧客名（選択すると全件に即時反映）</label>
            {selectedClient ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
                <span className="font-mono text-gray-500 text-xs">{selectedClient.code}</span>
                <span className="font-semibold text-gray-800 flex-1">{selectedClient.name}</span>
                <button onClick={clearClient} className="text-gray-400 hover:text-red-500 text-xs font-bold">×</button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400">
                  <Search size={14} className="ml-3 text-gray-400 shrink-0" />
                  <input
                    ref={clientInputRef}
                    className="flex-1 px-2 py-2 text-sm outline-none"
                    value={clientQuery}
                    onChange={onClientQuery}
                    onFocus={() => clientQuery && setShowSug(true)}
                    onBlur={() => setTimeout(() => setShowSug(false), 150)}
                    placeholder="顧客名または顧客コードで検索..."
                  />
                </div>
                {showSug && suggestions.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {suggestions.map(c => (
                      <button key={c.id} type="button" onMouseDown={() => selectClient(c)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                        <span className="font-mono text-gray-400 text-xs shrink-0 w-16">{c.code}</span>
                        <span className="text-gray-700">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 質問者 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">質問者</label>
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={globalQuestioner} onChange={e => setGlobalQuestioner(e.target.value)}
                placeholder="質問者名" />
              <button onClick={applyQuestioner}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg whitespace-nowrap">
                全件に適用
              </button>
            </div>
          </div>

          {/* ファイル選択 */}
          <div className="shrink-0">
            <label className="block text-xs font-medium text-gray-500 mb-1">ENEXファイル</label>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium">
              <Upload size={14} /> {fileName ? 'ファイルを変更' : 'ENEXを選択'}
            </button>
            <input ref={fileInputRef} type="file" accept=".enex" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
          </div>
        </div>

        {fileName && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500"><span className="font-medium text-gray-700">{fileName}</span> — {notes.length}件</span>
            {autoCount > 0 && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                <Wand2 size={11} /> {autoCount}件は自動抽出済み
              </span>
            )}
          </div>
        )}
      </div>

      {notes.length === 0 && !fileName && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 max-w-2xl">
          <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-3">
            <Wand2 size={15} /> Evernoteノートに書いておくと自動取り込みできます
          </div>
          <pre className="bg-white border border-blue-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed">{`顧客名：春日基礎 株式会社
質問者：松村 順
質問内容：
売掛金の仕訳について確認したい。`}</pre>
          <p className="text-xs text-blue-500 mt-2">※「顧客名」「顧客」「客先」「質問者」「担当者」などに対応しています</p>
        </div>
      )}

      {notes.length > 0 && (
        <>
          {/* 一括削除バー */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl mb-2">
            <span className="text-sm text-gray-600 font-medium">{selectedCount} / {notes.length} 件選択中</span>
            <div className="flex gap-3">
              <button onClick={() => setNotes(ns => ns.map(n => ({ ...n, selected: true })))} className="text-xs text-blue-600 hover:underline">全選択</button>
              <button onClick={() => setNotes(ns => ns.map(n => ({ ...n, selected: false })))} className="text-xs text-gray-500 hover:underline">全解除</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 w-8 text-center">
                      <input type="checkbox"
                        checked={selectedCount === notes.length && notes.length > 0}
                        onChange={e => setNotes(ns => ns.map(n => ({ ...n, selected: e.target.checked })))} />
                    </th>
                    <th className="px-3 py-2 text-left w-28">日付</th>
                    <th className="px-3 py-2 text-left w-36">タイトル</th>
                    <th className="px-3 py-2 text-left">質問内容（編集可）</th>
                    <th className="px-3 py-2 text-left w-40">顧客名</th>
                    <th className="px-3 py-2 text-left w-24">区分</th>
                    <th className="px-3 py-2 text-left w-28">質問者</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {notes.map((n, i) => (
                    <tr key={i} className={`align-top ${!n.selected ? 'opacity-40' : ''}`}>
                      <td className="px-3 py-2 text-center pt-3">
                        <input type="checkbox" checked={n.selected} onChange={e => updateNote(i, { selected: e.target.checked })} />
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-xs pt-3 whitespace-nowrap">{n.date}</td>
                      <td className="px-3 py-2 text-gray-700 text-xs pt-3">
                        <div>{n.title}</div>
                        {n.autoDetected && (
                          <span className="inline-flex items-center gap-0.5 mt-1 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                            <Wand2 size={10} /> 自動抽出
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <textarea className="w-full border border-gray-200 rounded px-2 py-1 text-xs resize-none min-w-[220px]"
                          rows={3} value={n.content} onChange={e => updateNote(i, { content: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className={`w-full border rounded px-2 py-1.5 text-xs ${n.client_name ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                          value={n.client_name}
                          onChange={e => updateNote(i, { client_name: e.target.value, client_id: '', client_code: '' })}
                          placeholder="顧客名を入力" />
                      </td>
                      <td className="px-3 py-2">
                        <select className="w-full border border-gray-200 rounded px-1 py-1.5 text-xs"
                          value={n.category} onChange={e => updateNote(i, { category: e.target.value })}>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className={`w-full border rounded px-2 py-1.5 text-xs ${n.questioner ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}
                          value={n.questioner} onChange={e => updateNote(i, { questioner: e.target.value })}
                          placeholder="質問者名" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => { setNotes([]); setFileName('') }}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
              ファイルを変更
            </button>
            <button onClick={doImport} disabled={importing || selectedCount === 0}
              className="px-6 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50">
              {importing ? 'インポート中...' : `${selectedCount}件をインポート`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
