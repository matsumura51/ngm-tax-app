'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Schedule } from '@/lib/types'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { isHoliday } from 'japanese-holidays'

function getHolidayName(date: Date): string | null {
  return isHoliday(new Date(date.getFullYear(), date.getMonth(), date.getDate())) || null
}

type ViewMode = '月間' | '週間' | '日間'

// kintone風カラー
const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  '出勤':         { bg: '#26a69a', text: '#fff' },
  '外出':         { bg: '#e57373', text: '#fff' },
  '来客（顧問先）': { bg: '#64b5f6', text: '#fff' },
  '来客（業者）':  { bg: '#4fc3f7', text: '#fff' },
  '所内行事':     { bg: '#ba68c8', text: '#fff' },
  '所内ミーティング': { bg: '#7986cb', text: '#fff' },
  '休み':         { bg: '#ffb74d', text: '#fff' },
  '白':           { bg: '#f5f5f5', text: '#555' },
  '緑':           { bg: '#66bb6a', text: '#fff' },
  'グレー':       { bg: '#90a4ae', text: '#fff' },
  '茶':           { bg: '#a1887f', text: '#fff' },
  '紫':           { bg: '#ab47bc', text: '#fff' },
  '黄':           { bg: '#ffd54f', text: '#555' },
  '紺':           { bg: '#1a237e', text: '#fff' },
}
function colorStyle(color: string | null): React.CSSProperties {
  const c = COLOR_MAP[color || '白'] ?? { bg: '#e57373', text: '#fff' }
  return { backgroundColor: c.bg, color: c.text }
}
const FACILITY_COLOR: Record<string, string> = {
  'アクア': 'bg-teal-100 text-teal-700',
  '会議室①': 'bg-violet-100 text-violet-700',
  '会議室②': 'bg-pink-100 text-pink-700',
}
const FACILITIES = ['アクア', '会議室①', '会議室②']
const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土']
const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8~19

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function getFirstDayOfWeek(y: number, m: number) { return new Date(y, m, 1).getDay() }
function pad(n: number) { return n.toString().padStart(2, '0') }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function formatTime(dt: string) {
  return new Date(dt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}
function calcTotal(scheds: Schedule[]): string {
  let total = 0
  for (const s of scheds) {
    if (!s.start_datetime || !s.end_datetime) continue
    const diff = (new Date(s.end_datetime).getTime() - new Date(s.start_datetime).getTime()) / 60000
    if (diff > 0) total += diff
  }
  if (!total) return ''
  const h = total / 60
  return `合計：${h % 1 === 0 ? h : h.toFixed(2)}時間`
}
function getWeekDays(date: Date): Date[] {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => { const w = new Date(d); w.setDate(d.getDate() + i); return w })
}
function timeToMinutes(dt: string) {
  const d = new Date(dt)
  return d.getHours() * 60 + d.getMinutes()
}
function minutesToPct(min: number) {
  return Math.max(0, Math.min(100, ((min - 480) / 660) * 100)) // 8:00~19:00 = 660min
}

interface UserInfo { id: string; name: string; division: string | null }
interface Report { user_id: string; date: string }

function SchedulesContent() {
  const searchParams = useSearchParams()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [today] = useState(new Date())
  const [viewDate, setViewDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // SSR時はパラムが読めないのでデフォルト月間、クライアントでURLパラム反映
    return '月間'
  })
  const [facilityFilter, setFacilityFilter] = useState<string | null>(null)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('all')
  const [selectedDivision, setSelectedDivision] = useState<string>('all')
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // URLパラム ?view= でビュー切替
  useEffect(() => {
    const v = searchParams.get('view') as ViewMode | null
    if (v && ['月間', '週間', '日間'].includes(v)) setViewMode(v)
  }, [searchParams])

  useEffect(() => { loadUsers() }, [])
  useEffect(() => { load() }, [viewDate, viewMode, selectedUserId])

  async function loadUsers() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) { setCurrentUserId(user.id); setSelectedUserId(user.id) }
    const { data } = await supabase.from('users').select('id, name, leave_date, code, division').order('code')
    setUsers((data || []).filter((u: { leave_date: string | null }) => !u.leave_date))
  }

  async function load() {
    const supabase = createClient()
    let startDate: string, endDate: string
    if (viewMode === '月間') {
      startDate = `${year}-${pad(month + 1)}-01`
      endDate = `${year}-${pad(month + 1)}-${pad(getDaysInMonth(year, month))}`
    } else if (viewMode === '週間') {
      const wd = getWeekDays(viewDate)
      startDate = toDateStr(wd[0]); endDate = toDateStr(wd[6])
    } else {
      startDate = endDate = toDateStr(viewDate)
    }

    // クエリ範囲を前後1日広げてUTC/JST境界による取りこぼしを防ぐ（表示フィルタはローカル時刻で行う）
    const qStart = new Date(startDate); qStart.setDate(qStart.getDate() - 1)
    const qEnd = new Date(endDate); qEnd.setDate(qEnd.getDate() + 1)
    const { data: schData } = await supabase.from('schedules').select('*')
      .gte('start_datetime', toDateStr(qStart) + 'T00:00:00')
      .lte('start_datetime', toDateStr(qEnd) + 'T23:59:59')
      .order('start_datetime')
    setSchedules(schData || [])

    const { data: rpData } = await supabase.from('daily_reports')
      .select('user_id, date').gte('date', startDate).lte('date', endDate)
    setReports(rpData || [])
  }

  function navigate(dir: -1 | 1) {
    if (viewMode === '月間') setViewDate(new Date(year, month + dir, 1))
    else if (viewMode === '週間') setViewDate(new Date(viewDate.getTime() + dir * 7 * 86400000))
    else setViewDate(new Date(viewDate.getTime() + dir * 86400000))
  }

  function hasReport(userId: string, dateStr: string) {
    return reports.some(r => r.user_id === userId && r.date === dateStr)
  }

  function daySchedules(date: Date, userId?: string): Schedule[] {
    const ds = toDateStr(date)
    const userName = userId ? users.find(u => u.id === userId)?.name : undefined
    return schedules.filter(s => {
      if (toDateStr(new Date(s.start_datetime)) !== ds) return false
      if (userId) {
        const isOwner = s.user_id === userId
        const companionNames = s.companions ? s.companions.split(',').map(c => c.trim()) : []
        const isCompanion = !!userName && companionNames.includes(userName)
        if (!isOwner && !isCompanion) return false
      }
      if (facilityFilter && !s.facility?.split(',').map(f => f.trim()).includes(facilityFilter)) return false
      return true
    })
  }

  const divisionOptions = Array.from(new Set(users.map(u => u.division).filter(Boolean))).sort() as string[]
  const usersInDivision = selectedDivision === 'all' ? users : users.filter(u => u.division === selectedDivision)
  const displayUsers = (selectedUserId === 'all' ? usersInDivision : usersInDivision.filter(u => u.id === selectedUserId))
    .slice()
    .sort((a, b) => {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
      return 0
    })

  function viewTitle() {
    if (viewMode === '月間') return `${year}年${month + 1}月`
    if (viewMode === '週間') {
      const wd = getWeekDays(viewDate)
      const s = wd[0], e = wd[6]
      if (s.getMonth() === e.getMonth())
        return `${s.getFullYear()}年${s.getMonth() + 1}月 ${s.getDate()}日〜${e.getDate()}日`
      return `${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`
    }
    const h = getHolidayName(viewDate)
    return `${year}年${month + 1}月${viewDate.getDate()}日（${WEEK_LABELS[viewDate.getDay()]}）${h ? '　' + h : ''}`
  }

  // ── 月間ビュー ──
  function renderMonthly() {
    const dim = getDaysInMonth(year, month)
    const first = getFirstDayOfWeek(year, month)
    const weeks: (number | null)[][] = []
    let d = 1 - first
    for (let w = 0; w < 6; w++) {
      const wk: (number | null)[] = []
      for (let i = 0; i < 7; i++) { wk.push(d > 0 && d <= dim ? d : null); d++ }
      weeks.push(wk)
      if (d > dim) break
    }
    return (
      <>
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500 mb-1">
          {WEEK_LABELS.map((lbl, i) => (
            <div key={lbl} className={`py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}`}>{lbl}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {weeks.flat().map((d, i) => {
            const date = d ? new Date(year, month, d) : null
            const isToday = date ? toDateStr(date) === toDateStr(today) : false
            const scheds = date ? daySchedules(date, selectedUserId !== 'all' ? selectedUserId : undefined) : []
            const ds = date ? toDateStr(date) : ''
            const dayOfWeek = i % 7
            const holiday = date ? getHolidayName(date) : null
            const isRed = dayOfWeek === 0 || !!holiday
            const usedFacilities = Array.from(new Set(
              scheds.flatMap(s => s.facility ? s.facility.split(',').map(f => f.trim()) : [])
            ))
            const reportUsers = date ? reports.filter(r => r.date === ds) : []
            const allHaveReport = scheds.length > 0 && displayUsers.every(u => reportUsers.some(r => r.user_id === u.id))
            return (
              <div key={i} className={`min-h-36 border border-gray-300 rounded p-1.5 text-xs ${d ? (holiday ? 'bg-red-50' : 'bg-white') : 'bg-gray-50'}`}>
                {d && (
                  <>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1">
                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-medium ${
                          isToday ? 'bg-blue-600 text-white' : isRed ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'
                        }`}>{d}</span>
                        {holiday && <span className="text-[9px] text-red-500 font-medium leading-none truncate max-w-[60px]">{holiday}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {scheds.length > 0 && (
                          <span className={`text-[9px] px-1 py-0.5 rounded font-medium leading-none ${allHaveReport ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                            日報{allHaveReport ? '登録済' : '未登録'}
                          </span>
                        )}
                        <Link href={`/schedules/new?date=${ds}`} className="text-gray-300 hover:text-gray-600 leading-none">
                          <Plus size={11} />
                        </Link>
                      </div>
                    </div>
                    {usedFacilities.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mb-0.5">
                        {usedFacilities.map(f => (
                          <span key={f} className={`text-[8px] px-1 py-0.5 rounded font-medium leading-none ${FACILITY_COLOR[f] || 'bg-gray-100 text-gray-600'}`}>{f}</span>
                        ))}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {scheds.slice(0, 4).map(s => {
                        const comps = s.companions ? s.companions.split(',').map(c => c.trim()).filter(c => c) : []
                        const filterUserName = selectedUserId !== 'all' ? users.find(u => u.id === selectedUserId)?.name : undefined
                        const isCompanionEvent = !!filterUserName && s.user_id !== selectedUserId && comps.includes(filterUserName)
                        return (
                          <Link key={s.id} href={`/schedules/${s.id}`}>
                            <div className={`text-xs px-1.5 py-1 rounded leading-snug hover:opacity-80 transition ${isCompanionEvent ? 'ring-1 ring-white/60' : ''}`}
                              style={colorStyle(s.color)}>
                              <div className="opacity-90 text-xs font-bold whitespace-nowrap">
                                {formatTime(s.start_datetime)}{s.end_datetime ? ` - ${formatTime(s.end_datetime)}` : ''}
                                {s.break_minutes ? <span className="ml-1 opacity-70">休{s.break_minutes}分</span> : null}
                              </div>
                              {s.user_name && (
                                <div className="truncate text-[9px] opacity-70">
                                  {isCompanionEvent && <span className="opacity-70 font-normal">同行: </span>}
                                  {s.user_name}{comps.length > 0 ? `・${comps.join('・')}` : ''}
                                </div>
                              )}
                              <div className="truncate text-xs font-bold">{s.title}</div>
                            </div>
                          </Link>
                        )
                      })}
                      {scheds.length > 4 && <div className="text-gray-400 pl-1 text-[10px]">+{scheds.length - 4}件</div>}
                    </div>
                    {calcTotal(scheds) && <div className="text-right text-[9px] text-gray-400 mt-0.5">{calcTotal(scheds)}</div>}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ── 週間ビュー ──
  function renderWeekly() {
    const weekDays = getWeekDays(viewDate)
    return (
      <div>
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1 ml-0">
          {weekDays.map((d, i) => {
            const isToday = toDateStr(d) === toDateStr(today)
            const holiday = getHolidayName(d)
            const isRed = i === 0 || !!holiday
            return (
              <div key={i} className={`text-center py-1 text-xs font-semibold ${isRed ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? 'bg-blue-600 text-white' : ''}`}>
                  {d.getDate()}
                </span>
                <div>{WEEK_LABELS[i]}</div>
                {holiday && <div className="text-[9px] text-red-400 font-medium leading-tight">{holiday}</div>}
              </div>
            )
          })}
        </div>
        {displayUsers.map(user => (
          <div key={user.id} className="mb-2 border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 border-b border-gray-300">
              {user.name}
            </div>
            <div className="grid grid-cols-7 divide-x divide-gray-100">
              {weekDays.map((d, i) => {
                const ds = toDateStr(d)
                const scheds = daySchedules(d, user.id)
                const reported = hasReport(user.id, ds)
                const isToday = ds === toDateStr(today)
                return (
                  <div key={i} className={`min-h-28 p-1.5 text-xs ${isToday ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      {scheds.length > 0 ? (
                        <span className={`text-[8px] px-1 py-0.5 rounded font-medium leading-none ${reported ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                          日報{reported ? '済' : '未'}
                        </span>
                      ) : <span />}
                      <Link href={`/schedules/new?date=${ds}`} className="text-gray-300 hover:text-gray-600">
                        <Plus size={10} />
                      </Link>
                    </div>
                    <div className="space-y-0.5">
                      {scheds.map(s => {
                        const facs = s.facility ? s.facility.split(',').map(f => f.trim()).filter(f => f) : []
                        const comps = s.companions ? s.companions.split(',').map(c => c.trim()).filter(c => c) : []
                        const breakMin = s.break_minutes
                        // この行のユーザーが同行者として登録されているか（主担当でない場合）
                        const isCompanionEvent = s.user_id !== user.id && comps.includes(user.name)
                        return (
                          <Link key={s.id} href={`/schedules/${s.id}`}>
                            <div className={`text-xs px-1.5 py-1 rounded leading-snug hover:opacity-80 transition ${isCompanionEvent ? 'ring-1 ring-white/60' : ''}`}
                              style={colorStyle(s.color)}>
                              <div className="opacity-90 text-xs font-bold whitespace-nowrap">
                                {formatTime(s.start_datetime)}{s.end_datetime ? ` - ${formatTime(s.end_datetime)}` : ''}
                                {breakMin ? <span className="ml-1 opacity-70">休{breakMin}分</span> : null}
                              </div>
                              {s.user_name && (
                                <div className="truncate text-[9px] opacity-70">
                                  {isCompanionEvent && <span className="opacity-70 font-normal">同行: </span>}
                                  {s.user_name}{comps.length > 0 ? `・${comps.join('・')}` : ''}
                                </div>
                              )}
                              <div className="truncate text-xs font-bold">{s.title}</div>
                              {facs.length > 0 && (
                                <div className="flex flex-wrap gap-0.5 mt-0.5">
                                  {facs.map(f => (
                                    <span key={f} className={`text-[10px] px-1 py-0.5 rounded font-medium ${FACILITY_COLOR[f] || 'bg-gray-200 text-gray-600'}`}>{f}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                    {calcTotal(scheds) && <div className="text-right text-[8px] text-gray-400 mt-0.5">{calcTotal(scheds)}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* 施設利用状況 */}
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="text-xs font-semibold text-gray-500 mb-2">施設利用状況</div>
          {FACILITIES.map(facility => (
            <div key={facility} className="mb-2 border border-gray-300 rounded-lg overflow-hidden">
              <div className={`px-3 py-1 text-xs font-semibold border-b border-gray-300 ${FACILITY_COLOR[facility]}`}>
                {facility}
              </div>
              <div className="grid grid-cols-7 divide-x divide-gray-100">
                {weekDays.map((d, i) => {
                  const ds = toDateStr(d)
                  const isToday = ds === toDateStr(today)
                  const fScheds = schedules.filter(s =>
                    toDateStr(new Date(s.start_datetime)) === ds &&
                    (s.facility?.split(',').map(f => f.trim()).includes(facility) ?? false)
                  )
                  return (
                    <div key={i} className={`min-h-14 p-1 text-xs ${isToday ? 'bg-blue-50' : ''}`}>
                      {fScheds.length === 0
                        ? <div className="text-[8px] text-gray-300 text-center py-2">-</div>
                        : fScheds.map(s => (
                          <Link key={s.id} href={`/schedules/${s.id}`}>
                            <div className="text-xs px-1.5 py-1 rounded leading-snug mb-0.5 hover:opacity-80 transition"
                              style={colorStyle(s.color)}>
                              <div className="opacity-80 text-[10px] font-medium">{formatTime(s.start_datetime)}{s.end_datetime ? `-${formatTime(s.end_datetime)}` : ''}</div>
                              <div className="truncate text-[9px] opacity-70">{s.user_name}</div>
                              <div className="truncate text-xs font-bold">{s.title}</div>
                            </div>
                          </Link>
                        ))
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── 日間ビュー ──
  function renderDaily() {
    const ds = toDateStr(viewDate)
    return (
      <div className="overflow-x-auto">
        {/* 時間ヘッダー */}
        <div className="flex min-w-[900px]">
          <div className="w-32 shrink-0 border-b border-gray-300" />
          <div className="flex-1 flex border-b border-gray-200">
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center text-[10px] text-gray-400 border-r border-gray-300 py-1 bg-gray-50 last:border-r-0">
                {h}時
              </div>
            ))}
          </div>
        </div>
        {displayUsers.map(user => {
          const scheds = daySchedules(viewDate, user.id)
          const reported = hasReport(user.id, ds)
          return (
            <div key={user.id} className="flex min-w-[900px] border-t border-gray-300">
              {/* 氏名列 */}
              <div className="w-32 shrink-0 px-2 py-2 flex flex-col justify-between border-r border-gray-300 bg-gray-50">
                <div>
                  <div className="text-sm font-medium text-gray-700 truncate">{user.name}</div>
                  {scheds.length > 0 && (
                    <span className={`text-[9px] px-1 py-0.5 rounded font-medium leading-none ${reported ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                      日報{reported ? '登録済' : '未登録'}
                    </span>
                  )}
                </div>
                {calcTotal(scheds) && <div className="text-[9px] text-gray-400">{calcTotal(scheds)}</div>}
              </div>
              {/* タイムライン */}
              <div className="flex-1 relative" style={{ minHeight: '52px' }}>
                {/* グリッド線 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {HOURS.map(h => (
                    <div key={h} className="flex-1 border-r border-gray-300 last:border-r-0" />
                  ))}
                </div>
                {/* スケジュールブロック */}
                {scheds.map(s => {
                  const startMin = timeToMinutes(s.start_datetime)
                  const endMin = s.end_datetime ? timeToMinutes(s.end_datetime) : startMin + 60
                  const left = minutesToPct(startMin)
                  const width = Math.max(minutesToPct(endMin) - left, 1.5)
                  const facilities = s.facility ? s.facility.split(',').map(f => f.trim()) : []
                  const comps = s.companions ? s.companions.split(',').map(c => c.trim()).filter(c => c) : []
                  const isCompanionEvent = s.user_id !== user.id
                  const breakLabel = s.break_minutes ? ` 休${s.break_minutes}分` : ''
                  return (
                    <Link key={s.id} href={`/schedules/${s.id}`}
                      title={`${formatTime(s.start_datetime)}-${s.end_datetime ? formatTime(s.end_datetime) : ''}${breakLabel} ${s.client_name ? s.client_name + '：' : ''}${s.title}`}
                      className="absolute top-1 bottom-1 rounded text-xs overflow-hidden px-1.5 py-1 leading-snug hover:opacity-80 transition"
                      style={{ left: `${left}%`, width: `${width}%`, ...colorStyle(s.color) }}>
                      <div className="opacity-80 text-[10px] font-medium whitespace-nowrap">
                        {formatTime(s.start_datetime)}{s.end_datetime ? `-${formatTime(s.end_datetime)}` : ''}
                        {s.break_minutes ? <span className="ml-1 opacity-70">休{s.break_minutes}分</span> : null}
                      </div>
                      <div className="truncate text-[9px] opacity-70">
                        {isCompanionEvent && <span className="opacity-70 font-normal">同行: </span>}
                        {s.user_name}{comps.length > 0 ? `・${comps.join('・')}` : ''}
                      </div>
                      <div className="truncate text-xs font-bold">{s.title}</div>
                      {facilities.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {facilities.map(f => (
                            <span key={f} className={`text-[7px] px-0.5 rounded leading-none font-medium ${FACILITY_COLOR[f] || 'bg-gray-200 text-gray-600'}`}>{f}</span>
                          ))}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* 施設利用状況セパレーター */}
        <div className="flex min-w-[900px] border-t-2 border-gray-300">
          <div className="w-32 shrink-0 px-2 py-1 bg-gray-100 border-r border-gray-200 flex items-center">
            <span className="text-[10px] font-semibold text-gray-500">施設利用状況</span>
          </div>
          <div className="flex-1 flex bg-gray-100">
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center text-[9px] text-gray-400 border-r border-gray-200 py-0.5 last:border-r-0">{h}時</div>
            ))}
          </div>
        </div>

        {/* 施設行 */}
        {FACILITIES.map(facility => {
          const fScheds = schedules.filter(s =>
            toDateStr(new Date(s.start_datetime)) === ds &&
            (s.facility?.split(',').map(f => f.trim()).includes(facility) ?? false)
          )
          return (
            <div key={facility} className="flex min-w-[900px] border-t border-gray-300">
              <div className={`w-32 shrink-0 px-2 py-2 flex items-center border-r border-gray-300 ${FACILITY_COLOR[facility]}`}>
                <span className="text-xs font-semibold">{facility}</span>
              </div>
              <div className="flex-1 relative" style={{ minHeight: '52px' }}>
                <div className="absolute inset-0 flex pointer-events-none">
                  {HOURS.map(h => (
                    <div key={h} className="flex-1 border-r border-gray-300 last:border-r-0" />
                  ))}
                </div>
                {fScheds.map(s => {
                  const startMin = timeToMinutes(s.start_datetime)
                  const endMin = s.end_datetime ? timeToMinutes(s.end_datetime) : startMin + 60
                  const left = minutesToPct(startMin)
                  const width = Math.max(minutesToPct(endMin) - left, 1.5)
                  return (
                    <Link key={s.id} href={`/schedules/${s.id}`}
                      title={`${s.user_name} ${formatTime(s.start_datetime)}-${s.end_datetime ? formatTime(s.end_datetime) : ''}`}
                      className="absolute top-1 bottom-1 rounded text-xs overflow-hidden px-1.5 py-1 leading-snug hover:opacity-80 transition"
                      style={{ left: `${left}%`, width: `${width}%`, ...colorStyle(s.color) }}>
                      <div className="opacity-90 text-xs font-bold whitespace-nowrap">{formatTime(s.start_datetime)}{s.end_datetime ? `-${formatTime(s.end_datetime)}` : ''}</div>
                      <div className="truncate text-[9px] opacity-70">{s.user_name}</div>
                      <div className="truncate text-xs font-bold">{s.title}</div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-800">スケジュール</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* チーム選択 */}
          {divisionOptions.length > 0 && (
            <select
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedDivision}
              onChange={e => { setSelectedDivision(e.target.value); setSelectedUserId('all') }}>
              <option value="all">全チーム</option>
              {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {/* ユーザー選択 */}
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}>
            <option value="all">全員</option>
            {usersInDivision.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {/* ビュー切替 */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
            {(['月間', '週間', '日間'] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 font-medium transition ${viewMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {mode}
              </button>
            ))}
          </div>
          <Link href="/schedules/new"
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} /> 新規追加
          </Link>
        </div>
      </div>

      {/* 施設フィルター */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-gray-500 font-medium">施設：</span>
        <button onClick={() => setFacilityFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition ${!facilityFilter ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
          すべて
        </button>
        {FACILITIES.map(f => (
          <button key={f} onClick={() => setFacilityFilter(facilityFilter === f ? null : f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${facilityFilter === f ? `${FACILITY_COLOR[f]} border-current` : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        {/* ナビゲーション */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={20} /></button>
          <span className="font-bold text-lg">{viewTitle()}</span>
          <button onClick={() => navigate(1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={20} /></button>
        </div>

        {viewMode === '月間' && renderMonthly()}
        {viewMode === '週間' && renderWeekly()}
        {viewMode === '日間' && renderDaily()}
      </div>
    </div>
  )
}

export default function SchedulesPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">読み込み中...</div>}>
      <SchedulesContent />
    </Suspense>
  )
}
