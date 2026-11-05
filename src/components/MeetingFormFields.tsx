'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { MeetingForm, MEETING_METHODS, MEETING_CATEGORIES } from '@/lib/meetings'

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const lc = 'block text-xs font-medium text-gray-500 mb-1'

type ClientRow = { id: string; code: string; name: string }

// 打合せ記録の入力欄（新規・詳細で共通）
export default function MeetingFormFields({ form, setForm }: {
  form: MeetingForm
  setForm: (fn: (f: MeetingForm) => MeetingForm) => void
}) {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: ClientRow[]; top: number; left: number } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    fetchAllRows<ClientRow>(() => supabase.from('clients').select('id, code, name').order('code')).then(setClients)
  }, [])

  const set = <K extends keyof MeetingForm>(k: K, v: MeetingForm[K]) => setForm(f => ({ ...f, [k]: v }))

  function onClientNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setForm(f => ({ ...f, client_name: text, client_id: null, client_code: null }))
    if (text.length >= 1) {
      const q = text.normalize('NFKC')
      const matches = clients.filter(c => c.name.normalize('NFKC').includes(q)).slice(0, 8)
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

  function selectClient(c: ClientRow) {
    setForm(f => ({ ...f, client_id: c.id, client_code: c.code, client_name: c.name }))
    setSuggestions(null)
  }

  return (
    <>
      <div>
        <label className={lc}>顧客 <span className="text-red-500">*</span></label>
        {form.client_name && form.client_id ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
            <span className="font-mono text-gray-500 text-xs">{form.client_code}</span>
            <span className="font-medium text-gray-800">{form.client_name}</span>
            <button type="button" onClick={() => setForm(f => ({ ...f, client_id: null, client_code: null, client_name: '' }))}
              className="ml-auto text-gray-400 hover:text-gray-600 text-xs">×</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <input className={ic} value={form.client_code || ''} onChange={onClientCodeChange} placeholder="顧客コード" />
            <input className={ic} value={form.client_name} onChange={onClientNameChange}
              onBlur={() => setTimeout(() => setSuggestions(null), 150)} placeholder="顧客名（部分一致）" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={lc}>打合せ日 <span className="text-red-500">*</span></label>
          <input type="date" className={ic} value={form.meeting_date} onChange={e => set('meeting_date', e.target.value)} />
        </div>
        <div>
          <label className={lc}>開始時刻</label>
          <input type="time" className={ic} value={form.start_time?.slice(0, 5) || ''} onChange={e => set('start_time', e.target.value)} />
        </div>
        <div>
          <label className={lc}>終了時刻</label>
          <input type="time" className={ic} value={form.end_time?.slice(0, 5) || ''} onChange={e => set('end_time', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">方法</label>
        <div className="flex flex-wrap gap-2">
          {MEETING_METHODS.map(m => (
            <button key={m} type="button" onClick={() => set('method', m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${form.method === m
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lc}>場所</label>
          <input className={ic} value={form.place || ''} onChange={e => set('place', e.target.value)} placeholder="事務所・先方本社・Zoom など" />
        </div>
        <div>
          <label className={lc}>区分</label>
          <select className={ic} value={form.category || ''} onChange={e => set('category', e.target.value)}>
            <option value="">—</option>
            {MEETING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={lc}>件名</label>
        <input className={ic} value={form.subject || ''} onChange={e => set('subject', e.target.value)} placeholder="例：決算前の打合せ" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lc}>出席者（先方）</label>
          <input className={ic} value={form.attendees_client || ''} onChange={e => set('attendees_client', e.target.value)} placeholder="社長、経理担当 など" />
        </div>
        <div>
          <label className={lc}>出席者（事務所）</label>
          <input className={ic} value={form.attendees_office || ''} onChange={e => set('attendees_office', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={lc}>打合せ内容</label>
        <textarea className={ic + ' resize-y'} rows={8} value={form.content || ''} onChange={e => set('content', e.target.value)} />
      </div>

      <div>
        <label className={lc}>決定事項</label>
        <textarea className={ic + ' resize-y'} rows={4} value={form.decisions || ''} onChange={e => set('decisions', e.target.value)} />
      </div>

      <div>
        <label className={lc}>宿題・次回までの対応</label>
        <textarea className={ic + ' resize-y'} rows={4} value={form.todo || ''} onChange={e => set('todo', e.target.value)}
          placeholder="誰が・何を・いつまでに" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lc}>次回予定日</label>
          <input type="date" className={ic} value={form.next_date || ''} onChange={e => set('next_date', e.target.value)} />
        </div>
        <div>
          <label className={lc}>記録者</label>
          <input className={ic} value={form.recorder || ''} onChange={e => set('recorder', e.target.value)} />
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
    </>
  )
}
