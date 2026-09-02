'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Plus, ChevronDown, ChevronUp, CheckCircle, Clock, Users } from 'lucide-react'

interface Bulletin {
  id: string
  title: string
  content: string | null
  created_by: string | null
  created_at: string
  post_date: string | null
}

interface BulletinRead {
  bulletin_id: string
  user_id: string
  user_name: string | null
  read_at: string
}

export default function BulletinsPage() {
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [reads, setReads] = useState<BulletinRead[]>([])
  const [activeUserCount, setActiveUserCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ title: '', content: '', post_date: today })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      const { data: u } = await supabase.from('users').select('name').eq('id', user.id).maybeSingle()
      setCurrentUserName(u?.name || '')
    }

    const [{ data: bData }, { data: rData }, { data: uData }] = await Promise.all([
      supabase.from('bulletins').select('*').order('created_at', { ascending: false }),
      supabase.from('bulletin_reads').select('*'),
      supabase.from('users').select('id').is('leave_date', null),
    ])
    setBulletins(bData || [])
    setReads(rData || [])
    setActiveUserCount((uData || []).length)
    setLoading(false)
  }

  function readsFor(bulletinId: string) {
    return reads.filter(r => r.bulletin_id === bulletinId)
  }

  function fmtDate(b: Bulletin) {
    const src = b.post_date || b.created_at
    return new Date(src).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  function isReadByMe(bulletinId: string) {
    return reads.some(r => r.bulletin_id === bulletinId && r.user_id === currentUserId)
  }

  function isCompleted(bulletinId: string) {
    return readsFor(bulletinId).length >= activeUserCount
  }

  async function confirmRead(bulletinId: string) {
    const supabase = createClient()
    await supabase.from('bulletin_reads').upsert({
      bulletin_id: bulletinId,
      user_id: currentUserId,
      user_name: currentUserName,
    }, { onConflict: 'bulletin_id,user_id' })
    await load()
  }

  async function createBulletin() {
    if (!form.title.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('bulletins').insert({
      title: form.title.trim(),
      content: form.content.trim() || null,
      created_by: currentUserName || currentUserId,
      post_date: form.post_date || null,
    })
    setForm({ title: '', content: '', post_date: today })
    setShowForm(false)
    setSaving(false)
    await load()
  }

  async function deleteBulletin(id: string) {
    if (!confirm('この掲示板を削除しますか？')) return
    const supabase = createClient()
    await supabase.from('bulletins').delete().eq('id', id)
    await load()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const active = bulletins.filter(b => !isCompleted(b.id))
  const completed = bulletins.filter(b => isCompleted(b.id))

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">掲示板</h1>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition">
          <Plus size={15} />
          新規投稿
        </button>
      </div>

      {/* 新規投稿フォーム */}
      {showForm && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-bold text-amber-800 mb-3">新規掲示板投稿</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">掲示日</label>
              <input type="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.post_date} onChange={e => setForm(f => ({ ...f, post_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">タイトル <span className="text-red-500">*</span></label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="掲示板のタイトルを入力" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">内容</label>
              <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                rows={5} value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="掲示板の内容を入力" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowForm(false); setForm({ title: '', content: '', post_date: today }) }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={createBulletin} disabled={saving || !form.title.trim()}
                className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg disabled:opacity-50">
                {saving ? '投稿中...' : '投稿する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <>
          {/* 確認待ち（未完了） */}
          {active.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={14} className="text-amber-500" />
                <span className="text-sm font-semibold text-gray-700">確認待ち（{active.length}件）</span>
              </div>
              <div className="space-y-3">
                {active.map(b => {
                  const bReads = readsFor(b.id)
                  const myRead = isReadByMe(b.id)
                  const isExp = expanded.has(b.id)
                  return (
                    <div key={b.id} className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-800">{b.title}</span>
                              {myRead && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <CheckCircle size={10} /> 確認済み
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mb-2">
                              {b.created_by} · {fmtDate(b)}
                            </div>
                            {b.content && (
                              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{b.content}</p>
                            )}
                          </div>
                          {!myRead && (
                            <button onClick={() => confirmRead(b.id)}
                              className="shrink-0 px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition">
                              確認済み
                            </button>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full transition-all"
                              style={{ width: `${activeUserCount > 0 ? (bReads.length / activeUserCount) * 100 : 0}%` }} />
                          </div>
                          <button onClick={() => toggleExpand(b.id)}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                            <Users size={11} />
                            {bReads.length}/{activeUserCount}名確認済み
                            {isExp ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </div>

                        {isExp && (
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            {bReads.length === 0 ? (
                              <p className="text-xs text-gray-400">まだ誰も確認していません</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {bReads.map(r => (
                                  <span key={r.user_id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                                    {r.user_name || r.user_id}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button onClick={() => deleteBulletin(b.id)}
                          className="text-xs text-red-400 hover:text-red-600">削除</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 完了済み */}
          {completed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} className="text-green-500" />
                <span className="text-sm font-semibold text-gray-500">全員確認済み（{completed.length}件）</span>
              </div>
              <div className="space-y-2">
                {completed.map(b => {
                  const bReads = readsFor(b.id)
                  const isExp = expanded.has(b.id)
                  return (
                    <div key={b.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden opacity-70">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-600">{b.title}</span>
                              <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <CheckCircle size={10} /> 全員確認済み
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mb-2">
                              {b.created_by} · {fmtDate(b)}
                            </div>
                            {b.content && (
                              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{b.content}</p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-end">
                          <button onClick={() => toggleExpand(b.id)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                            <Users size={11} />
                            {bReads.length}名が確認
                            {isExp ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </div>
                        {isExp && bReads.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                            {bReads.map(r => (
                              <span key={r.user_id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                                {r.user_name || r.user_id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button onClick={() => deleteBulletin(b.id)}
                          className="text-xs text-red-400 hover:text-red-600">削除</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {bulletins.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm">掲示板はまだありません</p>
              <p className="text-xs mt-1">「新規投稿」ボタンから投稿できます</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
