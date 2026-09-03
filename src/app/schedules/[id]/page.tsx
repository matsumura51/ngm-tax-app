'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Schedule } from '@/lib/types'
import { ChevronLeft, Trash2 } from 'lucide-react'
import Link from 'next/link'

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

function makeAutoTitle(clientName: string, color: string): string {
  const name = clientName.trim()
  const kind = color !== '白' ? color : ''
  if (name && kind) return `${name}：${kind}`
  return name || kind
}

export default function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<{ id: string; code: string; name: string }[]>([])
  const [suggestions, setSuggestions] = useState<{ matches: { id: string; code: string; name: string }[]; top: number; left: number } | null>(null)
  const [autoTitle, setAutoTitle] = useState(false)
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([])
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([])
  const [selectedCompanions, setSelectedCompanions] = useState<string[]>([])
  const [breakMinutes, setBreakMinutes] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  function toggleFacility(f: string) {
    setSelectedFacilities(prev =>
      prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]
    )
  }

  const [form, setForm] = useState<{
    title: string; date: string; start_time: string; end_time: string
    color: string; type: string
    client_id: string; client_name: string; client_code: string; memo: string
  }>({ title: '', date: '', start_time: '', end_time: '', color: '白', type: 'スケジュール', client_id: '', client_name: '', client_code: '', memo: '' })

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)
    const [{ data: s }, { data: clientsData }, { data: usersData }] = await Promise.all([
      supabase.from('schedules').select('*').eq('id', id).single(),
      supabase.from('clients').select('id, code, name').order('code'),
      supabase.from('users').select('id, name').order('name'),
    ])
    setClients(clientsData || [])
    setAllUsers(usersData || [])
    if (s) {
      setSchedule(s)
      const start = new Date(s.start_datetime)
      const end = s.end_datetime ? new Date(s.end_datetime) : start
      const color = s.color || '白'
      const clientName = s.client_name || ''
      const title = s.title || ''
      setAutoTitle(title === makeAutoTitle(clientName, color))
      setSelectedFacilities(s.facility ? s.facility.split(',').map((f: string) => f.trim()) : [])
      setSelectedCompanions(s.companions ? s.companions.split(',').map((c: string) => c.trim()) : [])
      setBreakMinutes(s.break_minutes != null ? String(s.break_minutes) : '')
      setForm({
        title,
        date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
        start_time: start.toTimeString().slice(0, 5),
        end_time: end.toTimeString().slice(0, 5),
        color,
        type: s.type || 'スケジュール',
        client_id: s.client_id || '',
        client_name: clientName,
        client_code: s.client_code || '',
        memo: s.memo || '',
      })
    }
  }

  function onColorChange(color: string) {
    setForm(f => ({
      ...f,
      color,
      title: autoTitle ? makeAutoTitle(f.client_name, color) : f.title,
    }))
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
    const { error } = await supabase.from('schedules').update({
      title: form.title || makeAutoTitle(form.client_name, form.color) || '（タイトルなし）',
      start_datetime: toLocalISOString(form.date, form.start_time),
      end_datetime: toLocalISOString(form.date, form.end_time),
      color: form.color,
      type: form.type,
      client_id: form.client_id || null,
      client_name: form.client_name || null,
      client_code: form.client_code || null,
      memo: form.memo || null,
      facility: selectedFacilities.length > 0 ? selectedFacilities.join(',') : null,
      companions: selectedCompanions.length > 0 ? selectedCompanions.join(',') : null,
      break_minutes: breakMinutes ? parseInt(breakMinutes, 10) : null,
    }).eq('id', id)
    if (error) alert('エラー: ' + error.message)
    setSaving(false)
  }

  async function remove() {
    if (!confirm('削除しますか？')) return
    const supabase = createClient()
    await supabase.from('schedules').delete().eq('id', id)
    router.push('/schedules')
  }

  if (!schedule) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/schedules" className="text-gray-400 hover:text-gray-600">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">スケジュール詳細</h1>
        </div>
        <button onClick={remove} className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700">
          <Trash2 size={14} /> 削除
        </button>
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
          {allUsers.filter(u => u.id !== currentUserId).length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">同行者</label>
              <div className="flex flex-wrap gap-2">
                {allUsers.filter(u => u.id !== currentUserId).map(u => (
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

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
            <textarea className={inputClass + ' resize-none'} rows={3} value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/schedules" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            戻る
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
