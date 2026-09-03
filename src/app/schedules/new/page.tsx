'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const FACILITIES = ['アクア', '会議室①', '会議室②']
const FACILITY_COLOR: Record<string, string> = {
  'アクア': 'bg-teal-100 text-teal-700 border-teal-300',
  '会議室①': 'bg-violet-100 text-violet-700 border-violet-300',
  '会議室②': 'bg-pink-100 text-pink-700 border-pink-300',
}

const COLOR_OPTIONS = [
  { value: '外出', label: '外出', color: 'bg-orange-400' },
  { value: '来客（顧問先）', label: '来客（顧問先）', color: 'bg-blue-500' },
  { value: '来客（業者）', label: '来客（業者）', color: 'bg-cyan-500' },
  { value: '所内行事', label: '所内行事', color: 'bg-purple-500' },
  { value: '所内ミーティング', label: '所内ミーティング', color: 'bg-indigo-500' },
  { value: '休み', label: '休み', color: 'bg-gray-400' },
  { value: '緑', label: '緑', color: 'bg-green-500' },
  { value: '黄', label: '黄', color: 'bg-yellow-400' },
  { value: '白', label: '白', color: 'bg-white border border-gray-300' },
]

// タイムゾーンオフセット付きで保存（UTC解釈によるずれを防ぐ）
function toLocalISOString(date: string, time: string): string {
  const offset = -new Date().getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const h = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')
  const m = (Math.abs(offset) % 60).toString().padStart(2, '0')
  return `${date}T${time}:00${sign}${h}:${m}`
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

function generateDates(startDate: string, endDate: string, type: RecurrenceType): string[] {
  if (type === 'none') return [startDate]
  const toYMD = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const endTs = new Date(ey, em - 1, ed).getTime()
  const dates: string[] = []
  const MAX = type === 'daily' ? 366 : type === 'weekly' ? 105 : 25
  let cur = new Date(sy, sm - 1, sd)
  while (cur.getTime() <= endTs && dates.length < MAX) {
    dates.push(toYMD(cur))
    if (type === 'daily') {
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
    } else if (type === 'weekly') {
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7)
    } else {
      const nm = cur.getMonth() + 1
      const ny = nm > 11 ? cur.getFullYear() + 1 : cur.getFullYear()
      const am = nm > 11 ? 0 : nm
      const lastDay = new Date(ny, am + 1, 0).getDate()
      cur = new Date(ny, am, Math.min(sd, lastDay))
    }
  }
  return dates
}

function makeAutoTitle(clientName: string, color: string): string {
  const name = clientName.trim()
  const kind = color !== '白' ? color : ''
  if (name && kind) return `${name}：${kind}`
  return name || kind
}

function ScheduleNewForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [clients, setClients] = useState<{ id: string; code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: { id: string; code: string; name: string }[]; top: number; left: number } | null>(null)
  const [autoTitle, setAutoTitle] = useState(true)
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([])
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>([])
  const [breakMinutes, setBreakMinutes] = useState('')
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none')
  const [recurrenceEnd, setRecurrenceEnd] = useState('')

  const paramDate = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    title: '',
    date: paramDate,
    start_time: '09:00',
    end_time: '10:00',
    color: '白',
    type: 'スケジュール',
    client_id: '',
    client_name: '',
    client_code: '',
    memo: '',
  })

  function toggleFacility(f: string) {
    setSelectedFacilities(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    )
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
        setUserName(data?.name || user.email?.split('@')[0] || '')
      }
      const { data: clientsData } = await supabase.from('clients').select('id, code, name').order('code')
      setClients(clientsData || [])
      const { data: usersData } = await supabase.from('users').select('id, name').order('name')
      setAllUsers(usersData || [])
    }
    init()
  }, [])

  function onColorChange(color: string) {
    setForm(f => {
      const title = autoTitle ? makeAutoTitle(f.client_name, color) : f.title
      return { ...f, color, title }
    })
  }

  function onClientNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setForm(f => ({
      ...f,
      client_name: text,
      client_id: '',
      client_code: '',
      title: autoTitle ? makeAutoTitle(text, f.color) : f.title,
    }))
    if (text.length >= 1) {
      const matches = clients.filter(c => c.name.includes(text)).slice(0, 8)
      if (matches.length > 0) {
        const rect = e.target.getBoundingClientRect()
        setSuggestions({ matches, top: rect.bottom + 2, left: rect.left })
      } else {
        setSuggestions(null)
      }
    } else {
      setSuggestions(null)
    }
  }

  function onClientCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const code = e.target.value
    const found = clients.find(c => c.code === code)
    if (found) {
      setForm(f => ({
        ...f,
        client_id: found.id,
        client_code: found.code,
        client_name: found.name,
        title: autoTitle ? makeAutoTitle(found.name, f.color) : f.title,
      }))
    } else {
      setForm(f => ({ ...f, client_code: code }))
    }
  }

  function selectClient(c: { id: string; code: string; name: string }) {
    setForm(f => ({
      ...f,
      client_id: c.id,
      client_code: c.code,
      client_name: c.name,
      title: autoTitle ? makeAutoTitle(c.name, f.color) : f.title,
    }))
    setSuggestions(null)
  }

  function clearClient() {
    setForm(f => ({
      ...f,
      client_id: '',
      client_code: '',
      client_name: '',
      title: autoTitle ? makeAutoTitle('', f.color) : f.title,
    }))
    setSuggestions(null)
  }

  function onAutoTitleChange(checked: boolean) {
    setAutoTitle(checked)
    if (checked) {
      setForm(f => ({ ...f, title: makeAutoTitle(f.client_name, f.color) }))
    }
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('ログインが必要です'); setSaving(false); return }

    const base = {
      user_id: user.id,
      user_name: userName || userId,
      title: form.title || makeAutoTitle(form.client_name, form.color) || '（タイトルなし）',
      color: form.color,
      type: form.type,
      client_id: form.client_id || null,
      client_name: form.client_name || null,
      client_code: form.client_code || null,
      memo: form.memo || null,
      facility: selectedFacilities.length > 0 ? selectedFacilities.join(',') : null,
      companions: selectedCompanions.length > 0 ? selectedCompanions.join(',') : null,
      break_minutes: breakMinutes ? parseInt(breakMinutes, 10) : null,
    }

    if (recurrence === 'none' || !recurrenceEnd || recurrenceEnd < form.date) {
      const { error } = await supabase.from('schedules').insert({
        ...base,
        start_datetime: toLocalISOString(form.date, form.start_time),
        end_datetime: toLocalISOString(form.date, form.end_time),
      })
      if (error) { alert('エラー: ' + error.message); setSaving(false); return }
    } else {
      const dates = generateDates(form.date, recurrenceEnd, recurrence)
      const recurringId = Date.now()
      const records = dates.map(d => ({
        ...base,
        start_datetime: toLocalISOString(d, form.start_time),
        end_datetime: toLocalISOString(d, form.end_time),
        recurring_id: recurringId,
      }))
      const { error } = await supabase.from('schedules').insert(records)
      if (error) { alert('エラー: ' + error.message); setSaving(false); return }
    }
    router.push('/schedules')
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/schedules" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">スケジュール 新規追加</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="space-y-4">

          {/* 日付・時刻 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">日付</label>
              <input type="date" className={inputClass} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">開始時刻</label>
              <input type="time" className={inputClass} value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">終了時刻</label>
              <input type="time" className={inputClass} value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
          </div>

          {/* 繰り返し */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">繰り返し</label>
            <div className="flex flex-wrap gap-2">
              {([['none', 'なし'], ['daily', '毎日'], ['weekly', '毎週'], ['monthly', '毎月']] as [RecurrenceType, string][]).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setRecurrence(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    recurrence === val
                      ? 'bg-blue-100 border-blue-400 text-blue-700 font-medium'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {recurrence !== 'none' && (
              <div className="mt-2 flex items-center gap-3">
                <label className="text-xs text-gray-500 shrink-0">終了日</label>
                <input type="date" className={inputClass} value={recurrenceEnd} min={form.date}
                  onChange={e => setRecurrenceEnd(e.target.value)} />
                {recurrenceEnd && recurrenceEnd >= form.date && (
                  <span className="text-xs text-blue-600 shrink-0">
                    {generateDates(form.date, recurrenceEnd, recurrence).length}件登録
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 種別（色） */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">種別</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => onColorChange(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition ${
                    form.color === opt.value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                  }`}>
                  <span className={`w-3 h-3 rounded-full ${opt.color}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 顧問先 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">顧問先</label>
            {form.client_name && form.client_id ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
                <span className="font-mono text-gray-500 text-xs">{form.client_code}</span>
                <span className="font-medium text-gray-800">{form.client_name}</span>
                <button onClick={clearClient} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">×</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <input className={inputClass} value={form.client_code}
                  onChange={onClientCodeChange} placeholder="顧客コード" />
                <input className={inputClass} value={form.client_name}
                  onChange={onClientNameChange}
                  onBlur={() => setTimeout(() => setSuggestions(null), 150)}
                  placeholder="顧問先名（部分一致）" />
              </div>
            )}
          </div>

          {/* 施設 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">施設利用</label>
            <div className="flex gap-3">
              {FACILITIES.map(f => (
                <label key={f} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border cursor-pointer transition select-none ${
                  selectedFacilities.includes(f)
                    ? FACILITY_COLOR[f]
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" className="sr-only"
                    checked={selectedFacilities.includes(f)}
                    onChange={() => toggleFacility(f)} />
                  {f}
                </label>
              ))}
            </div>
          </div>

          {/* 同行者 */}
          {allUsers.filter(u => u.id !== userId).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">同行者</label>
              <div className="flex flex-wrap gap-2">
                {allUsers.filter(u => u.id !== userId).map(u => (
                  <label key={u.id} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border cursor-pointer transition select-none ${
                    selectedCompanions.includes(u.name)
                      ? 'bg-purple-100 text-purple-700 border-purple-300'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input type="checkbox" className="sr-only"
                      checked={selectedCompanions.includes(u.name)}
                      onChange={() => setSelectedCompanions(prev =>
                        prev.includes(u.name) ? prev.filter(n => n !== u.name) : [...prev, u.name]
                      )} />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 休憩時間 */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              休憩時間（分）
              {breakMinutes && form.start_time && form.end_time && (() => {
                const start = form.start_time.split(':').map(Number)
                const end = form.end_time.split(':').map(Number)
                const totalMin = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1])
                const net = totalMin - parseInt(breakMinutes, 10)
                if (net > 0) return <span className="ml-2 text-indigo-600 font-normal">→ 実質 {Math.floor(net / 60)}:{String(net % 60).padStart(2, '0')}</span>
                return null
              })()}
            </label>
            <input type="number" min="0" max="480" className={inputClass + ' w-32'}
              value={breakMinutes}
              onChange={e => setBreakMinutes(e.target.value)}
              placeholder="例: 60" />
          </div>

          {/* タイトル */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">タイトル</label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={autoTitle} onChange={e => onAutoTitleChange(e.target.checked)}
                  className="w-3.5 h-3.5 rounded" />
                顧問先・種別から自動生成
              </label>
            </div>
            <input className={inputClass + (autoTitle ? ' bg-gray-50 text-gray-600' : '')}
              value={form.title}
              onChange={e => !autoTitle && setForm(f => ({ ...f, title: e.target.value }))}
              readOnly={autoTitle}
              placeholder={autoTitle ? '顧問先と種別を選択すると自動入力' : 'タイトルを入力'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">担当者</label>
              <input className={inputClass} value={userName} onChange={e => setUserName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">種類</label>
              <select className={inputClass} value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="スケジュール">スケジュール</option>
                <option value="TODO">TODO</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
            <textarea className={inputClass + ' resize-none'} rows={3} value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/schedules" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            キャンセル
          </Link>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      {suggestions && (
        <div style={{ position: 'fixed', top: suggestions.top, left: suggestions.left, minWidth: '260px', zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.matches.map(c => (
            <button key={c.id} type="button"
              onMouseDown={() => selectClient(c)}
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

export default function ScheduleNewPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">読み込み中...</div>}>
      <ScheduleNewForm />
    </Suspense>
  )
}
