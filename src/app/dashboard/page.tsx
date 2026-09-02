'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Users, ClipboardList, FileText, Calendar, Plus, AlertCircle, Clock, ListChecks } from 'lucide-react'

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  '外出':           { bg: '#e57373', text: '#fff' },
  '来客（顧問先）': { bg: '#64b5f6', text: '#fff' },
  '来客（業者）':   { bg: '#4fc3f7', text: '#fff' },
  '所内行事':       { bg: '#ba68c8', text: '#fff' },
  '所内ミーティング': { bg: '#7986cb', text: '#fff' },
  '休み':           { bg: '#ffb74d', text: '#fff' },
  '白':             { bg: '#f5f5f5', text: '#555' },
  '緑':             { bg: '#66bb6a', text: '#fff' },
  'グレー':         { bg: '#90a4ae', text: '#fff' },
}
function scheduleColor(color: string | null): React.CSSProperties {
  const c = COLOR_MAP[color || ''] ?? { bg: '#7986cb', text: '#fff' }
  return { backgroundColor: c.bg, color: c.text }
}

const ROOMS = ['会議室①', '会議室②', 'アクア'] as const
const ROOM_COLOR: Record<string, string> = {
  '会議室①': 'text-violet-700 bg-violet-50',
  '会議室②': 'text-pink-700 bg-pink-50',
  'アクア':   'text-teal-700 bg-teal-50',
}
const DAY_START = 8   // 8:00
const DAY_END   = 19  // 19:00
const DAY_MINS  = (DAY_END - DAY_START) * 60
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i)

interface Stats {
  corporateCount: number
  individualCount: number
  todaySchedules: number
  unreadReports: number
}

interface SettleItem {
  client_id: string
  client_code: string
  client_name: string
  fiscal_month: number
  primary_staff: string | null
  sub_staff: string | null
  settle_return_prepared: string | null
}

interface MonthlyItem {
  client_id: string
  client_code: string
  client_name: string
  primary_staff: string | null
  sub_staff: string | null
  material_date: string   // 資料預かり日
  elapsed_days: number
}

interface ReturnItem { client_code: string | null; client_name: string; staff_name: string | null; category: '決算業務' | '年末調整' | '確定申告' }

interface TaxSchedItem {
  id: string
  client_name: string
  tax_type: string | null
  amount: string | null
  installment: string | null
  deadline: string | null
  payment_method: string | null
  send_date: string | null
  payment_date: string | null
  confirmation: string | null
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ corporateCount: 0, individualCount: 0, todaySchedules: 0, unreadReports: 0 })
  const [todayScheduleList, setTodayScheduleList] = useState<{ id: string; title: string; start_datetime: string; end_datetime: string | null; user_name: string; facility: string | null; color: string | null }[]>([])
  const [settleItems, setSettleItems] = useState<SettleItem[]>([])
  const [monthlyItems, setMonthlyItems] = useState<MonthlyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [progressLoading, setProgressLoading] = useState(true)
  interface AnnualRecord { client_code: string | null; client_name: string; staff_name: string | null; unprocessed: boolean; docPending: boolean }
  const [annualItems, setAnnualItems] = useState<{ yearEnd: AnnualRecord[]; withholding: AnnualRecord[]; taxReturn: AnnualRecord[] }>({ yearEnd: [], withholding: [], taxReturn: [] })
  const [showYearEnd, setShowYearEnd] = useState(false)
  const [showWithholding, setShowWithholding] = useState(false)
  const [showTaxReturn, setShowTaxReturn] = useState(false)
  const [annualExpand, setAnnualExpand] = useState<{ section: 'yearEnd' | 'withholding' | 'taxReturn' | null; filter: 'unprocessed' | 'docPending'; staff: string | null }>({ section: null, filter: 'unprocessed', staff: null })
  const [settleFilterStaff, setSettleFilterStaff] = useState<string | null>(null)
  const [monthlyFilterStaff, setMonthlyFilterStaff] = useState<string | null>(null)
  const [settleShowTable, setSettleShowTable] = useState(false)
  const [monthlyShowTable, setMonthlyShowTable] = useState(false)

  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [returnModalStaff, setReturnModalStaff] = useState<string | null>(null)

  const [taxSchedules, setTaxSchedules] = useState<TaxSchedItem[]>([])
  const [taxSchedYear, setTaxSchedYear] = useState(new Date().getFullYear())
  const [taxSchedMonth, setTaxSchedMonth] = useState(new Date().getMonth() + 1)
  const [taxSchedLoading, setTaxSchedLoading] = useState(false)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // 決算期限月: 申告期限 = 決算月 + 2 → 決算月 = 当月 - 2
  let settleMonth = currentMonth - 2
  let settleYear = currentYear
  if (settleMonth <= 0) { settleMonth += 12; settleYear -= 1 }

  const currentMonthStr = String(currentMonth)

  useEffect(() => {
    try {
      setShowYearEnd(localStorage.getItem('dash_show_yearend') === 'true')
      setShowWithholding(localStorage.getItem('dash_show_withholding') === 'true')
      setShowTaxReturn(localStorage.getItem('dash_show_taxreturn') === 'true')
    } catch { /* ignore */ }
    loadStats(); loadProgress(); loadTaxSchedules(new Date().getFullYear(), new Date().getMonth() + 1)
  }, [])

  async function loadStats() {
    const supabase = createClient()
    const today = now.toISOString().split('T')[0]

    // ログインユーザーID取得（今日の予定カウントに使用）
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const myUserId = authUser?.id ?? ''

    const [
      { data: activeClients },
      { count: scheduleCount },
      { count: unreadCount },
      { data: reports },
      { data: schedules },
    ] = await Promise.all([
      supabase.from('clients').select('entity_type').is('contract_end_date', null),
      // 自分の今日の予定のみカウント
      supabase.from('schedules').select('*', { count: 'exact', head: true })
        .gte('start_datetime', today + 'T00:00:00')
        .lte('start_datetime', today + 'T23:59:59')
        .eq('user_id', myUserId),
      // 未読日報は全員分
      supabase.from('daily_reports').select('*', { count: 'exact', head: true }).eq('unread_check', '未チェック'),
      Promise.resolve({ data: [] }),  // 最近の日報は削除
      supabase.from('schedules').select('id, title, start_datetime, end_datetime, user_name, facility, color')
        .gte('start_datetime', today + 'T00:00:00')
        .lte('start_datetime', today + 'T23:59:59')
        .in('facility', ['会議室①', '会議室②', 'アクア'])
        .order('start_datetime').limit(50),
    ])
    const corporateCount = (activeClients || []).filter(c => c.entity_type !== '個人').length
    const individualCount = (activeClients || []).filter(c => c.entity_type === '個人').length
    setStats({ corporateCount, individualCount, todaySchedules: scheduleCount || 0, unreadReports: unreadCount || 0 })
    setTodayScheduleList(schedules || [])
    setLoading(false)
  }

  async function loadProgress() {
    setProgressLoading(true)
    const supabase = createClient()

    // ── 年調・源泉・確定申告（全レコード取得）+ 返却書類未返却 ──
    const [{ data: yearEndRaw }, { data: withholdingRaw }, { data: taxReturnRaw },
           { data: retMonthly }, { data: retYearEnd }, { data: retTaxReturn }] = await Promise.all([
      supabase.from('year_end_adj_records')
        .select('client_code, client_name, staff_name, status, material_received_at')
        .eq('year', currentYear),
      supabase.from('withholding_semi_records')
        .select('client_code, client_name, staff_name, status, doc_received_at')
        .eq('year', currentYear),
      supabase.from('tax_return_records')
        .select('client_code, client_name, staff_name, status, doc_received_at')
        .eq('year', currentYear),
      // 決算業務: 申告書作成済み（settle_return_prepared あり）かつ返却未完了
      supabase.from('monthly_progress')
        .select('client_code, client_name, primary_staff, settle_return_docs, settle_return_prepared')
        .eq('year', currentYear)
        .not('settle_return_prepared', 'is', null),
      // 年末調整: returned が false または null
      supabase.from('year_end_adj_records')
        .select('client_code, client_name, staff_name, returned')
        .eq('year', currentYear)
        .or('returned.is.null,returned.eq.false'),
      // 確定申告: doc_returned が false または null かつ未着手以外
      supabase.from('tax_return_records')
        .select('client_code, client_name, staff_name, doc_returned, status')
        .eq('year', currentYear)
        .or('doc_returned.is.null,doc_returned.eq.false')
        .neq('status', '未着手'),
    ])
    setAnnualItems({
      yearEnd: (yearEndRaw || []).map(r => ({
        client_code: r.client_code, client_name: r.client_name, staff_name: r.staff_name,
        unprocessed: r.status === '未完了', docPending: !r.material_received_at,
      })),
      withholding: (withholdingRaw || []).map(r => ({
        client_code: r.client_code, client_name: r.client_name, staff_name: r.staff_name,
        unprocessed: r.status === '未完了', docPending: !r.doc_received_at,
      })),
      taxReturn: (taxReturnRaw || []).map(r => ({
        client_code: r.client_code, client_name: r.client_name, staff_name: r.staff_name,
        unprocessed: r.status !== '完了' && r.status !== '返却完了', docPending: !r.doc_received_at,
      })),
    })

    // 返却書類未返却
    const allReturnItems: ReturnItem[] = [
      ...(retMonthly || [])
        .filter(p => p.settle_return_docs !== '1')
        .map(p => ({ client_code: p.client_code, client_name: p.client_name, staff_name: p.primary_staff, category: '決算業務' as const })),
      ...(retYearEnd || [])
        .map(r => ({ client_code: r.client_code, client_name: r.client_name, staff_name: r.staff_name, category: '年末調整' as const })),
      ...(retTaxReturn || [])
        .map(r => ({ client_code: r.client_code, client_name: r.client_name, staff_name: r.staff_name, category: '確定申告' as const })),
    ]
    setReturnItems(allReturnItems)

    // ── 決算未処理 ──
    // clients テーブルを起点に fiscal_month = settleMonth の顧客を取得
    const { data: settleClients } = await supabase
      .from('clients')
      .select('id, code, name, primary_staff, sub_staff, fiscal_month')
      .eq('fiscal_month', settleMonth)
      .is('contract_end_date', null)

    const settleClientIds = (settleClients || []).map(c => c.id)

    // 対象顧客の monthly_progress（settleYear）を取得
    const { data: settleProgress } = settleClientIds.length > 0
      ? await supabase
          .from('monthly_progress')
          .select('client_id, settle_return_prepared')
          .eq('year', settleYear)
          .in('client_id', settleClientIds)
      : { data: [] }

    const progressById: Record<string, string | null> = {}
    for (const p of (settleProgress || [])) {
      progressById[p.client_id] = p.settle_return_prepared
    }

    // monthly_progress が存在しない、またはsettleフィールドが未入力 → 未処理
    const settleResult: SettleItem[] = (settleClients || [])
      .filter(c => !progressById[c.id])   // keyがない(レコード未作成)か空文字/nullは未処理
      .map(c => ({
        client_id: c.id,
        client_code: c.code,
        client_name: c.name,
        fiscal_month: c.fiscal_month,
        primary_staff: c.primary_staff,
        sub_staff: c.sub_staff,
        settle_return_prepared: progressById[c.id] ?? null,
      }))

    setSettleItems(settleResult)

    // ── 月次未処理 ──
    // 全年・全月をチェックし「資料収集あり・月次未完成・14日以上経過」を列挙
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear

    const { data: progressRaw } = await supabase
      .from('monthly_progress')
      .select('client_id, client_code, client_name, primary_staff, sub_staff, monthly_material, monthly_completion')
      .in('year', Array.from(new Set([currentYear, prevYear])))

    const todayTime = now.getTime()
    const seen = new Set<string>()
    const unfinished: MonthlyItem[] = []

    for (const p of (progressRaw || [])) {
      const matObj: Record<string, string> = p.monthly_material || {}
      const compObj: Record<string, string> = p.monthly_completion || {}
      for (const monthStr of Object.keys(matObj)) {
        const matDate = matObj[monthStr]
        const compDate = compObj[monthStr]
        const key = `${p.client_id}-${monthStr}`
        if (matDate && !compDate && !seen.has(key)) {
          seen.add(key)
          const elapsed = Math.floor((todayTime - new Date(matDate).getTime()) / 86400000)
          if (elapsed >= 14) {
            unfinished.push({ client_id: p.client_id, client_code: p.client_code, client_name: p.client_name, primary_staff: p.primary_staff, sub_staff: p.sub_staff, material_date: matDate, elapsed_days: elapsed })
          }
        }
      }
    }

    unfinished.sort((a, b) => b.elapsed_days - a.elapsed_days)
    setMonthlyItems(unfinished)
    setProgressLoading(false)
  }

  // 担当者別集計
  async function loadTaxSchedules(y: number, m: number) {
    setTaxSchedLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('tax_schedules')
      .select('id, client_name, tax_type, amount, installment, deadline, payment_method, send_date, payment_date, confirmation')
      .eq('year', y)
      .eq('month', m)
      .order('client_name')
    setTaxSchedules(data || [])
    setTaxSchedLoading(false)
  }

  function updateTaxSched(id: string, field: 'confirmation' | 'payment_date' | 'send_date', value: string) {
    setTaxSchedules(prev => prev.map(s => s.id === id ? { ...s, [field]: value || null } : s))
    createClient().from('tax_schedules').update({ [field]: value || null }).eq('id', id)
  }

  function taxSchedNav(delta: number) {
    let m = taxSchedMonth + delta
    let y = taxSchedYear
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setTaxSchedYear(y); setTaxSchedMonth(m)
    loadTaxSchedules(y, m)
  }

  function staffSummary(items: { primary_staff: string | null }[]) {
    const map: Record<string, number> = {}
    for (const item of items) {
      const staff = item.primary_staff || '未割当'
      map[staff] = (map[staff] || 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }

  const statCards = [
    { label: '今日の予定（自分）', value: stats.todaySchedules, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50', href: '/schedules' },
  ]

  // 期日超過：担当者別集計
  const overdueSettle = now.getDate() >= 20 ? settleItems : []
  const overdueMonthly = monthlyItems.filter(i => i.elapsed_days >= 14)
  const staffOverdueMap: Record<string, { settle: number; monthly: number }> = {}
  for (const item of overdueSettle) {
    const s = item.primary_staff || '未割当'
    if (!staffOverdueMap[s]) staffOverdueMap[s] = { settle: 0, monthly: 0 }
    staffOverdueMap[s].settle++
  }
  for (const item of overdueMonthly) {
    const s = item.primary_staff || '未割当'
    if (!staffOverdueMap[s]) staffOverdueMap[s] = { settle: 0, monthly: 0 }
    staffOverdueMap[s].monthly++
  }
  const staffOverdueList = Object.entries(staffOverdueMap).sort((a, b) => (b[1].settle + b[1].monthly) - (a[1].settle + a[1].monthly))

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">ダッシュボード</h1>

      {/* 統計カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/clients" className="bg-blue-50 rounded-xl p-5 hover:opacity-90 transition">
          <div className="text-base font-bold text-blue-700 mb-3">顧客数</div>
          {loading ? (
            <div className="text-3xl font-bold text-gray-800">-</div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-xl font-bold text-gray-800">法人 <span className="text-2xl">{stats.corporateCount}</span>社</div>
              <div className="text-xl font-bold text-gray-800">個人 <span className="text-2xl">{stats.individualCount}</span>人</div>
            </div>
          )}
        </Link>
        {statCards.map(({ value, icon: Icon, color, bg, href }) => (
          <Link key="today" href={href} className={`${bg} rounded-xl p-5 hover:opacity-90 transition`}>
            <div className="text-base font-bold text-purple-700 mb-3">今日の予定</div>
            <div className="text-3xl font-bold text-gray-800">{loading ? '-' : value}</div>
          </Link>
        ))}
        {/* 返却書類カード */}
        <button
          onClick={() => { setReturnModalStaff(null); setReturnModalOpen(true) }}
          className="bg-orange-50 rounded-xl p-5 hover:opacity-90 transition text-left"
        >
          <div className="text-base font-bold text-orange-600 mb-3">未返却書類</div>
          {progressLoading ? (
            <div className="text-3xl font-bold text-gray-800">-</div>
          ) : returnItems.length === 0 ? (
            <div className="text-lg font-bold text-green-600 py-1">✓ 完了</div>
          ) : (
            <div className="text-3xl font-bold text-orange-600">{returnItems.length}</div>
          )}
        </button>
        {/* 期日超過カード */}
        <Link href="/monthly" className="bg-red-50 rounded-xl p-5 hover:opacity-90 transition">
          <div className="text-base font-bold text-red-600 mb-3">期日超過</div>
          {progressLoading ? (
            <div className="text-3xl font-bold text-gray-800">-</div>
          ) : overdueSettle.length === 0 && overdueMonthly.length === 0 ? (
            <div className="text-lg font-bold text-green-600 py-1">✓ 超過なし</div>
          ) : (
            <div className="space-y-1">
              <div className="text-xl font-bold text-red-700">
                決算 <span className="text-2xl">{overdueSettle.length}</span>件
              </div>
              <div className="text-xl font-bold text-red-700">
                月次 <span className="text-2xl">{overdueMonthly.length}</span>件
              </div>
            </div>
          )}
        </Link>
      </div>


      {/* 年調・源泉 進捗パネル */}
      {(() => {
        function AnnualPanel({ sectionKey, label, accentBg, accentBorder, accentText, accentBadge, show, onToggle }:
          { sectionKey: 'yearEnd' | 'withholding' | 'taxReturn'; label: string; accentBg: string; accentBorder: string; accentText: string; accentBadge: string; show: boolean; onToggle: (v: boolean) => void }) {
          const records = annualItems[sectionKey]
          const unprocessedList = records.filter(r => r.unprocessed)
          const docPendingList  = records.filter(r => r.docPending)

          // 担当者別集計
          function byStaff(list: AnnualRecord[]) {
            const m: Record<string, AnnualRecord[]> = {}
            for (const r of list) { const s = r.staff_name || '未割当'; (m[s] = m[s] || []).push(r) }
            return Object.entries(m).sort((a, b) => b[1].length - a[1].length)
          }

          const isExpanded = annualExpand.section === sectionKey
          const expandFilter = annualExpand.filter
          const expandStaff = annualExpand.staff
          const activeList = expandFilter === 'unprocessed' ? unprocessedList : docPendingList
          const displayList = activeList.filter(r => !expandStaff || (r.staff_name || '未割当') === expandStaff)

          function toggle(filter: 'unprocessed' | 'docPending', staff: string | null) {
            const same = isExpanded && expandFilter === filter && expandStaff === staff
            setAnnualExpand(same ? { section: null, filter, staff: null } : { section: sectionKey, filter, staff })
          }

          return (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              {/* ヘッダー */}
              <div className={`${accentBg} ${accentBorder} border-b px-5 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <ListChecks size={16} className={accentText} />
                  <span className={`font-bold text-sm ${accentText}`}>{label}</span>
                  <span className="text-xs text-gray-500">{currentYear}年</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs text-gray-500">ダッシュボードに表示</span>
                  <input type="checkbox" checked={show} onChange={e => {
                    onToggle(e.target.checked)
                    const lsKey = sectionKey === 'yearEnd' ? 'dash_show_yearend' : sectionKey === 'withholding' ? 'dash_show_withholding' : 'dash_show_taxreturn'
                    try { localStorage.setItem(lsKey, String(e.target.checked)) } catch { /* ignore */ }
                  }} className="w-4 h-4 rounded accent-blue-600" />
                </label>
              </div>

              {!show ? (
                <div className="text-center py-4 text-xs text-gray-400">チェックをオンにするとダッシュボードに表示されます</div>
              ) : progressLoading ? (
                <div className="text-center py-6 text-sm text-gray-400">読み込み中...</div>
              ) : records.length === 0 ? (
                <div className="text-center py-6 text-sm text-green-600 font-medium">✓ 登録レコードなし</div>
              ) : (
                <>
                  {/* カウントバナー */}
                  <div className="grid grid-cols-2 divide-x border-b">
                    <button onClick={() => toggle('unprocessed', null)}
                      className={`px-5 py-3 text-left hover:bg-gray-50 transition ${isExpanded && expandFilter === 'unprocessed' && !expandStaff ? 'bg-orange-50' : ''}`}>
                      <div className={`text-xl font-bold ${unprocessedList.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {unprocessedList.length}件
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">未処理</div>
                    </button>
                    <button onClick={() => toggle('docPending', null)}
                      className={`px-5 py-3 text-left hover:bg-gray-50 transition ${isExpanded && expandFilter === 'docPending' && !expandStaff ? 'bg-yellow-50' : ''}`}>
                      <div className={`text-xl font-bold ${docPendingList.length > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {docPendingList.length}件
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">書類未達</div>
                    </button>
                  </div>

                  {/* 担当者別リスト */}
                  <div className="divide-y divide-gray-50">
                    {byStaff(unprocessedList).map(([staff, items]) => {
                      const docCnt = docPendingList.filter(r => (r.staff_name || '未割当') === staff).length
                      const activeRow = isExpanded && expandFilter === 'unprocessed' && expandStaff === staff
                      return (
                        <button key={staff} onClick={() => toggle('unprocessed', staff)}
                          className={`w-full flex items-center justify-between px-5 py-2.5 text-left transition ${activeRow ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                          <span className={`text-sm font-semibold ${activeRow ? 'text-orange-700' : 'text-gray-800'}`}>{staff}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <button onClick={e => { e.stopPropagation(); toggle('unprocessed', staff) }}
                              className="text-orange-600 font-bold hover:underline">
                              未処理 {items.length}件
                            </button>
                            {docCnt > 0 && (
                              <button onClick={e => { e.stopPropagation(); toggle('docPending', staff) }}
                                className="text-yellow-600 font-bold hover:underline">
                                書類未達 {docCnt}件
                              </button>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* 展開リスト */}
                  {isExpanded && (
                    <div className="border-t">
                      <div className={`px-5 py-2 flex items-center justify-between text-xs font-medium ${expandFilter === 'unprocessed' ? 'bg-orange-50 text-orange-700' : 'bg-yellow-50 text-yellow-700'}`}>
                        <span>{expandFilter === 'unprocessed' ? '未処理' : '書類未達'}{expandStaff ? `（${expandStaff}）` : '（全員）'} {displayList.length}件</span>
                        <Link href={sectionKey === 'taxReturn' ? '/tax-return' : '/annual-tasks'} className={`${accentText} hover:underline`}>進捗ページへ →</Link>
                      </div>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-500 border-b">
                          <tr>
                            <th className="px-4 py-1.5 text-left w-20">顧客CD</th>
                            <th className="px-4 py-1.5 text-left">顧客名</th>
                            <th className="px-4 py-1.5 text-left w-20">担当者</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {displayList.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-1.5 font-mono text-gray-400">{r.client_code || '—'}</td>
                              <td className="px-4 py-1.5 font-medium text-gray-800">{r.client_name}</td>
                              <td className="px-4 py-1.5 text-gray-500">{r.staff_name || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        }

        return (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
            <AnnualPanel sectionKey="yearEnd" label="年末調整（1月）" show={showYearEnd} onToggle={setShowYearEnd}
              accentBg="bg-amber-50" accentBorder="border-amber-200" accentText="text-amber-700" accentBadge="bg-amber-100" />
            <AnnualPanel sectionKey="withholding" label="源泉納期の特例（7月）" show={showWithholding} onToggle={setShowWithholding}
              accentBg="bg-teal-50" accentBorder="border-teal-200" accentText="text-teal-700" accentBadge="bg-teal-100" />
            <AnnualPanel sectionKey="taxReturn" label="確定申告" show={showTaxReturn} onToggle={setShowTaxReturn}
              accentBg="bg-blue-50" accentBorder="border-blue-200" accentText="text-blue-700" accentBadge="bg-blue-100" />
          </div>
        )
      })()}

      {/* 返却書類モーダル */}
      {returnModalOpen && (() => {
        const CATS = ['決算業務', '年末調整', '確定申告'] as const
        const CAT_COLOR: Record<string, string> = {
          '決算業務': 'text-purple-700 bg-purple-50',
          '年末調整': 'text-amber-700 bg-amber-50',
          '確定申告': 'text-blue-700 bg-blue-50',
        }
        // 担当者別集計
        const staffMap: Record<string, ReturnItem[]> = {}
        for (const item of returnItems) {
          const s = item.staff_name || '未割当'
          if (!staffMap[s]) staffMap[s] = []
          staffMap[s].push(item)
        }
        const staffList = Object.entries(staffMap).sort((a, b) => b[1].length - a[1].length)

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={e => { if (e.target === e.currentTarget) { setReturnModalOpen(false); setReturnModalStaff(null) } }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
              {/* ヘッダー */}
              <div className="flex items-center justify-between px-5 py-4 bg-orange-50 border-b border-orange-100">
                <div className="flex items-center gap-2">
                  {returnModalStaff && (
                    <button onClick={() => setReturnModalStaff(null)} className="text-orange-500 hover:text-orange-700 mr-1">←</button>
                  )}
                  <FileText size={16} className="text-orange-600" />
                  <span className="font-bold text-orange-700">
                    {returnModalStaff ? returnModalStaff : '返却書類 未返却'}
                  </span>
                  <span className="text-sm text-orange-500 font-medium">
                    {returnModalStaff
                      ? `${(staffMap[returnModalStaff] || []).length}件`
                      : `合計 ${returnItems.length}件`}
                  </span>
                </div>
                <button onClick={() => { setReturnModalOpen(false); setReturnModalStaff(null) }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>

              <div className="overflow-y-auto max-h-[60vh]">
                {returnItems.length === 0 ? (
                  <div className="text-center py-10 text-green-600 font-medium">✓ 未返却なし</div>
                ) : returnModalStaff ? (
                  /* 顧問先一覧 */
                  <div className="divide-y divide-gray-100">
                    {CATS.map(cat => {
                      const items = (staffMap[returnModalStaff] || []).filter(r => r.category === cat)
                      if (items.length === 0) return null
                      return (
                        <div key={cat} className="px-5 py-3">
                          <div className={`inline-block text-xs font-semibold px-2 py-0.5 rounded mb-2 ${CAT_COLOR[cat]}`}>{cat}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((item, i) => (
                              <span key={i} className="text-sm bg-gray-50 border border-gray-200 rounded px-2.5 py-1 text-gray-700">
                                {item.client_code && <span className="text-gray-400 text-xs mr-1">{item.client_code}</span>}
                                {item.client_name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* 担当者一覧 */
                  <div className="divide-y divide-gray-100">
                    {staffList.map(([staff, items]) => (
                      <button
                        key={staff}
                        onClick={() => setReturnModalStaff(staff)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-orange-50 transition text-left"
                      >
                        <span className="font-medium text-gray-800">{staff}</span>
                        <div className="flex items-center gap-2">
                          {CATS.map(cat => {
                            const cnt = items.filter(r => r.category === cat).length
                            if (cnt === 0) return null
                            return (
                              <span key={cat} className={`text-xs px-1.5 py-0.5 rounded font-medium ${CAT_COLOR[cat]}`}>
                                {cat} {cnt}
                              </span>
                            )
                          })}
                          <span className="text-orange-600 font-bold text-sm ml-1">{items.length}件 →</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 会議室・アクア タイムライン（全幅） */}
      <div className="bg-white rounded-xl shadow p-5 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            <h2 className="font-bold text-gray-700">今日の会議室・アクア利用状況</h2>
            <span className="text-xs text-gray-400">{now.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
          </div>
          <Link href="/schedules?view=日間" className="text-xs text-blue-600 hover:underline">すべて表示</Link>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-6">読み込み中...</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: '600px' }}>
              {/* 時間軸ヘッダー */}
              <div className="flex mb-1">
                <div className="w-24 shrink-0" />
                <div className="flex-1 relative h-5">
                  {HOURS.map(h => (
                    <span key={h}
                      style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
                      className="absolute text-[10px] text-gray-400 -translate-x-1/2 select-none">
                      {h}:00
                    </span>
                  ))}
                </div>
              </div>

              {/* 部屋ごとの行 */}
              {ROOMS.map(room => {
                const roomScheds = todayScheduleList.filter(s => s.facility === room)
                return (
                  <div key={room} className="flex items-center mb-2 gap-2">
                    <div className={`w-24 shrink-0 text-xs font-semibold px-2 py-1 rounded text-center ${ROOM_COLOR[room]}`}>
                      {room}
                    </div>
                    <div className="flex-1 relative h-9 bg-gray-50 rounded border border-gray-100">
                      {/* 時間線 */}
                      {HOURS.map(h => (
                        <div key={h}
                          style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
                          className="absolute top-0 bottom-0 border-l border-gray-200 pointer-events-none" />
                      ))}
                      {/* 現在時刻線 */}
                      {(() => {
                        const nowMin = now.getHours() * 60 + now.getMinutes()
                        const pct = ((nowMin - DAY_START * 60) / DAY_MINS) * 100
                        if (pct < 0 || pct > 100) return null
                        return (
                          <div style={{ left: `${pct}%` }}
                            className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10 pointer-events-none" />
                        )
                      })()}
                      {/* スケジュールブロック */}
                      {roomScheds.map(s => {
                        const startDt = new Date(s.start_datetime)
                        const endDt   = s.end_datetime ? new Date(s.end_datetime) : new Date(startDt.getTime() + 60 * 60000)
                        const startMin = startDt.getHours() * 60 + startDt.getMinutes()
                        const endMin   = endDt.getHours()   * 60 + endDt.getMinutes()
                        const left  = Math.max(0, ((startMin - DAY_START * 60) / DAY_MINS) * 100)
                        const right = Math.min(100, ((endMin   - DAY_START * 60) / DAY_MINS) * 100)
                        const width = Math.max(1, right - left)
                        const timeLabel = `${startDt.getHours()}:${String(startDt.getMinutes()).padStart(2,'0')}〜${endDt.getHours()}:${String(endDt.getMinutes()).padStart(2,'0')}`
                        return (
                          <Link key={s.id}
                            href={`/schedules/${s.id}`}
                            style={{ left: `${left}%`, width: `${width}%`, ...scheduleColor(s.color) }}
                            className="absolute top-0.5 bottom-0.5 rounded px-1.5 flex items-center overflow-hidden hover:opacity-85 transition z-20"
                            title={`${timeLabel} ${s.title}（${s.user_name}）`}>
                            <span className="text-[10px] font-medium truncate leading-tight">
                              {s.title}
                              {s.user_name && <span className="opacity-80">・{s.user_name}</span>}
                            </span>
                          </Link>
                        )
                      })}
                      {roomScheds.length === 0 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-300 select-none">
                          空き
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* 現在時刻ラベル */}
              {(() => {
                const nowMin = now.getHours() * 60 + now.getMinutes()
                const pct = ((nowMin - DAY_START * 60) / DAY_MINS) * 100
                if (pct < 0 || pct > 100) return null
                return (
                  <div className="flex">
                    <div className="w-24 shrink-0" />
                    <div className="flex-1 relative h-4">
                      <span style={{ left: `${pct}%` }}
                        className="absolute -translate-x-1/2 text-[10px] text-red-400 font-medium">
                        {now.getHours()}:{String(now.getMinutes()).padStart(2,'0')}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      {/* クイックアクション */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { href: '/clients/new', label: '顧客を追加', icon: Users, color: 'text-blue-600' },
          { href: '/monthly', label: '月次進捗を入力', icon: ClipboardList, color: 'text-indigo-600' },
          { href: '/daily-reports/new', label: '日報を書く', icon: FileText, color: 'text-green-600' },
          { href: '/schedules/new', label: '予定を追加', icon: Calendar, color: 'text-purple-600' },
        ].map(({ href, label, icon: Icon, color }) => (
          <Link key={href} href={href} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition">
            <Plus size={14} className="text-gray-400" />
            <Icon className={color} size={16} />
            <span className="text-sm font-medium text-gray-700">{label}</span>
          </Link>
        ))}
      </div>

      {/* ===== 毎月の進捗 ===== */}
      <div className="mb-2 flex items-center gap-2">
        <AlertCircle size={18} className="text-orange-500" />
        <h2 className="text-lg font-bold text-gray-800">
          毎月の進捗（{currentYear}年{currentMonth}月）
        </h2>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* 決算 未処理 */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className={`border-b px-5 py-3 flex items-center justify-between ${now.getDate() >= 20 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-100'}`}>
            <div>
              <span className={`font-bold text-sm ${now.getDate() >= 20 ? 'text-red-700' : 'text-orange-700'}`}>決算 未処理</span>
              <span className="ml-2 text-xs text-gray-500">{settleMonth}月決算 → {currentMonth}月申告期限 / 申告書未作成</span>
              {now.getDate() >= 20 && (
                <span className="ml-2 text-xs font-bold text-red-600">⚠ 20日を過ぎています</span>
              )}
            </div>
            <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${now.getDate() >= 20 ? 'text-red-700 bg-red-100' : 'text-orange-600 bg-orange-100'}`}>
              {progressLoading ? '...' : `${settleItems.length}件`}
            </span>
          </div>

          {/* 担当者バッジ（クリックで顧客一覧表示） */}
          {progressLoading ? (
            <div className="text-center py-8 text-sm text-gray-400">読み込み中...</div>
          ) : settleItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-green-600 font-medium">✓ 未処理なし</div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {staffSummary(settleItems).map(([staff, total]) => {
                  const overdue = now.getDate() >= 20 ? total : 0
                  const active = settleShowTable && settleFilterStaff === staff
                  return (
                    <button key={staff} onClick={() => { setSettleFilterStaff(staff); setSettleShowTable(true) }}
                      className={`w-full flex items-center justify-between px-5 py-3 text-left transition ${active ? 'bg-orange-50' : 'hover:bg-gray-50'}`}>
                      <span className={`text-base font-semibold ${active ? 'text-orange-700' : 'text-gray-800'}`}>{staff}</span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500">未処理 <span className="font-bold text-gray-800">{total}</span>件</span>
                        {overdue > 0 && (
                          <span className="text-red-500 font-bold">期日超過 {overdue}件</span>
                        )}
                        {active && <span className="text-orange-400 text-xs">▶</span>}
                      </div>
                    </button>
                  )
                })}
                <div className="flex items-center gap-2 px-5 py-2 bg-gray-50">
                  <button
                    onClick={() => { setSettleFilterStaff(null); setSettleShowTable(true) }}
                    className={`text-sm px-3 py-1 rounded font-medium border transition ${
                      settleShowTable && !settleFilterStaff
                        ? 'bg-gray-600 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}>
                    全社表示
                  </button>
                  {settleShowTable && (
                    <button onClick={() => { setSettleShowTable(false); setSettleFilterStaff(null) }}
                      className="text-sm text-gray-400 hover:text-gray-600 ml-auto">
                      ✕ 閉じる
                    </button>
                  )}
                </div>
              </div>

              {settleShowTable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">顧客名</th>
                        <th className="px-3 py-2 text-left w-20">主担当</th>
                        <th className="px-3 py-2 text-center w-20">ステータス</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {settleItems.filter(item => !settleFilterStaff || (item.primary_staff || '未割当') === settleFilterStaff).map(item => {
                        const overDeadline = now.getDate() >= 20
                        return (
                          <tr key={item.client_id} className={overDeadline ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}>
                            <td className="px-4 py-2.5">
                              <Link href={`/monthly?tab=決算業務&highlight=${item.client_id}`}
                                className={`font-medium hover:underline ${overDeadline ? 'text-red-700' : 'text-gray-800 hover:text-blue-600'}`}>
                                {item.client_name}
                              </Link>
                              <span className="ml-2 text-xs text-gray-400 font-mono">{item.client_code}</span>
                            </td>
                            <td className={`px-3 py-2.5 text-xs ${overDeadline ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {item.primary_staff || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {overDeadline ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white inline-block"></span>期限超過
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"></span>未処理
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* 月次 未処理 */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="bg-yellow-50 border-b border-yellow-100 px-5 py-3 flex items-center justify-between">
            <div>
              <span className="font-bold text-yellow-700 text-sm">月次 未処理</span>
              <span className="ml-2 text-xs text-gray-500">資料収集から2週間以上・月次未完成</span>
            </div>
            <span className="text-xs font-bold text-yellow-600 bg-yellow-100 rounded-full px-2 py-0.5">
              {progressLoading ? '...' : `${monthlyItems.length}件`}
            </span>
          </div>

          {/* 担当者バッジ（クリックで顧客一覧表示） */}
          {progressLoading ? (
            <div className="text-center py-8 text-sm text-gray-400">読み込み中...</div>
          ) : monthlyItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-green-600 font-medium">✓ 未処理なし</div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {staffSummary(monthlyItems).map(([staff, total]) => {
                  const overdue = monthlyItems.filter(i => (i.primary_staff || '未割当') === staff && i.elapsed_days >= 14).length
                  const active = monthlyShowTable && monthlyFilterStaff === staff
                  return (
                    <button key={staff} onClick={() => { setMonthlyFilterStaff(staff); setMonthlyShowTable(true) }}
                      className={`w-full flex items-center justify-between px-5 py-3 text-left transition ${active ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                      <span className={`text-base font-semibold ${active ? 'text-yellow-700' : 'text-gray-800'}`}>{staff}</span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-500">未処理 <span className="font-bold text-gray-800">{total}</span>件</span>
                        {overdue > 0 && (
                          <span className="text-red-500 font-bold">期日超過 {overdue}件</span>
                        )}
                        {active && <span className="text-yellow-500 text-xs">▶</span>}
                      </div>
                    </button>
                  )
                })}
                <div className="flex items-center gap-2 px-5 py-2 bg-gray-50">
                  <button
                    onClick={() => { setMonthlyFilterStaff(null); setMonthlyShowTable(true) }}
                    className={`text-sm px-3 py-1 rounded font-medium border transition ${
                      monthlyShowTable && !monthlyFilterStaff
                        ? 'bg-gray-600 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}>
                    全社表示
                  </button>
                  {monthlyShowTable && (
                    <button onClick={() => { setMonthlyShowTable(false); setMonthlyFilterStaff(null) }}
                      className="text-sm text-gray-400 hover:text-gray-600 ml-auto">
                      ✕ 閉じる
                    </button>
                  )}
                </div>
              </div>

              {monthlyShowTable && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left">顧客名</th>
                        <th className="px-3 py-2 text-left w-20">主担当</th>
                        <th className="px-3 py-2 text-center w-20">資料預かり</th>
                        <th className="px-3 py-2 text-center w-16">経過</th>
                        <th className="px-3 py-2 text-center w-20">ステータス</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monthlyItems.filter(item => !monthlyFilterStaff || (item.primary_staff || '未割当') === monthlyFilterStaff).map(item => {
                        const d = new Date(item.material_date)
                        const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`
                        return (
                          <tr key={`${item.client_id}-${item.material_date}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <Link href={`/monthly?tab=月次進捗&highlight=${item.client_id}`} className="font-medium text-gray-800 hover:text-blue-600">
                                {item.client_name}
                              </Link>
                              <span className="ml-2 text-xs text-gray-400 font-mono">{item.client_code}</span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-600 text-xs">{item.primary_staff || '—'}</td>
                            <td className="px-3 py-2.5 text-center text-gray-600 text-xs">{dateLabel}</td>
                            <td className="px-3 py-2.5 text-center">
                              {item.elapsed_days >= 14 ? (
                                <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                  {item.elapsed_days}日
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500">{item.elapsed_days}日</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {item.elapsed_days >= 14 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>要対応
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block"></span>未完成
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

      {/* ── 予定納税一覧 ── */}
      <div className="bg-white rounded-xl shadow overflow-hidden mt-8">
        <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-indigo-700 text-sm">予定納税一覧</span>
          <div className="flex items-center gap-2">
            <button onClick={() => taxSchedNav(-1)} className="px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">◀</button>
            <span className="text-sm font-bold text-gray-700 min-w-[72px] text-center">{taxSchedYear}年{taxSchedMonth}月</span>
            <button onClick={() => taxSchedNav(1)} className="px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs">▶</button>
          </div>
        </div>

        {taxSchedLoading ? (
          <div className="text-center py-8 text-sm text-gray-400">読み込み中...</div>
        ) : taxSchedules.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">この月のデータがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">顧客名</th>
                  <th className="text-left px-4 py-2 font-medium">税目</th>
                  <th className="text-right px-4 py-2 font-medium">金額</th>
                  <th className="text-center px-4 py-2 font-medium">期限</th>
                  <th className="text-center px-4 py-2 font-medium">支払方法</th>
                  <th className="text-center px-4 py-2 font-medium">送付日</th>
                  <th className="text-center px-4 py-2 font-medium">支払日</th>
                  <th className="text-center px-4 py-2 font-medium w-28">確認</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {taxSchedules.map(s => (
                  <tr key={s.id} className={`hover:bg-gray-50 ${s.confirmation === '済' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-800">{s.client_name}</td>
                    <td className="px-4 py-2 text-gray-600">{s.tax_type || ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-800">{s.amount || ''}</td>
                    <td className="px-4 py-2 text-center text-gray-600 text-xs">{s.deadline || ''}</td>
                    <td className="px-4 py-2 text-center text-gray-600 text-xs">{s.payment_method || ''}</td>
                    <td className="px-4 py-2 text-center text-gray-600 text-xs">
                      <input
                        type="date"
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs w-[108px]"
                        value={s.send_date || ''}
                        onChange={e => updateTaxSched(s.id, 'send_date', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600 text-xs">
                      <input
                        type="date"
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs w-[108px]"
                        value={s.payment_date || ''}
                        onChange={e => updateTaxSched(s.id, 'payment_date', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <select
                        className={`border rounded px-2 py-0.5 text-xs w-full ${s.confirmation === '済' ? 'border-green-300 bg-green-50 text-green-700 font-bold' : s.confirmation === '要確認' ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600'}`}
                        value={s.confirmation || ''}
                        onChange={e => updateTaxSched(s.id, 'confirmation', e.target.value)}
                      >
                        <option value="">未</option>
                        <option value="済">済</option>
                        <option value="要確認">要確認</option>
                        <option value="口座振替">口座振替</option>
                        <option value="不要">不要</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </div>
    </div>
  )
}
