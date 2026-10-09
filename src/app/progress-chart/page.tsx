'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { staffKey } from '@/lib/staffName'

// 進捗グラフ：事業部ごとに、その月に完了した件数を日付の位置へ1件1マスで積み上げ、
// 「月初0 → 月末に目標マス数」の目標線と比べる。
// ・月次：日報の「記帳」（処理期間にその月を含む）と月次進捗表の「月次完成」が両方そろった日に1マス
// ・給与：月次進捗表の「給与計算完了」日に1マス（顧客カルテで「給与計算あり」の顧問先）
// ・顧問先は主担当の所属事業部のグラフに入り、マスの色は主担当者ごと
// ・目標マス数＝ユーザー管理で各人に設定した「毎月の目標マス数」の事業部内合計
// ・右側にその月が申告期限の決算先（2か月前決算）と申告書作成日を表示
// ・順位：決算の申告書作成が全件20日までに終わり、月末までに目標マス数に届いた事業部のみ、早く届いた順
// ・管理部はグラフ・順位の対象外

interface Unit {
  date: string        // 完了日 YYYY-MM-DD
  code: string
  name: string
  staff: string
  kind: '月次' | '給与'
  target: string      // 何月分か（例: 2026年7月分）
  division: string
}

interface ClientLite {
  code: string; name: string; primary_staff: string | null; fiscal_month: number | null
  show_in_monthly: boolean | null; contract_end_date: string | null; include_payroll?: boolean | null
}

interface UserLite { name: string; division: string | null; leave_date: string | null; monthly_target_squares?: number | null }

interface Settlement { code: string; name: string; staff: string; fiscal: string; prepared: string | null; division: string }

interface DivisionResult {
  division: string
  target: number
  targetFromUsers: boolean   // ユーザー管理の目標マス数から計算したか（未設定なら顧問先数で代用）
  total: number
  reachedDay: number | null  // 累計が目標マス数に届いた日
  settleTotal: number
  settleDoneBy20: number
  settleOk: boolean
  achieved: boolean
}

const EXCLUDED_DIVISIONS = ['管理部']
const PALETTE = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#a21caf']
const norm = staffKey  // 空白除去＋旧字体（關→関など）をそろえて担当者名を照合
const pad = (n: number) => String(n).padStart(2, '0')

export default function ProgressChartPage() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)  // JST
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth() + 1)
  const [division, setDivision] = useState('')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserLite[]>([])
  const [clients, setClients] = useState<ClientLite[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])

  // 初期表示はログイン中の人の事業部（管理部の人は最初の事業部）
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('users').select('division').eq('id', user.id).maybeSingle()
      if (me?.division && !EXCLUDED_DIVISIONS.includes(me.division)) setDivision(d => d || me.division)
    })()
  }, [])

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const start = `${year}-${pad(month)}-01`
    const end = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`

    const [{ data: usersData }, clientsData, progress, kicho, reports] = await Promise.all([
      supabase.from('users').select('*'),
      fetchAllRows<ClientLite>(() => supabase.from('clients').select('*')),
      // 当月に完了するのは前年分の処理もありうるため前年・当年の2年分（決算の年度もこの範囲に入る）
      fetchAllRows<{
        client_code: string; year: number
        monthly_completion: Record<string, string | null> | null
        monthly_payroll?: Record<string, string | null> | null
        settle_return_prepared: string | null
      }>(() => supabase.from('monthly_progress').select('*').in('year', [year - 1, year])),
      fetchAllRows<{ report_id: string; client_code: string; subject: string | null; details: string | null }>(
        () => supabase.from('daily_report_details').select('report_id, client_code, subject, details').eq('task_type', '記帳').not('client_code', 'is', null)),
      fetchAllRows<{ id: string; date: string }>(() => supabase.from('daily_reports').select('id, date')),
    ])

    const allUsers = (usersData || []) as UserLite[]
    setUsers(allUsers.filter(u => !u.leave_date))
    setClients(clientsData)
    const divisionOf: Record<string, string> = {}
    for (const u of allUsers) if (u.division) divisionOf[norm(u.name)] = u.division
    const clientByCode: Record<string, ClientLite> = {}
    for (const c of clientsData) clientByCode[c.code] = c

    // 顧問先・処理対象月ごとに、日報で「記帳」を最初に計上した日
    const reportDate: Record<string, string> = {}
    for (const r of reports) reportDate[r.id] = r.date
    const kichoDate: Record<string, Record<string, string>> = {}
    for (const d of kicho) {
      const rdate = reportDate[d.report_id]
      if (!rdate) continue
      for (const key of monthsInRange(d.subject, d.details, rdate)) {
        const byKey = kichoDate[d.client_code] ??= {}
        if (!byKey[key] || rdate < byKey[key]) byKey[key] = rdate
      }
    }

    const out: Unit[] = []
    const inMonth = (d: string) => d >= start && d <= end
    for (const p of progress) {
      const c = clientByCode[p.client_code]
      if (!c) continue
      const staff = c.primary_staff || '未割当'
      const div = divisionOf[norm(c.primary_staff)] || '未所属'
      for (let m = 1; m <= 12; m++) {
        const key = `${p.year}-${m}`
        const target = `${p.year}年${m}月分`
        const comp = p.monthly_completion?.[String(m)]
        const kd = kichoDate[p.client_code]?.[key]
        if (comp && kd) {
          const done = comp > kd ? comp : kd  // 記帳と月次完成の両方がそろった日
          if (inMonth(done)) out.push({ date: done, code: c.code, name: c.name, staff, kind: '月次', target, division: div })
        }
        const pay = p.monthly_payroll?.[String(m)]
        if (pay && c.include_payroll && inMonth(pay)) {
          out.push({ date: pay, code: c.code, name: c.name, staff, kind: '給与', target, division: div })
        }
      }
    }
    setUnits(out)

    // 決算：その月が申告期限の顧問先（決算月＝2か月前。決算月0＝個人は対象外）と申告書作成日
    const fm = ((month - 3 + 12) % 12) + 1
    const fiscalYear = fm > month ? year - 1 : year
    const progByKey: Record<string, { settle_return_prepared: string | null }> = {}
    for (const p of progress) progByKey[`${p.client_code}|${p.year}`] = p
    const settles: Settlement[] = clientsData
      .filter(c => c.fiscal_month === fm && !c.contract_end_date)
      .map(c => ({
        code: c.code, name: c.name, staff: c.primary_staff || '未割当',
        fiscal: `${fiscalYear}年${fm}月決算`,
        prepared: toIsoDate(progByKey[`${c.code}|${fiscalYear}`]?.settle_return_prepared, year, month),
        division: divisionOf[norm(c.primary_staff)] || '未所属',
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
    setSettlements(settles)
    setLoading(false)
  }

  const days = new Date(year, month, 0).getDate()
  const divisions = useMemo(
    () => Array.from(new Set(users.map(u => u.division).filter((d): d is string => !!d && !EXCLUDED_DIVISIONS.includes(d)))).sort(),
    [users])

  // 事業部ごとの集計（順位用）
  const results: DivisionResult[] = useMemo(() => divisions.map(div => {
    const members = users.filter(u => u.division === div)
    const userTarget = members.reduce((s, u) => s + (u.monthly_target_squares || 0), 0)
    // 目標マス数が未設定の間は、月次対象顧問先数＋給与計算あり顧問先数で代用
    const divClients = clients.filter(c => c.show_in_monthly && !c.contract_end_date && members.some(u => norm(u.name) === norm(c.primary_staff)))
    const fallback = divClients.length + divClients.filter(c => c.include_payroll).length
    const target = userTarget > 0 ? userTarget : fallback
    const divUnits = units.filter(u => u.division === div)
    let cum = 0, reachedDay: number | null = null
    for (let d = 1; d <= days && target > 0; d++) {
      cum += divUnits.filter(u => Number(u.date.slice(8, 10)) === d).length
      if (reachedDay === null && cum >= target) reachedDay = d
    }
    const divSettles = settlements.filter(s => s.division === div)
    const limit20 = `${year}-${pad(month)}-20`
    const settleDoneBy20 = divSettles.filter(s => s.prepared && s.prepared <= limit20).length
    const settleOk = settleDoneBy20 === divSettles.length
    return {
      division: div, target, targetFromUsers: userTarget > 0, total: divUnits.length, reachedDay,
      settleTotal: divSettles.length, settleDoneBy20, settleOk, achieved: settleOk && reachedDay !== null,
    }
  }), [divisions, users, clients, units, settlements, days, year, month])

  const ranked = results.filter(r => r.achieved).sort((a, b) => a.reachedDay! - b.reachedDay! || b.total - a.total)
  const notAchieved = results.filter(r => !r.achieved)

  const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month
  const today = now.getUTCDate()

  // ---- 選択中の事業部 ----
  const res = results.find(r => r.division === division)
  const target = res?.target || 0
  const divUnits = units.filter(u => u.division === division).sort((a, b) => a.date.localeCompare(b.date) || a.staff.localeCompare(b.staff) || a.code.localeCompare(b.code))
  const divSettles = settlements.filter(s => s.division === division)
  const total = divUnits.length

  // 凡例の担当者（ユーザー登録名を優先。「關口」と「関口」のような字の違いは同じ人として1つにまとめる）
  const staffByKey = new Map<string, string>()
  for (const u of users.filter(u => u.division === division)) staffByKey.set(norm(u.name), u.name)
  for (const u of divUnits) if (!staffByKey.has(norm(u.staff))) staffByKey.set(norm(u.staff), u.staff)
  const staffKeys = Array.from(staffByKey.keys()).sort()
  const colorOf = (staff: string) => PALETTE[Math.max(0, staffKeys.indexOf(norm(staff))) % PALETTE.length]
  const staffCount: Record<string, number> = {}
  for (const u of divUnits) staffCount[norm(u.staff)] = (staffCount[norm(u.staff)] || 0) + 1
  const memberTargets = users.filter(u => u.division === division)

  // ---- グラフ ----
  const yMax = Math.max(10, Math.ceil((Math.max(target, total) + 5) / 10) * 10)
  const W = 1000, H = 520, ML = 44, MR = 16, MT = 16, MB = 34
  const plotW = W - ML - MR, plotH = H - MT - MB
  const colW = plotW / days
  const unitH = plotH / yMax
  const xOf = (day: number) => ML + day * colW   // day日の右端
  const yOf = (n: number) => MT + plotH - n * unitH
  const byDay: Record<number, Unit[]> = {}
  for (const u of divUnits) (byDay[Number(u.date.slice(8, 10))] ??= []).push(u)
  let cum = 0
  const bars: { day: number; from: number; items: Unit[] }[] = []
  for (let d = 1; d <= days; d++) {
    const items = byDay[d]
    if (!items) continue
    bars.push({ day: d, from: cum, items })
    cum += items.length
  }
  const expectedToday = isCurrentMonth ? Math.round(target * today / days) : null
  const yStep = yMax <= 60 ? 5 : yMax <= 150 ? 10 : 20
  const fmtMD = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">進捗グラフ</h1>
      <p className="text-xs text-gray-500 mb-5">
        日報の「記帳」と月次進捗表の「月次完成」がそろった日、または「給与計算完了」日に1件1マスを積み上げます。斜線は月末に目標マス数（ユーザー管理で設定した各人の目標の合計）に届くペースです。
      </p>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        <select value={division} onChange={e => setDivision(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">事業部を選択</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-10">読み込み中...</div>
      ) : (
        <>
          {/* 順位 */}
          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div className="font-bold text-gray-800">{month}月の順位{isCurrentMonth && <span className="ml-2 text-xs font-normal text-orange-600">暫定（月末に確定）</span>}</div>
              <div className="text-xs text-gray-500">決算の申告書作成が全件20日までに終わり、月末までに目標マス数に届いた事業部を、早く届いた順に表示</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {ranked.map((r, i) => (
                <button key={r.division} onClick={() => setDivision(r.division)}
                  className={`text-left rounded-lg border p-3 transition ${division === r.division ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-500' : 'text-orange-700'}`}>{i + 1}位</span>
                    <span className="font-semibold text-gray-800">{r.division}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{month}/{r.reachedDay}に目標{r.target}マス達成（月の合計 {r.total}マス）</div>
                  <div className="text-xs text-gray-500">決算 {r.settleTotal}件すべて20日までに作成</div>
                </button>
              ))}
              {notAchieved.map(r => (
                <button key={r.division} onClick={() => setDivision(r.division)}
                  className={`text-left rounded-lg border border-dashed p-3 transition ${division === r.division ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-400">{isCurrentMonth ? '未達' : '圏外'}</span>
                    <span className="font-semibold text-gray-700">{r.division}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {r.reachedDay !== null ? `目標${r.target}マス達成済み（${month}/${r.reachedDay}）` : `目標まであと${Math.max(0, r.target - r.total)}マス（${r.total}/${r.target}）`}
                  </div>
                  <div className={`text-xs ${r.settleOk ? 'text-gray-500' : 'text-orange-600'}`}>
                    決算 20日までに作成 {r.settleDoneBy20}/{r.settleTotal}件
                  </div>
                </button>
              ))}
            </div>
          </div>

          {!division ? (
            <div className="text-sm text-gray-400 py-6">事業部を選択するとグラフが表示されます</div>
          ) : (
            <>
              {/* サマリー */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-xl shadow p-4">
                  <div className="text-xs text-gray-500">完了 / 目標マス</div>
                  <div className="text-2xl font-bold text-gray-800">{total}<span className="text-base text-gray-400"> / {target}</span></div>
                  {!res?.targetFromUsers && <div className="text-[11px] text-orange-600 mt-0.5">目標マス数が未設定のため顧問先数で代用</div>}
                </div>
                <div className="bg-white rounded-xl shadow p-4">
                  <div className="text-xs text-gray-500">月次 / 給与計算</div>
                  <div className="text-xl font-bold text-gray-800">{divUnits.filter(u => u.kind === '月次').length}<span className="text-sm text-gray-400"> / </span>{divUnits.filter(u => u.kind === '給与').length}</div>
                </div>
                <div className="bg-white rounded-xl shadow p-4">
                  <div className="text-xs text-gray-500">決算 申告書作成（20日まで）</div>
                  <div className={`text-xl font-bold ${res?.settleOk ? 'text-green-600' : 'text-orange-600'}`}>{res?.settleDoneBy20 ?? 0}<span className="text-sm text-gray-400"> / {divSettles.length}件</span></div>
                </div>
                <div className="bg-white rounded-xl shadow p-4">
                  <div className="text-xs text-gray-500">{isCurrentMonth ? `今日（${month}/${today}）時点の目標` : '目標に届いた日'}</div>
                  <div className={`text-xl font-bold ${expectedToday !== null ? (total < expectedToday ? 'text-orange-600' : 'text-green-600') : res?.reachedDay ? 'text-green-600' : 'text-orange-600'}`}>
                    {expectedToday !== null
                      ? `${expectedToday}マス（${total - expectedToday >= 0 ? '+' : ''}${total - expectedToday}）`
                      : res?.reachedDay ? `${month}/${res.reachedDay}` : '未達'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 mb-4">
                {/* グラフ */}
                <div className="bg-white rounded-xl shadow p-4 xl:col-span-3">
                  <div className="font-bold text-gray-800 mb-2">{year}年{month}月　{division}</div>
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${division}の${month}月の進捗グラフ`}>
                    {Array.from({ length: days + 1 }, (_, d) => (
                      <line key={`vx${d}`} x1={xOf(d)} x2={xOf(d)} y1={MT} y2={MT + plotH} stroke="#e0f2f1" strokeWidth={1} />
                    ))}
                    {Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep).map(n => (
                      <g key={`hy${n}`}>
                        <line x1={ML} x2={ML + plotW} y1={yOf(n)} y2={yOf(n)} stroke="#b2dfdb" strokeWidth={1} />
                        <text x={ML - 6} y={yOf(n) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{n}</text>
                      </g>
                    ))}
                    {Array.from({ length: days }, (_, i) => i + 1).map(d => (
                      <text key={`dx${d}`} x={xOf(d) - colW / 2} y={MT + plotH + 16} textAnchor="middle" fontSize={10}
                        fill={isCurrentMonth && d === today ? '#dc2626' : d === 20 ? '#7c3aed' : '#6b7280'} fontWeight={(isCurrentMonth && d === today) || d === 20 ? 700 : 400}>{d}</text>
                    ))}
                    {/* 決算の締め（20日） */}
                    <line x1={xOf(20)} x2={xOf(20)} y1={MT} y2={MT + plotH} stroke="#c4b5fd" strokeDasharray="2 3" />
                    {isCurrentMonth && (
                      <line x1={xOf(today)} x2={xOf(today)} y1={MT} y2={MT + plotH} stroke="#fca5a5" strokeDasharray="4 3" />
                    )}
                    {/* 目標線（月初0 → 月末に目標マス数） */}
                    <line x1={xOf(0)} y1={yOf(0)} x2={xOf(days)} y2={yOf(target)} stroke="#374151" strokeWidth={1.5} />
                    {/* 完了のマス（日付の位置に、それまでの累計の上へ積み上げ） */}
                    {bars.map(b => b.items.map((u, i) => (
                      <rect key={`${b.day}-${i}`} x={xOf(b.day) - colW * 0.85} y={yOf(b.from + i + 1)} width={colW * 0.7} height={Math.max(unitH - 0.6, 0.6)}
                        fill={colorOf(u.staff)} fillOpacity={u.kind === '給与' ? 0.55 : 0.85} stroke="#fff" strokeWidth={0.6}>
                        <title>{`${fmtMD(u.date)} ${u.kind} ${u.code} ${u.name}（${u.target}）担当：${u.staff}`}</title>
                      </rect>
                    )))}
                    <rect x={ML} y={MT} width={plotW} height={plotH} fill="none" stroke="#9ca3af" />
                  </svg>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                    {staffKeys.map(k => (
                      <span key={k} className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: colorOf(k) }} />
                        {staffByKey.get(k)} {staffCount[k] || 0}マス
                      </span>
                    ))}
                    <span className="text-gray-400">（薄い色＝給与計算／紫の点線＝20日）</span>
                  </div>
                  {res?.targetFromUsers && (
                    <div className="text-[11px] text-gray-400 mt-1">
                      目標マス：{memberTargets.map(u => `${u.name} ${u.monthly_target_squares || 0}`).join('、')}
                    </div>
                  )}
                </div>

                {/* 決算（申告書作成日） */}
                <div className="bg-white rounded-xl shadow p-4">
                  <div className="font-bold text-gray-800 mb-1">決算　申告書作成日</div>
                  <div className="text-xs text-gray-500 mb-3">{divSettles[0]?.fiscal || `${((month - 3 + 12) % 12) + 1}月決算`}（{month}月申告期限）</div>
                  {divSettles.length === 0 ? (
                    <div className="text-sm text-gray-400">対象の決算はありません</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {divSettles.map(s => {
                        const late = !!s.prepared && s.prepared > `${year}-${pad(month)}-20`
                        return (
                          <li key={s.code} className="flex items-baseline gap-2 text-sm">
                            <span className={`w-12 shrink-0 text-right text-xs ${s.prepared ? (late ? 'text-orange-600' : 'text-red-600') : 'text-gray-300'}`}>
                              {s.prepared ? fmtMD(s.prepared) : '未'}
                            </span>
                            <span className="flex-1" title={s.code}>
                              <span className={s.prepared ? 'line-through decoration-red-500 text-gray-500' : 'text-gray-800'}>{s.name}</span>
                              <span className="text-xs text-gray-500">（{s.staff}）</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* 完了一覧 */}
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">完了一覧（{total}マス）</div>
                {total === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-400">この月の完了はまだありません</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 border-b">
                      <tr>
                        <th className="px-4 py-1.5 text-left w-20">完了日</th>
                        <th className="px-4 py-1.5 text-left w-16">種類</th>
                        <th className="px-4 py-1.5 text-left w-20">顧客CD</th>
                        <th className="px-4 py-1.5 text-left">顧客名</th>
                        <th className="px-4 py-1.5 text-left w-28">対象</th>
                        <th className="px-4 py-1.5 text-left w-28">主担当</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {divUnits.map((u, i) => (
                        <tr key={i}>
                          <td className="px-4 py-1.5 text-gray-600">{fmtMD(u.date)}</td>
                          <td className="px-4 py-1.5">{u.kind}</td>
                          <td className="px-4 py-1.5 font-mono text-gray-400">{u.code}</td>
                          <td className="px-4 py-1.5 text-gray-800">{u.name}</td>
                          <td className="px-4 py-1.5 text-gray-600">{u.target}</td>
                          <td className="px-4 py-1.5">
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(u.staff) }} />{u.staff}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// 処理期間（subject〜details、'YYYY-MM'）が含む月キー 'YYYY-M'。処理期間なしは日報の日付の月
function monthsInRange(subject: string | null, details: string | null, reportDate: string): string[] {
  const fallback = `${Number(reportDate.slice(0, 4))}-${Number(reportDate.slice(5, 7))}`
  if (!subject) return [fallback]
  const [sy, sm] = subject.split('-').map(Number)
  const [ey, em] = (details || subject).split('-').map(Number)
  if ([sy, sm, ey, em].some(isNaN)) return [fallback]
  const keys: string[] = []
  let y = sy, m = sm, guard = 0
  while ((y < ey || (y === ey && m <= em)) && guard < 600) {
    keys.push(`${y}-${m}`)
    m++; if (m > 12) { m = 1; y++ }
    guard++
  }
  return keys
}

// 申告書作成日を 'YYYY-MM-DD' にそろえる。古い 'M/D' 形式は表示中の年月を基準に年を補う
function toIsoDate(s: string | null | undefined, year: number, month: number): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (md) {
    const m = Number(md[1]), d = Number(md[2])
    const y = m > month ? year - 1 : year
    return `${y}-${pad(m)}-${pad(d)}`
  }
  return null
}
