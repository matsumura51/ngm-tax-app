'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@/lib/types'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [user, setUser] = useState<User | null>(null)
  const [form, setForm] = useState({ name: '', code: '', department: '', role: 'staff' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase.from('users').select('*').eq('id', id).single()
    if (data) {
      setUser(data)
      setForm({ name: data.name || '', code: data.code || '', department: data.department || '', role: data.role || 'staff' })
    }
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('users').update({
      name: form.name,
      code: form.code || null,
      department: form.department || null,
      role: form.role,
    }).eq('id', id)
    if (error) alert('エラー: ' + error.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }

  if (!user) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/users" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">ユーザー編集</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-xs text-gray-500 mb-1">メールアドレス（変更不可）</div>
          <div className="text-sm text-gray-700">{user.email}</div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">氏名 *</label>
            <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">コード</label>
            <input className={inputClass} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="例：001" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">部署</label>
            <input className={inputClass} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">権限</label>
            <select className={inputClass} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="staff">スタッフ</option>
              <option value="admin">管理者</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/users" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            戻る
          </Link>
          <button onClick={save} disabled={saving} className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {saved ? '保存しました' : saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
