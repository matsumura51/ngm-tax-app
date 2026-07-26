'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { User } from '@/lib/types'
import { ChevronRight, Plus, X } from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  staff: 'スタッフ',
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [form, setForm] = useState({ code: '', name: '', password: '', role: 'staff', department: '' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data || [])
    setLoading(false)
  }

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function createUser() {
    if (!form.code || !form.name || !form.password) {
      setSaveError('ログインID・氏名・パスワードは必須です')
      return
    }
    setSaving(true)
    setSaveError('')

    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()

    if (!res.ok) {
      setSaveError(json.error || 'エラーが発生しました')
      setSaving(false)
      return
    }

    setShowModal(false)
    setForm({ code: '', name: '', password: '', role: 'staff', department: '' })
    await load()
    setSaving(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">ユーザー管理</h1>
        <button
          onClick={() => { setShowModal(true); setSaveError('') }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> スタッフを追加
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400">ユーザーがいません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">氏名</th>
                <th className="px-4 py-3 text-left">ログインID</th>
                <th className="px-4 py-3 text-left">部署</th>
                <th className="px-4 py-3 text-left">権限</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/users/${u.id}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{u.code || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{u.department || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {ROLE_LABELS[u.role || 'staff'] || 'スタッフ'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><ChevronRight size={16} className="text-gray-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-96" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-gray-800">スタッフを追加</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ログインID *</label>
                <input className={inputClass} value={form.code} onChange={e => set('code', e.target.value)} placeholder="例：001" />
                <p className="text-xs text-gray-400 mt-0.5">このIDでログインします</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">氏名 *</label>
                <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例：田中 太郎" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">初期パスワード *</label>
                <input className={inputClass} type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="8文字以上" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">部署</label>
                <input className={inputClass} value={form.department} onChange={e => set('department', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">権限</label>
                <select className={inputClass} value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="staff">スタッフ</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              {saveError && <p className="text-red-500 text-sm">{saveError}</p>}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={createUser} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
