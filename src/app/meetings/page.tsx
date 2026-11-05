'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, X, Trash2, Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { useSessionState } from '@/lib/useSessionState'
import StaffSelect from '@/components/StaffSelect'
import { staffKey } from '@/lib/staffName'
import { useClientPrimaryStaff } from '@/lib/useClientPrimaryStaff'
import { Meeting, MEETING_METHODS, MEETING_CATEGORIES, methodStyle, fmtTime } from '@/lib/meetings'

const fc = 'border border-gray-300 rounded-lg px-3 py-2 text-sm'

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [attachCount, setAttachCount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useSessionState('meetings_clientName', '')
  const [keyword, setKeyword] = useSessionState('meetings_keyword', '')
  const [method, setMethod] = useSessionState('meetings_method', '')
  const [category, setCategory] = useSessionState('meetings_category', '')
  const [dateFrom, setDateFrom] = useSessionState('meetings_dateFrom', '')
  const [dateTo, setDateTo] = useSessionState('meetings_dateTo', '')
  const [staff, setStaff] = useSessionState('meetings_staff', '')
  const primaryStaffOf = useClientPrimaryStaff()
  // 顧問先の主担当で絞り込み（顧客カルテの今の主担当。字体の違いは同一視）
  const shown = staff ? meetings.filter(m => staffKey(primaryStaffOf(m)) === staffKey(staff)) : meetings

  useEffect(() => { load() }, [])

  type P = { clientName?: string; keyword?: string; method?: string; category?: string; dateFrom?: string; dateTo?: string }
  async function load(p?: P) {
    setLoading(true)
    const supabase = createClient()
    const cn = (p?.clientName ?? clientName).normalize('NFKC').trim()
    const kw = (p?.keyword ?? keyword).normalize('NFKC').trim().replace(/[,()%]/g, ' ')
    const me = p?.method ?? method
    const ca = p?.category ?? category
    const df = p?.dateFrom ?? dateFrom
    const dt = p?.dateTo ?? dateTo
    const rows = await fetchAllRows<Meeting>(() => {
      let q = supabase.from('meetings').select('*')
        .order('meeting_date', { ascending: false })
        .order('start_time', { ascending: false, nullsFirst: false })
        .order('id')
      if (cn) q = q.ilike('client_name', `%${cn}%`)
      if (kw) q = q.or(['subject', 'content', 'decisions', 'todo', 'attendees_client'].map(c => `${c}.ilike.%${kw}%`).join(','))
      if (me) q = q.eq('method', me)
      if (ca) q = q.eq('category', ca)
      if (df) q = q.gte('meeting_date', df)
      if (dt) q = q.lte('meeting_date', dt)
      return q
    })
    setMeetings(rows)
    const att = await fetchAllRows<{ meeting_id: string }>(() => supabase.from('meeting_attachments').select('meeting_id, id').order('id'))
    const cnt: Record<string, number> = {}
    for (const a of att) cnt[a.meeting_id] = (cnt[a.meeting_id] || 0) + 1
    setAttachCount(cnt)
    setLoading(false)
  }

  function clear() {
    setClientName(''); setKeyword(''); setMethod(''); setCategory(''); setDateFrom(''); setDateTo(''); setStaff('')
    load({ clientName: '', keyword: '', method: '', category: '', dateFrom: '', dateTo: '' })
  }

  async function remove(m: Meeting) {
    if (!confirm(`「${m.client_name}」${m.meeting_date} の打合せ記録を削除しますか？（添付ファイルも削除されます）`)) return
    const supabase = createClient()
    const { data: att } = await supabase.from('meeting_attachments').select('file_path').eq('meeting_id', m.id)
    if (att && att.length > 0) await supabase.storage.from('attachments').remove(att.map(a => a.file_path))
    const { error } = await supabase.from('meetings').delete().eq('id', m.id)
    if (error) { alert('削除エラー: ' + error.message); return }
    setMeetings(ms => ms.filter(x => x.id !== m.id))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">打合せ記録</h1>
        <Link href="/meetings/new"
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> 新規作成
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <input className={fc} placeholder="顧客名" value={clientName} onChange={e => setClientName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
          <input className={fc} placeholder="キーワード（件名・内容など）" value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()} />
          <StaffSelect className={fc} value={staff} onChange={v => setStaff(v)} emptyLabel="主担当：すべて" />
          <select className={fc} value={method} onChange={e => setMethod(e.target.value)}>
            <option value="">方法：すべて</option>
            {MEETING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={fc} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">区分：すべて</option>
            {MEETING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" className={fc} value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="打合せ日（から）" />
          <input type="date" className={fc} value={dateTo} onChange={e => setDateTo(e.target.value)} title="打合せ日（まで）" />
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => load()} className="flex items-center gap-1 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Search size={14} /> 検索
          </button>
          <button onClick={clear} className="flex items-center gap-1 px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            <X size={14} /> クリア
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-12 text-gray-400">該当する打合せ記録がありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left w-32">打合せ日</th>
                <th className="px-4 py-3 text-left w-24">方法</th>
                <th className="px-4 py-3 text-left w-24">顧客コード</th>
                <th className="px-4 py-3 text-left w-44">顧客名</th>
                <th className="px-4 py-3 text-left w-20">主担当</th>
                <th className="px-4 py-3 text-left w-20">区分</th>
                <th className="px-4 py-3 text-left">件名・内容</th>
                <th className="px-4 py-3 text-left w-28">次回予定</th>
                <th className="px-4 py-3 text-left w-20">記録者</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition group">
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {m.meeting_date}
                    {m.start_time && <div className="text-xs text-gray-400">{fmtTime(m.start_time)}{m.end_time ? `〜${fmtTime(m.end_time)}` : ''}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {m.method && <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${methodStyle[m.method] || methodStyle['その他']}`}>{m.method}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{m.client_code}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <Link href={`/meetings/${m.id}`} className="hover:text-blue-600">{m.client_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{primaryStaffOf(m) || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{m.category}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-md">
                    <Link href={`/meetings/${m.id}`} className="hover:text-blue-600 block">
                      {m.subject && <div className="font-medium flex items-center gap-1">{m.subject}{attachCount[m.id] ? <Paperclip size={12} className="text-gray-400" /> : null}</div>}
                      <div className="line-clamp-2 text-gray-500 text-xs">{m.content}</div>
                      {!m.subject && attachCount[m.id] ? <Paperclip size={12} className="text-gray-400" /> : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{m.next_date || ''}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.recorder}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => remove(m)} className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-400 text-right">{shown.length}件</div>
    </div>
  )
}
