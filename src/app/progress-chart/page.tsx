'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'

// 進捗グラフ：事業部ごとに、その月に完了した件数を日付の位置へ1件1マスで積み上げ、
// 「月初0 → 月末に対象件数」の目標線と比べる。
// ・月次：日報の「記帳」（処理期間にその月を含む）と月次進捗表の「月次完成」が両方そろった日に1マス
// ・給与：月次進捗表の「給与計算完了」日に1マス（顧客カルテで「給与計算あり」の顧問先）
// ・顧問先は主担当の所属事業部のグラフに入り、マスの色は主担当者ごと

interface Unit {
  date: string        // 完了日 YYYY-MM-DD
  code: string
  name: string
  staff: string
  kind: '月次' | '給与'
  target: string      // 何月分か（例: 2026年7月分）
}

interface ClientLite {
  code: string; name: string; primary_staff: string | null
  show_in_monthly: boolean | null; contract_end_date: string | null; include_payroll?: boolean | null
}

const PALETTE = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#a21caf']
const norm = (s: string | null | undefined) => (s || '').replace(/[\s　]/g, '')
const pad = (n: number) => String(n).padStart(2, '0')

export default function ProgressChartPage() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)  // JST
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth() + 1)
  const [division, setDivision] = useState('')
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<{ name: string; division: string | null }[]>([])
  const [clients, setClients] = useState<ClientLite[]>([])
  const [units, setUnits] = useState<(Unit & { division: string })[]>([])

  // 初期表示はログイン中の人の事業部
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: me } = await supabase.from('users').select('division').eq('id', user.id).maybeSingle()
      if (me?.division) setDivision(d => d || me.division)
    })()
  }, [])

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const start = `${year}-${pad(month)}-01`
    const end = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`

    const [{ data: usersData }, clientsData, progress, kicho, reports] = await Promise.all([
      supabase.from('users').select('name, division, leave_date'),
      fetchAllRows<ClientLite>(() => supabase.from('clients').select('*')),
      // 当月に完了するのは前年分の処理もありうるため前年・当年の2年分
      fetchAllRows<{ client_code: string; year: number; monthly_completion: Record<string, string | null> | null; monthly_payroll?: Record<string, string | null> | null }>(
        () => supabase.from('monthly_progress').select('*').in('year', [year - 1, year])),
      fetchAllRows<{ report_id: string; client_code: string; subject: string | null; details: string | null }>(
        () => supabase.from('daily_report_details').select('report_id, client_code, subject, details').eq('task_type', '記帳').not('client_code', 'is', null)),
      fetchAllRows<{ id: string; date: string }>(() => supabase.from('daily_reports').select('id, date')),
    ])

    const activeUsers = (usersData || []).filter((u: { leave_date: string | null }) => !u.leave_date)
    setUsers(activeUsers)
    setClients(clientsData)
    const divisionOf: Record<string, string> = {}
    for (const u of usersData || []) if (u.division) divisionOf[norm(u.name)] = u.division
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

    const out: (Unit & { division: string })[] = []
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
    setLoading(false)
  }

  const divisions = useMemo(() => Array.from(new Set(users.map(u => u.division).filter(Boolean))).sort() as string[], [users])
  const divisionOf = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of users) if (u.division) m[norm(u.name)] = u.division
    return m
  }, [users])

  // 目標件数＝事業部の月次対象顧問先数＋給与計算あり顧問先数
  const activeClients = clients.filter(c => c.show_in_monthly && !c.contract_end_date && divisionOf[norm(c.primary_staff)] === division)
  const monthlyTarget = activeClients.length
  const payrollTarget = activeClients.filter(c => c.include_payroll).length
  const target = monthlyTarget + payrollTarget

  const divUnits = units.filter(u => u.division === division).sort((a, b) => a.date.localeCompare(b.date) || a.staff.localeCompare(b.staff) || a.code.localeCompare(b.code))
  const staffNames = Array.from(new Set([
    ...users.filter(u => u.division === division).map(u => u.name),
    ...divUnits.map(u => u.staff),
  ])).sort()
  const colorOf = (staff: string) => PALETTE[Math.max(0, staffNames.indexOf(staff)) % PALETTE.length]

  // ---- グラフ ----
  const days = new Date(year, month, 0).getDate()
  const total = divUnits.length
  const yMax = Math.max(10, Math.ceil((Math.max(target, total) + 5) / 10) * 10)
  const W = 1000, H = 520, ML = 44, MR = 16, MT = 16, MB = 34
  const plotW = W - ML - MR, plotH = H - MT - MB
  const colW = plotW / days
  const unitH = plotH / yMax
  const xOf = (day: number) => ML + day * colW   // day日の右端
  const yOf = (n: number) => MT + plotH - n * unitH

  const byDay: Record<number, (Unit & { division: string })[]> = {}
  for (const u of divUnits) (byDay[Number(u.date.slice(8, 10))] ??= []).push(u)
  let cum = 0
  const bars: { day: number; from: number; items: (Unit & { division: string })[] }[] = []
  for (let d = 1; d <= days; d++) {
    const items = byDay[d]
    if (!items) continue
    bars.push({ day: d, from: cum, items })
    cum += items.length
  }

  const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month
  const today = now.getUTCDate()
  const expectedToday = isCurrentMonth ? Math.round(target * today / days) : null
  const yStep = yMax <= 60 ? 5 : yMax <= 150 ? 10 : 20

  const staffCount: Record<string, number> = {}
  for (const u of divUnits) staffCount[u.staff] = (staffCount[u.staff] || 0) + 1

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">進捗グラフ</h1>
      <p className="text-xs text-gray-500 mb-5">
        日報の「記帳」と月次進捗表の「月次完成」がそろった日、または「給与計算完了」日に1件1マスを積み上げます。斜線は月末に対象件数を終える目標ペースです。
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

      {!division ? (
        <div className="text-sm text-gray-400 py-10">事業部を選択してください</div>
      ) : loading ? (
        <div className="text-sm text-gray-400 py-10">読み込み中...</div>
      ) : (
        <>
          {/* サマリー */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-xs text-gray-500">完了 / 目標</div>
              <div className="text-2xl font-bold text-gray-800">{total}<span className="text-base text-gray-400"> / {target}件</span></div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-xs text-gray-500">月次</div>
              <div className="text-xl font-bold text-gray-800">{divUnits.filter(u => u.kind === '月次').length}<span className="text-sm text-gray-400"> / {monthlyTarget}件</span></div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-xs text-gray-500">給与計算</div>
              <div className="text-xl font-bold text-gray-800">{divUnits.filter(u => u.kind === '給与').length}<span className="text-sm text-gray-400"> / {payrollTarget}件</span></div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="text-xs text-gray-500">{isCurrentMonth ? `今日（${month}/${today}）時点の目標` : '達成率'}</div>
              <div className={`text-xl font-bold ${expectedToday !== null && total < expectedToday ? 'text-orange-600' : 'text-green-600'}`}>
                {expectedToday !== null ? `${expectedToday}件（${total - expectedToday >= 0 ? '+' : ''}${total - expectedToday}）` : target > 0 ? `${Math.round(total / target * 100)}%` : '—'}
              </div>
            </div>
          </div>

          {/* グラフ */}
          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <div className="font-bold text-gray-800 mb-2">{year}年{month}月　{division}</div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${division}の${month}月の進捗グラフ`}>
              {/* 方眼 */}
              {Array.from({ length: days + 1 }, (_, d) => (
                <line key={`vx${d}`} x1={xOf(d)} x2={xOf(d)} y1={MT} y2={MT + plotH} stroke="#e0f2f1" strokeWidth={1} />
              ))}
              {Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep).map(n => (
                <g key={`hy${n}`}>
                  <line x1={ML} x2={ML + plotW} y1={yOf(n)} y2={yOf(n)} stroke="#b2dfdb" strokeWidth={1} />
                  <text x={ML - 6} y={yOf(n) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{n}</text>
                </g>
              ))}
              {/* 日付 */}
              {Array.from({ length: days }, (_, i) => i + 1).map(d => (
                <text key={`dx${d}`} x={xOf(d) - colW / 2} y={MT + plotH + 16} textAnchor="middle" fontSize={10}
                  fill={isCurrentMonth && d === today ? '#dc2626' : '#6b7280'} fontWeight={isCurrentMonth && d === today ? 700 : 400}>{d}</text>
              ))}
              {/* 今日 */}
              {isCurrentMonth && (
                <line x1={xOf(today)} x2={xOf(today)} y1={MT} y2={MT + plotH} stroke="#fca5a5" strokeDasharray="4 3" />
              )}
              {/* 目標線（月初0 → 月末に対象件数） */}
              <line x1={xOf(0)} y1={yOf(0)} x2={xOf(days)} y2={yOf(target)} stroke="#374151" strokeWidth={1.5} />
              {/* 完了のマス（日付の位置に、それまでの累計の上へ積み上げ） */}
              {bars.map(b => b.items.map((u, i) => {
                const x = xOf(b.day) - colW * 0.85
                const y = yOf(b.from + i + 1)
                return (
                  <rect key={`${b.day}-${i}`} x={x} y={y} width={colW * 0.7} height={Math.max(unitH - 0.6, 0.6)}
                    fill={colorOf(u.staff)} fillOpacity={u.kind === '給与' ? 0.55 : 0.85} stroke="#fff" strokeWidth={0.6}>
                    <title>{`${u.date.slice(5).replace('-', '/')} ${u.kind} ${u.code} ${u.name}（${u.target}）担当：${u.staff}`}</title>
                  </rect>
                )
              }))}
              {/* 枠 */}
              <rect x={ML} y={MT} width={plotW} height={plotH} fill="none" stroke="#9ca3af" />
            </svg>

            {/* 凡例 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
              {staffNames.map(s => (
                <span key={s} className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: colorOf(s) }} />
                  {s} {staffCount[s] || 0}件
                </span>
              ))}
              <span className="text-gray-400">（薄い色＝給与計算）</span>
            </div>
          </div>

          {/* 完了一覧 */}
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">完了一覧（{total}件）</div>
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
                      <td className="px-4 py-1.5 text-gray-600">{Number(u.date.slice(5, 7))}/{Number(u.date.slice(8, 10))}</td>
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
