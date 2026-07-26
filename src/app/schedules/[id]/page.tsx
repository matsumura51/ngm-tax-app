'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Schedule } from '@/lib/types'
import { ChevronLeft, Trash2 } from 'lucide-react'
import Link from 'next/link'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

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

export default function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    title: string; start_date: string; start_time: string;
    end_date: string; end_time: string; color: string; type: string;
    client_name: string; client_code: string; memo: string;
  }>({ title: '', start_date: '', start_time: '', end_date: '', end_time: '', color: '白', type: 'スケジュール', client_name: '', client_code: '', memo: '' })

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('schedules').select('*').eq('id', id).single()
    if (data) {
      setSchedule(data)
      const start = new Date(data.start_datetime)
      const end = data.end_datetime ? new Date(data.end_datetime) : start
      setForm({
        title: data.title,
        start_date: start.toISOString().split('T')[0],
        start_time: start.toTimeString().slice(0, 5),
        end_date: end.toISOString().split('T')[0],
        end_time: end.toTimeString().slice(0, 5),
        color: data.color || '白',
        type: data.type || 'スケジュール',
        client_name: data.client_name || '',
        client_code: data.client_code || '',
        memo: data.memo || '',
      })
    }
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('schedules').update({
      title: form.title,
      start_datetime: `${form.start_date}T${form.start_time}:00`,
      end_datetime: `${form.end_date}T${form.end_time}:00`,
      color: form.color,
      type: form.type,
      client_name: form.client_name || null,
      client_code: form.client_code || null,
      memo: form.memo || null,
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

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">タイトル</label>
            <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">開始日</label>
              <input type="date" className={inputClass} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">開始時刻</label>
              <input type="time" className={inputClass} value={form.start_time} onChange={e => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">終了日</label>
              <input type="date" className={inputClass} value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">終了時刻</label>
              <input type="time" className={inputClass} value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">色・種別</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('color', opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition ${
                    form.color === opt.value ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${opt.color}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">顧客コード</label>
              <input className={inputClass} value={form.client_code} onChange={e => set('client_code', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">顧客名</label>
              <input className={inputClass} value={form.client_name} onChange={e => set('client_name', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
            <textarea className={inputClass + ' resize-none'} rows={3} value={form.memo} onChange={e => set('memo', e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/schedules" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            戻る
          </Link>
          <button onClick={save} disabled={saving} className="px-6 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
