'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'

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

function ScheduleNewForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [saving, setSaving] = useState(false)
  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    title: '',
    start_date: today,
    start_time: '09:00',
    end_date: today,
    end_time: '10:00',
    color: '白',
    type: 'スケジュール',
    client_id: searchParams.get('client_id') || '',
    client_name: searchParams.get('client_name') || '',
    client_code: searchParams.get('client_code') || '',
    memo: '',
  })

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
        setUserName(data?.name || user.email?.split('@')[0] || '')
      }
    }
    loadUser()
  }, [])

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.title) { alert('タイトルは必須です'); return }
    setSaving(true)
    const supabase = createClient()
    const start_datetime = `${form.start_date}T${form.start_time}:00`
    const end_datetime = `${form.end_date}T${form.end_time}:00`

    const { data, error } = await supabase.from('schedules').insert({
      user_id: userId,
      user_name: userName,
      title: form.title,
      start_datetime,
      end_datetime,
      color: form.color,
      type: form.type,
      client_id: form.client_id || null,
      client_name: form.client_name || null,
      client_code: form.client_code || null,
      memo: form.memo || null,
    }).select().single()

    if (error) { alert('エラー: ' + error.message); setSaving(false); return }
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">タイトル *</label>
            <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} placeholder="予定のタイトル" />
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
            <label className="block text-xs font-medium text-gray-500 mb-1">色・種別</label>
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
              <label className="block text-xs font-medium text-gray-500 mb-1">担当者</label>
              <input className={inputClass} value={userName} onChange={e => setUserName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">種類</label>
              <select className={inputClass} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="スケジュール">スケジュール</option>
                <option value="TODO">TODO</option>
              </select>
            </div>
          </div>

          {form.client_name ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">顧客</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
                <span className="font-mono text-gray-500 text-xs">{form.client_code}</span>
                <span className="font-medium text-gray-800">{form.client_name}</span>
                <button onClick={() => { set('client_id', ''); set('client_name', ''); set('client_code', '') }} className="ml-auto text-gray-400 hover:text-gray-600 text-xs">×</button>
              </div>
            </div>
          ) : (
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
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
            <textarea className={inputClass + ' resize-none'} rows={3} value={form.memo} onChange={e => set('memo', e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/schedules" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            キャンセル
          </Link>
          <button onClick={save} disabled={saving} className="px-6 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
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
