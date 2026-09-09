'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// 業務区分ごとの配分率と分割方法
const TASK_ALLOC: Record<string, { rate: number; splitBy: 'time' | 'person' }> = {
  '記帳':  { rate: 0.35, splitBy: 'time' },
  '決算':  { rate: 0.35, splitBy: 'time' },
  '訪問':  { rate: 0.35, splitBy: 'person' },
  '来所':  { rate: 0.35, splitBy: 'person' },
  'チェック': { rate: 0.3, splitBy: 'person' },
}

function toMinutes(s: string | null | undefined): number {
  if (!s) return 0
  const str = String(s)
  if (str.includes(':')) {
    // "H:MM" 形式
    const [h, m] = str.split(':').map(Number)
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
  }
  // "H.MM" 小数形式（0.3=30分, 0.15=15分, 1.3=1時間30分）
  const val = parseFloat(str)
  if (isNaN(val)) return 0
  const hours = Math.floor(val)
  const mins = Math.round((val - hours) * 100)
  return hours * 60 + mins
}

function fmtMinutes(m: number): string {
  if (m === 0) return '—'
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

function fmtPeriod(subject: string | null, details: string | null): string {
  if (!subject) return ''
  const [sy, sm] = subject.split('-').map(Number)
  if (isNaN(sy) || isNaN(sm)) return ''
  if (!details || details === subject) return `${sy}年${sm}月分`
  const [ey, em] = details.split('-').map(Number)
  if (isNaN(ey) || isNaN(em)) return `${sy}年${sm}月分`
  if (sy === ey) return `${sy}年${sm}〜${em}月分`
  return `${sy}年${sm}月〜${ey}年${em}月分`
}

function fmtFee(n: number): string {
  return Math.round(n).toLocaleString('ja-JP') + '円'
}

function fmtRate(fee: number, minutes: number): string {
  if (minutes === 0 || fee === 0) return '—'
  const hourly = (fee / (minutes / 60))
  return Math.round(hourly).toLocaleString('ja-JP') + '円/h'
}

interface WorkEntry {
  user_name: string
  task_type: string | null
  work_minutes: number
  client_code: string
  client_name: string
  date: string
  report_content: string | null
  report_id: string
  subject: string | null
  details: string | null
}

interface ClientRow {
  client_code: string
  client_name: string
  monthly_fee: number
  total_minutes: number
  task_minutes: Record<string, number>  // task_type → minutes
  staff_alloc: Record<string, number>   // user_name → allocated fee
  staff_minutes: Record<string, number> // user_name → total minutes
  entries: WorkEntry[]                  // 明細用
}

interface StaffEntry {
  date: string
  task_type: string | null
  client_name: string | null
  work_minutes: number
  report_content: string | null
}

interface StaffRow {
  user_name: string
  total_alloc: number
  total_minutes: number
  entries: StaffEntry[]
}

export default function ReportsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [clientRows, setClientRows] = useState<ClientRow[]>([])
  const [staffRows, setStaffRows] = useState<StaffRow[]>([])
  const [viewMode, setViewMode] = useState<'staff' | 'client'>('staff')
  const [detailRow, setDetailRow] = useState<ClientRow | null>(null)
  const [detailStaffRow, setDetailStaffRow] = useState<StaffRow | null>(null)
  const [feeBreakStaff, setFeeBreakStaff] = useState<StaffRow | null>(null)
  const [filterDivision, setFilterDivision] = useState('')
  const [allUsers, setAllUsers] = useState<{ name: string; division: string | null }[]>([])

  useEffect(() => { load() }, [year, month])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const monthStr = String(month)

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

    const { data: usersData } = await supabase.from('users').select('name, division').order('name')
    setAllUsers(usersData || [])

    // 顧客カルテの業務ログと同じアプローチ:
    // client_codeがあり且つwork_timeが入力済みの明細を先に取得 → 日報で日付・担当者を確認
    const { data: details } = await supabase
      .from('daily_report_details')
      .select('report_id, task_type, work_time, client_code, client_name, report_content, subject, details')
      .not('client_code', 'is', null)
      .not('work_time', 'is', null)

    if (!details || details.length === 0) {
      setClientRows([]); setStaffRows([]); setLoading(false); return
    }

    // 明細のreport_idで日報を取得（月をまたいだ二重計上チェックのため全期間分を取得し、当月のものと当月より前のものに分ける）
    const allReportIds = [...new Set(details.map(d => d.report_id))]
    const { data: allReportsMeta } = await supabase
      .from('daily_reports')
      .select('id, user_name, date')
      .in('id', allReportIds)

    const reportMap: Record<string, { user_name: string; date: string }> = {}
    const priorReportIds = new Set<string>()
    const allReportDate: Record<string, string> = {}
    const allReportUser: Record<string, string> = {}
    for (const r of (allReportsMeta || [])) {
      allReportDate[r.id] = r.date
      allReportUser[r.id] = r.user_name
      if (r.date >= startDate && r.date <= endDate) {
        reportMap[r.id] = { user_name: r.user_name, date: r.date }
      } else if (r.date < startDate) {
        priorReportIds.add(r.id)
      }
    }

    if (Object.keys(reportMap).length === 0) {
      setClientRows([]); setStaffRows([]); setLoading(false); return
    }

    // 担当者別業務時間: 当月日報の全明細（client_codeなし含む）を集計
    const monthReportIds = Object.keys(reportMap)
    const { data: allStaffDetails } = await supabase
      .from('daily_report_details')
      .select('report_id, work_time, task_type, client_name, report_content')
      .in('report_id', monthReportIds)
      .not('work_time', 'is', null)

    const staffTotalMinutes: Record<string, number> = {}
    const staffEntriesMap: Record<string, StaffEntry[]> = {}
    for (const d of (allStaffDetails || [])) {
      const rep = reportMap[d.report_id]
      if (!rep) continue
      const userName = rep.user_name
      staffTotalMinutes[userName] = (staffTotalMinutes[userName] || 0) + toMinutes(d.work_time)
      if (!staffEntriesMap[userName]) staffEntriesMap[userName] = []
      staffEntriesMap[userName].push({
        date: rep.date,
        task_type: d.task_type || null,
        client_name: d.client_name || null,
        work_minutes: toMinutes(d.work_time),
        report_content: d.report_content || null,
      })
    }
    // 日付順に並べる
    for (const entries of Object.values(staffEntriesMap)) {
      entries.sort((a, b) => a.date.localeCompare(b.date))
    }

    // monthly_progressから全年度の報酬を取得（処理月の報酬を参照するため全年度が必要）
    const { data: progress } = await supabase
      .from('monthly_progress')
      .select('client_code, monthly_fee, monthly_fee_settlement, monthly_fee_yearend, fiscal_month, year')

    // feeByMonth[client_code]['YYYY-M'] = fee
    const feeByMonth: Record<string, Record<string, number>> = {}
    for (const p of (progress || [])) {
      if (!feeByMonth[p.client_code]) feeByMonth[p.client_code] = {}
      for (const [m, f] of Object.entries(p.monthly_fee || {})) {
        if (f) feeByMonth[p.client_code][`${p.year}-${m}`] = Number(String(f).replace(/[^0-9]/g, ''))
      }
    }

    // 決算報酬（decision fee）が登録されている顧客: 決算月・金額を取得。
    // 決算月=12月の場合、翌月（1月）の実績は翌年のレポートで扱うことになるため、
    // 前年12月分の決算報酬（year-1のレコード）も対象に含める
    interface SettlementInfo { fiscalYear: number; fiscalMonth: number; fee: number; nextY: number; nextM: number }
    const settlementInfo: Record<string, SettlementInfo> = {}
    for (const p of (progress || [])) {
      if (!p.fiscal_month) continue
      if (p.year !== year && !(p.year === year - 1 && p.fiscal_month === 12)) continue
      const raw = (p.monthly_fee_settlement || {})[String(p.fiscal_month)]
      const fee = raw ? Number(String(raw).replace(/[^0-9]/g, '')) : 0
      if (fee <= 0) continue
      const nextY = p.fiscal_month === 12 ? p.year + 1 : p.year
      const nextM = p.fiscal_month === 12 ? 1 : p.fiscal_month + 1
      settlementInfo[p.client_code] = { fiscalYear: p.year, fiscalMonth: p.fiscal_month, fee, nextY, nextM }
    }

    // 年末調整報酬が登録されている顧客: 1月分の金額を取得。
    // 年末調整の実績は前年12月に計上されることも多いため、翌年1月分（year+1のレコード）も対象に含める
    const yearendInfo: Record<string, { fee: number; feeYear: number }> = {}
    for (const p of (progress || [])) {
      if (p.year !== year && p.year !== year + 1) continue
      const raw = (p.monthly_fee_yearend || {})['1']
      const fee = raw ? Number(String(raw).replace(/[^0-9]/g, '')) : 0
      if (fee <= 0) continue
      yearendInfo[p.client_code] = { fee, feeYear: p.year }
    }
    // 処理期間（subject〜details）が含む月キー（'YYYY-M'）の一覧。範囲指定なしはレポート対象月のみ
    const monthsInRange = (subject: string | null, details: string | null): string[] => {
      if (!subject) return [`${year}-${monthStr}`]
      const [sy, sm] = subject.split('-').map(Number)
      const endStr = details || subject
      const [ey, em] = endStr.split('-').map(Number)
      if (isNaN(sy) || isNaN(sm) || isNaN(ey) || isNaN(em)) return [`${year}-${monthStr}`]
      const keys: string[] = []
      let y = sy, m = sm, guard = 0
      while ((y < ey || (y === ey && m <= em)) && guard < 600) {
        keys.push(`${y}-${m}`)
        m++; if (m > 12) { m = 1; y++ }
        guard++
      }
      return keys
    }

    // 過去（当月より前）の日報で、同じ顧問先・同じ業務区分について既に処理済みの月を集計
    // 例：8月のレポートで「記帳 7月〜8月」を計上済みなら、9月のレポートで再び「記帳 7月〜8月」が
    // 入力されても、既に計上済みの月の報酬を二重に配分しないようにする
    const claimedMonths: Record<string, Record<string, Set<string>>> = {}
    for (const d of details) {
      if (!d.client_code || !d.subject || !priorReportIds.has(d.report_id)) continue
      const tt = d.task_type || 'その他'
      if (!claimedMonths[d.client_code]) claimedMonths[d.client_code] = {}
      if (!claimedMonths[d.client_code][tt]) claimedMonths[d.client_code][tt] = new Set()
      for (const key of monthsInRange(d.subject, d.details)) claimedMonths[d.client_code][tt].add(key)
    }

    // 基準月から指定ヶ月数以内かどうか（年をまたぐ場合にも対応）
    const inMonthWindow = (baseYear: number, baseMonth: number, span: number, ry: number, rm: number): boolean => {
      for (let i = 0; i < span; i++) {
        const mm = ((baseMonth - 1 + i) % 12) + 1
        const yy = baseYear + Math.floor((baseMonth - 1 + i) / 12)
        if (ry === yy && rm === mm) return true
      }
      return false
    }

    // 指定した業務区分について、対象月の窓の中で計上した全担当者と、各担当者が最初に計上した月（'YYYY-M'）を
    // 顧問先ごとに集計する（複数月にまたがって計上されても良い区分の配分に使う）
    function earliestStaffByClient(
      taskType: string,
      hasFee: (code: string) => boolean,
      inWindow: (code: string, ry: number, rm: number) => boolean
    ): Record<string, { totalStaff: number; earliestKeyByUser: Record<string, string> }> {
      const earliestByUser: Record<string, Record<string, { y: number; m: number }>> = {}
      for (const d of details!) {
        if (!d.client_code || d.task_type !== taskType || !hasFee(d.client_code)) continue
        const rdate = allReportDate[d.report_id]
        const user = allReportUser[d.report_id]
        if (!rdate || !user) continue
        const [ry, rm] = rdate.split('-').map(Number)
        if (!inWindow(d.client_code, ry, rm)) continue
        if (!earliestByUser[d.client_code]) earliestByUser[d.client_code] = {}
        const cur = earliestByUser[d.client_code][user]
        if (!cur || ry < cur.y || (ry === cur.y && rm < cur.m)) earliestByUser[d.client_code][user] = { y: ry, m: rm }
      }
      const result: Record<string, { totalStaff: number; earliestKeyByUser: Record<string, string> }> = {}
      for (const [code, byUser] of Object.entries(earliestByUser)) {
        const earliestKeyByUser: Record<string, string> = {}
        for (const [user, ym] of Object.entries(byUser)) earliestKeyByUser[user] = `${ym.y}-${ym.m}`
        result[code] = { totalStaff: Object.keys(byUser).length, earliestKeyByUser }
      }
      return result
    }

    // 決算65%: 作成・チェックいずれも「決算」区分で計上されるため、決算月から半年以内なら月をまたいでも良い
    const settlementDecisionInfo = earliestStaffByClient(
      '決算',
      code => !!settlementInfo[code],
      (code, ry, rm) => inMonthWindow(settlementInfo[code].fiscalYear, settlementInfo[code].fiscalMonth, 7, ry, rm)
    )

    // 年末調整: 前年12月〜当年3月の間に「年末調整」区分で計上されれば良い（複数月にまたがってもOK）
    const yearendDecisionInfo = earliestStaffByClient(
      '年末調整',
      code => !!yearendInfo[code],
      (code, ry, rm) => inMonthWindow(yearendInfo[code].feeYear - 1, 12, 4, ry, rm)
    )

    // ある実績（訪問・来所）の対象期間（subject〜details。無指定ならfallbackKeyの月）が
    // 決算月または翌月に該当するかどうか。レポートを開いている月ではなく実績自体の対象期間で判定する
    const inFiscalOrNextMonth = (st: SettlementInfo, subject: string | null, detailsField: string | null, fallbackKey: string): boolean => {
      const months = subject ? monthsInRange(subject, detailsField) : [fallbackKey]
      return months.some(key => {
        const [ky, km] = key.split('-').map(Number)
        return (ky === st.fiscalYear && km === st.fiscalMonth) || (ky === st.nextY && km === st.nextM)
      })
    }

    // 訪問来所35%の二重配分防止: 過去のレポートで既に「決算月・翌月が対象期間の訪問／来所」が
    // 計上済みかどうかを顧客ごとに判定する（実績が先に発生した月が優先してそのまま独占する仕様）
    const settlementVisitClaimed: Record<string, boolean> = {}
    for (const d of details) {
      if (!d.client_code || (d.task_type !== '訪問' && d.task_type !== '来所')) continue
      const st = settlementInfo[d.client_code]
      if (!st || !priorReportIds.has(d.report_id)) continue
      const rdate = allReportDate[d.report_id]
      if (!rdate) continue
      const [ry, rm] = rdate.split('-').map(Number)
      if (inFiscalOrNextMonth(st, d.subject, d.details, `${ry}-${rm}`)) {
        settlementVisitClaimed[d.client_code] = true
      }
    }

    // 処理期間が含む各月の「登録済み」報酬の合計（未登録月は0円・他月からの借用なし）。
    // 複数月分をまとめて処理した実績を、実際に発生した報酬の範囲内で正しく評価するために使う。
    // 過去の日報で同じ業務区分について既に計上済みの月は、二重配分を避けるため0円として扱う
    const sumFeeForRange = (code: string, taskType: string, subject: string | null, details: string | null): number => {
      const claimed = claimedMonths[code]?.[taskType]
      return monthsInRange(subject, details)
        .filter(key => !claimed?.has(key))
        .reduce((s, key) => s + (feeByMonth[code]?.[key] || 0), 0)
    }

    // WorkEntryを組み立て（当月の日報に紐づくものだけ）
    const entries: WorkEntry[] = details
      .filter(d => d.client_code && reportMap[d.report_id])
      .map(d => ({
        user_name: reportMap[d.report_id]?.user_name || '不明',
        task_type: d.task_type,
        work_minutes: toMinutes(d.work_time),
        client_code: d.client_code!,
        client_name: d.client_name || d.client_code!,
        date: reportMap[d.report_id]?.date || '',
        report_content: d.report_content || null,
        report_id: d.report_id,
        subject: d.subject || null,
        details: d.details || null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // クライアントごとに集計
    const clientMap: Record<string, ClientRow> = {}
    for (const e of entries) {
      if (!clientMap[e.client_code]) {
        clientMap[e.client_code] = {
          client_code: e.client_code,
          client_name: e.client_name,
          monthly_fee: 0,  // 配分計算後に実際の配分原資額で上書きする
          total_minutes: 0,
          task_minutes: {},
          staff_alloc: {},
          staff_minutes: {},
          entries: [],
        }
      }
      const row = clientMap[e.client_code]
      row.total_minutes += e.work_minutes
      const tt = e.task_type || 'その他'
      row.task_minutes[tt] = (row.task_minutes[tt] || 0) + e.work_minutes
      row.staff_minutes[e.user_name] = (row.staff_minutes[e.user_name] || 0) + e.work_minutes
      row.entries.push(e)
    }

    // 報酬配分を計算。処理期間（subject〜details）が含む各月の「登録済み」報酬を合算して評価するため、
    // 複数月分をまとめて処理した実績はその分だけ正しく多く評価され、未登録月は0円のまま（他月からの借用なし）
    for (const row of Object.values(clientMap)) {
      let rowEntries = entries.filter(e => e.client_code === row.client_code)
      let potBCTotal = 0  // 決算報酬・年末調整報酬のうち今月実際に配分した額（表示用「月次報酬」に含める）

      // 決算報酬（Pot B）: 決算報酬が登録されている法人は、決算・訪問来所の配分方法を
      // 「決算65%（決算区分の担当者で均等割）／訪問来所35%（決算月・翌月の担当者で均等割）」に完全に置き換える。
      // 月額報酬（Pot A）とは別の原資として配分し、いずれも実績が先に発生した月が独占する（二重配分防止）
      const st = settlementInfo[row.client_code]
      if (st) {
        // 決算65%: 作成・チェックとも「決算」区分で計上されるため月をまたいでも良い。
        // 決算区分を計上した全担当者（複数月にまたがってもOK）で均等割し、各担当者は自分が最初に
        // 計上した月のレポートでのみ受け取る（同一人物への二重配分を防止）
        const decisionInfo = settlementDecisionInfo[row.client_code]
        if (decisionInfo && decisionInfo.totalStaff > 0) {
          const share = (st.fee * 0.65) / decisionInfo.totalStaff
          const thisMonthKey = `${year}-${Number(monthStr)}`
          for (const [user, key] of Object.entries(decisionInfo.earliestKeyByUser)) {
            if (key === thisMonthKey) {
              row.staff_alloc[user] = (row.staff_alloc[user] || 0) + share
              potBCTotal += share
            }
          }
        }
        // 訪問・来所は「決算区分の実績が実際にある」場合のみ決算報酬側に振り替える。
        // 対象期間（subject〜details）が決算月・翌月に該当する実績のみが対象（レポートを開いている月ではない。
        // 例：9月のレポートに計上されていても、対象期間が7月分なら決算月7月分として扱う）
        const hasDecisionActivity = !!decisionInfo && decisionInfo.totalStaff > 0
        const thisReportKey = `${year}-${Number(monthStr)}`
        const visitEntriesToDivert = hasDecisionActivity
          ? rowEntries.filter(e => (e.task_type === '訪問' || e.task_type === '来所') && inFiscalOrNextMonth(st, e.subject, e.details, thisReportKey))
          : []
        if (visitEntriesToDivert.length > 0 && !settlementVisitClaimed[row.client_code]) {
          const visitUsers = Array.from(new Set(visitEntriesToDivert.map(e => e.user_name)))
          const share = (st.fee * 0.35) / visitUsers.length
          for (const u of visitUsers) row.staff_alloc[u] = (row.staff_alloc[u] || 0) + share
          potBCTotal += share * visitUsers.length
        }
        // 決算区分は常にPot Bへ、訪問・来所は決算報酬側に振り替えた分のみPot Bへ移すため、通常配分（Pot A）の対象から除外
        const divertSet = new Set(visitEntriesToDivert)
        rowEntries = rowEntries.filter(e => {
          if (e.task_type === '決算') return false
          if (divertSet.has(e)) return false
          return true
        })
      }

      // 年末調整報酬: 登録がある法人は全額を「年末調整」区分の担当者に配分する。
      // 複数月にまたがって計上されても良く、各担当者は自分が最初に計上した月のレポートでのみ受け取る
      const ye = yearendInfo[row.client_code]
      if (ye) {
        const yearendStaff = yearendDecisionInfo[row.client_code]
        if (yearendStaff && yearendStaff.totalStaff > 0) {
          const share = ye.fee / yearendStaff.totalStaff
          const thisMonthKey = `${year}-${Number(monthStr)}`
          for (const [user, key] of Object.entries(yearendStaff.earliestKeyByUser)) {
            if (key === thisMonthKey) {
              row.staff_alloc[user] = (row.staff_alloc[user] || 0) + share
              potBCTotal += share
            }
          }
        }
        // 年末調整はTASK_ALLOCに含まれずPot Aでは元々配分されないため、rowEntriesからの除外は不要
      }

      // Pot A（月額報酬ベースの通常配分）。表示用「月次報酬」＝ Pot Aの配分原資 ＋ 決算報酬・年末調整の今月配分分
      let potATotal = 0
      if (rowEntries.length > 0) {
        // task_typeごとにグループ化。fee = 処理期間の各月の登録済み報酬の合計（範囲指定なしは当月報酬のみ）
        const byTask: Record<string, { user: string; mins: number; fee: number }[]> = {}
        for (const e of rowEntries) {
          const tt = e.task_type || 'その他'
          if (!byTask[tt]) byTask[tt] = []
          byTask[tt].push({ user: e.user_name, mins: e.work_minutes, fee: sumFeeForRange(row.client_code, tt, e.subject, e.details) })
        }

        // この顧客の実績が参照する全月（当月＋処理期間で遡及した月）の登録済み報酬合計を配分原資とする。
        // 社会保険・所内相談等、報酬配分の対象外区分（TASK_ALLOCに無い区分）は無関係な月を巻き込まないよう対象外にする。
        // 区分ごとに既に他月で計上済み（claimedMonths）の月は除外し、翌月にまたがっても二重計上しない
        const referencedMonths = new Set<string>()
        for (const e of rowEntries) {
          const tt = e.task_type || 'その他'
          if (!TASK_ALLOC[tt]) continue
          const claimed = claimedMonths[row.client_code]?.[tt]
          for (const key of monthsInRange(e.subject, e.details)) {
            if (!claimed?.has(key)) referencedMonths.add(key)
          }
        }
        const capFee = Array.from(referencedMonths).reduce((s, key) => s + (feeByMonth[row.client_code]?.[key] || 0), 0)
        potATotal = capFee

        if (capFee > 0) {
          // 各タスクの生プール。区分ごとのレート上限（rate×配分原資）でキャップし、1区分が他区分の取り分まで食い込まないようにする
          const rawPools: Record<string, number> = {}
          for (const [taskType, alloc] of Object.entries(TASK_ALLOC)) {
            const taskEntries = byTask[taskType] || []
            if (taskEntries.length === 0) continue
            if (alloc.splitBy === 'time') {
              const totalWeightedFee = taskEntries.reduce((s, e) => s + e.fee * e.mins, 0)
              const totalMins = taskEntries.reduce((s, e) => s + e.mins, 0)
              const raw = totalMins > 0 ? alloc.rate * totalWeightedFee / totalMins : 0
              rawPools[taskType] = Math.min(raw, alloc.rate * capFee)
            } else {
              // 担当者ごとに最大のfee（同一人物の複数実績があれば大きい方）
              const personFee: Record<string, number> = {}
              for (const e of taskEntries) {
                if (!(e.user in personFee) || e.fee > personFee[e.user]) personFee[e.user] = e.fee
              }
              const totalFee = Object.values(personFee).reduce((s, f) => s + f, 0)
              const numPersons = Object.keys(personFee).length
              const raw = numPersons > 0 ? alloc.rate * totalFee / numPersons : 0
              rawPools[taskType] = Math.min(raw, alloc.rate * capFee)
            }
          }

          // 合計が配分原資を超えないよう正規化（区分をまたいだ合算が100%を超える場合の保険）
          const totalRaw = Object.values(rawPools).reduce((s, v) => s + v, 0)
          const normFactor = totalRaw > capFee ? capFee / totalRaw : 1

          // 配分を実行
          for (const [taskType, alloc] of Object.entries(TASK_ALLOC)) {
            const taskEntries = byTask[taskType] || []
            if (taskEntries.length === 0) continue
            const pool = (rawPools[taskType] || 0) * normFactor

            if (alloc.splitBy === 'time') {
              const totalWeightedFee = taskEntries.reduce((s, e) => s + e.fee * e.mins, 0)
              for (const e of taskEntries) {
                const w = e.fee * e.mins
                const share = totalWeightedFee > 0 ? (w / totalWeightedFee) * pool : pool / taskEntries.length
                row.staff_alloc[e.user] = (row.staff_alloc[e.user] || 0) + share
              }
            } else {
              const personFee: Record<string, number> = {}
              for (const e of taskEntries) {
                if (!(e.user in personFee) || e.fee > personFee[e.user]) personFee[e.user] = e.fee
              }
              const totalFee = Object.values(personFee).reduce((s, f) => s + f, 0)
              for (const [user, fee] of Object.entries(personFee)) {
                const share = totalFee > 0 ? (fee / totalFee) * pool : pool / Object.keys(personFee).length
                row.staff_alloc[user] = (row.staff_alloc[user] || 0) + share
              }
            }
          }
        }
      }

      // 表示用「月次報酬」を、実際に配分原資となった額（Pot A＋決算報酬・年末調整の今月配分分）で上書きする
      row.monthly_fee = potATotal + potBCTotal
    }

    const rows = Object.values(clientMap).sort((a, b) => b.monthly_fee - a.monthly_fee)
    setClientRows(rows)

    // 担当者別集計
    const staffMap: Record<string, StaffRow> = {}
    for (const row of rows) {
      for (const [user, alloc] of Object.entries(row.staff_alloc)) {
        if (!staffMap[user]) staffMap[user] = { user_name: user, total_alloc: 0, total_minutes: 0, entries: [] }
        staffMap[user].total_alloc += alloc
      }
    }
    // 業務時間は全明細（client_codeなし含む）から取得
    for (const [user, mins] of Object.entries(staffTotalMinutes)) {
      if (!staffMap[user]) staffMap[user] = { user_name: user, total_alloc: 0, total_minutes: 0, entries: [] }
      staffMap[user].total_minutes = mins
      staffMap[user].entries = staffEntriesMap[user] || []
    }
    setStaffRows(Object.values(staffMap).sort((a, b) => b.total_alloc - a.total_alloc))
    setLoading(false)
  }

  const totalFee = clientRows.reduce((s, r) => s + r.monthly_fee, 0)
  const totalMinutes = clientRows.reduce((s, r) => s + r.total_minutes, 0)

  function handlePrint() {
    const label = viewMode === 'staff' ? '担当者別実績' : '顧問先別実績'
    const title = `実績レポート ${year}年${month}月 ${label}`

    let tableHTML = ''
    if (viewMode === 'staff') {
      tableHTML = `<table>
        <thead><tr><th>担当者</th><th>配分報酬合計</th><th>業務時間合計</th><th>時間単価</th></tr></thead>
        <tbody>${staffRows.map(r => `<tr>
          <td>${r.user_name}</td>
          <td style="text-align:right">${fmtFee(r.total_alloc)}</td>
          <td style="text-align:right">${fmtMinutes(r.total_minutes)}</td>
          <td style="text-align:right">${fmtRate(r.total_alloc, r.total_minutes)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td>合計</td>
          <td style="text-align:right">${fmtFee(staffRows.reduce((s, r) => s + r.total_alloc, 0))}</td>
          <td style="text-align:right">${fmtMinutes(staffRows.reduce((s, r) => s + r.total_minutes, 0))}</td>
          <td></td>
        </tr></tfoot>
      </table>`
    } else {
      tableHTML = `<table>
        <thead><tr><th>顧客名</th><th>月次報酬</th><th>業務時間</th><th>時間単価</th><th>担当者別配分</th></tr></thead>
        <tbody>${clientRows.map(r => {
          const hourly = r.total_minutes > 0 && r.monthly_fee > 0 ? r.monthly_fee / (r.total_minutes / 60) : 0
          const color = hourly > 0 && hourly < 3000 ? 'red' : hourly >= 5000 ? 'green' : 'black'
          const staffStr = Object.entries(r.staff_alloc).map(([u, a]) => `${u}：${Math.round(a).toLocaleString()}円`).join('　')
          return `<tr>
            <td>${r.client_name}</td>
            <td style="text-align:right">${r.monthly_fee > 0 ? Math.round(r.monthly_fee).toLocaleString('ja-JP') + '円' : '未入力'}</td>
            <td style="text-align:right">${fmtMinutes(r.total_minutes)}</td>
            <td style="text-align:right;color:${color}">${fmtRate(r.monthly_fee, r.total_minutes)}</td>
            <td>${staffStr}</td>
          </tr>`
        }).join('')}</tbody>
      </table>`
    }

    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${title}</title>
<style>
body{font-family:'Hiragino Kaku Gothic ProN','Meiryo',sans-serif;font-size:12px;margin:20px}
h1{font-size:16px;margin-bottom:4px}p{color:#666;font-size:10px;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{background:#f3f4f6;text-align:left;padding:6px 8px;border:1px solid #e5e7eb;font-size:11px}
td{padding:6px 8px;border:1px solid #e5e7eb;font-size:11px}
tfoot td{font-weight:bold;background:#f9fafb}
@media print{@page{margin:15mm}}
</style></head><body>
<h1>${title}</h1>
<p>記帳・決算35%／訪問・来所35%（人数均等割）／チェック30% を報酬から配分</p>
${tableHTML}
<script>window.onload=function(){window.print()}<\/script>
</body></html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  function handleExcel() {
    const BOM = '﻿'
    let csv = BOM

    if (viewMode === 'staff') {
      csv += '担当者,配分報酬合計,業務時間合計,時間単価\r\n'
      csv += staffRows.map(r => [
        r.user_name,
        Math.round(r.total_alloc),
        fmtMinutes(r.total_minutes),
        r.total_minutes > 0 && r.total_alloc > 0 ? Math.round(r.total_alloc / (r.total_minutes / 60)) : '',
      ].join(',')).join('\r\n')
      const totalAlloc = staffRows.reduce((s, r) => s + r.total_alloc, 0)
      const totalMins = staffRows.reduce((s, r) => s + r.total_minutes, 0)
      csv += `\r\n合計,${Math.round(totalAlloc)},${fmtMinutes(totalMins)},`
    } else {
      csv += '顧客名,顧客コード,月次報酬,業務時間,時間単価,担当者別配分\r\n'
      csv += clientRows.map(r => {
        const hourly = r.total_minutes > 0 && r.monthly_fee > 0 ? Math.round(r.monthly_fee / (r.total_minutes / 60)) : ''
        const staffStr = Object.entries(r.staff_alloc).map(([u, a]) => `${u}：${Math.round(a).toLocaleString()}円`).join(' ')
        return [`"${r.client_name}"`, r.client_code, r.monthly_fee || '', fmtMinutes(r.total_minutes), hourly, `"${staffStr}"`].join(',')
      }).join('\r\n')
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `実績レポート_${year}年${month}月_${viewMode === 'staff' ? '担当者別' : '顧問先別'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">実績レポート</h1>
      <p className="text-xs text-gray-500 mb-5">
        記帳・決算35%／訪問・来所35%（人数均等割）／チェック30% を報酬から配分
      </p>

      {/* 年月セレクター */}
      <div className="flex items-center gap-3 mb-6">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m}>{m}月</option>
          )}
        </select>
        <span className="text-sm text-gray-500">{year}年{month}月 集計</span>
      </div>

      {/* 業務明細モーダル */}
      {detailRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <div className="font-bold text-gray-800 text-lg">{detailRow.client_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{year}年{month}月 業務明細　合計：{fmtMinutes(detailRow.total_minutes)}</div>
              </div>
              <button onClick={() => setDetailRow(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left w-24">日付</th>
                    <th className="px-3 py-2 text-left w-20">担当者</th>
                    <th className="px-3 py-2 text-left w-20">業務区分</th>
                    <th className="px-3 py-2 text-left w-24">処理月</th>
                    <th className="px-3 py-2 text-right w-16">時間</th>
                    <th className="px-3 py-2 text-left">作業内容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailRow.entries.map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{e.date}</td>
                      <td className="px-3 py-2.5 text-gray-700 text-xs">{e.user_name}</td>
                      <td className="px-3 py-2.5">
                        {e.task_type && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{e.task_type}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-purple-700 font-medium">{fmtPeriod(e.subject, e.details)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-600">{fmtMinutes(e.work_minutes)}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{e.report_content || ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 font-bold text-gray-700 text-xs">合計</td>
                    <td className="px-3 py-2 text-right font-bold font-mono text-xs text-gray-800">{fmtMinutes(detailRow.total_minutes)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 担当者別業務明細モーダル */}
      {detailStaffRow && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDetailStaffRow(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <div className="font-bold text-gray-800 text-lg">{detailStaffRow.user_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{year}年{month}月 業務明細　合計：{fmtMinutes(detailStaffRow.total_minutes)}</div>
              </div>
              <button onClick={() => setDetailStaffRow(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left w-24">日付</th>
                    <th className="px-3 py-2 text-left w-24">業務区分</th>
                    <th className="px-3 py-2 text-left">顧客名</th>
                    <th className="px-3 py-2 text-right w-16">時間</th>
                    <th className="px-3 py-2 text-left">作業内容</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detailStaffRow.entries.map((e, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{e.date}</td>
                      <td className="px-3 py-2.5">
                        {e.task_type && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{e.task_type}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 text-xs">{e.client_name || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-600">{fmtMinutes(e.work_minutes)}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{e.report_content || ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 font-bold text-gray-700 text-xs">合計</td>
                    <td className="px-3 py-2 text-right font-bold font-mono text-xs text-gray-800">{fmtMinutes(detailStaffRow.total_minutes)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 配分報酬内訳モーダル */}
      {feeBreakStaff && (() => {
        const items = clientRows
          .filter(r => (r.staff_alloc[feeBreakStaff.user_name] || 0) > 0)
          .map(r => ({ client_name: r.client_name, alloc: r.staff_alloc[feeBreakStaff.user_name] }))
          .sort((a, b) => b.alloc - a.alloc)
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setFeeBreakStaff(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <div className="font-bold text-gray-800 text-lg">{feeBreakStaff.user_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{year}年{month}月 配分報酬内訳　合計：{fmtFee(feeBreakStaff.total_alloc)}</div>
                </div>
                <button onClick={() => setFeeBreakStaff(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">顧客名</th>
                      <th className="px-4 py-2 text-right w-32">配分報酬</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2.5 text-gray-700 text-xs">{item.client_name}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-blue-700">{fmtFee(item.alloc)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                    <tr>
                      <td className="px-4 py-2 font-bold text-gray-700 text-xs">合計（{items.length}社）</td>
                      <td className="px-4 py-2 text-right font-bold font-mono text-xs text-blue-800">{fmtFee(feeBreakStaff.total_alloc)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* サマリーカード */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="text-xs text-blue-400 mb-1">月次報酬合計</div>
            <div className="text-2xl font-bold text-blue-700">{totalFee.toLocaleString('ja-JP')}円</div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-4">
            <div className="text-xs text-indigo-400 mb-1">総業務時間</div>
            <div className="text-2xl font-bold text-indigo-700">{fmtMinutes(totalMinutes)}</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <div className="text-xs text-green-400 mb-1">平均時間単価</div>
            <div className="text-2xl font-bold text-green-700">{fmtRate(totalFee, totalMinutes)}</div>
          </div>
        </div>
      )}

      {/* 表切り替えタブ ＋ 所属フィルター ＋ 印刷・エクスポート */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['staff', 'client'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              viewMode === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}>
            {v === 'staff' ? '担当者別実績' : '顧問先別実績'}
          </button>
        ))}
        {Array.from(new Set(allUsers.map(u => u.division).filter(Boolean))).length > 0 && (
          <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 ml-2">
            <option value="">所属（全チーム）</option>
            {(Array.from(new Set(allUsers.map(u => u.division).filter(Boolean))).sort() as string[]).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
            🖨️ 印刷
          </button>
          <button onClick={handleExcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
            📊 Excelエクスポート
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">読み込み中...</div>
      ) : viewMode === 'staff' ? (
        /* ── 担当者別 ── */
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 text-xs text-gray-500 font-medium">
            担当者別実績（{year}年{month}月）
          </div>
          {(() => {
            const staffDivMap: Record<string, string> = {}
            for (const u of allUsers) if (u.name && u.division) staffDivMap[u.name] = u.division
            const hasDivisions = allUsers.some(u => u.division)

            const filteredStaff = filterDivision
              ? staffRows.filter(r => staffDivMap[r.user_name] === filterDivision)
              : staffRows

            if (filteredStaff.length === 0) return (
              <div className="text-center py-12 text-gray-400">データがありません</div>
            )

            // チーム別集計
            const divSummary: Record<string, { alloc: number; minutes: number }> = {}
            for (const r of filteredStaff) {
              const div = staffDivMap[r.user_name] || '未設定'
              if (!divSummary[div]) divSummary[div] = { alloc: 0, minutes: 0 }
              divSummary[div].alloc += r.total_alloc
              divSummary[div].minutes += r.total_minutes
            }
            const divKeys = Object.keys(divSummary).sort()

            return (
              <>
                {/* チーム集計 */}
                {hasDivisions && !filterDivision && divKeys.length > 1 && (
                  <div className="border-b border-gray-100 px-5 py-3 bg-indigo-50/60">
                    <div className="text-xs font-semibold text-indigo-600 mb-2">チーム別集計</div>
                    <div className="flex flex-wrap gap-4">
                      {divKeys.map(div => (
                        <div key={div} className="text-xs bg-white border border-indigo-200 rounded-lg px-3 py-2 min-w-[180px]">
                          <div className="font-bold text-indigo-700 mb-1">{div}</div>
                          <div className="flex gap-4 text-gray-600">
                            <span>報酬配分 <span className="font-bold text-blue-700">{fmtFee(divSummary[div].alloc)}</span></span>
                            <span>時間 <span className="font-bold">{fmtMinutes(divSummary[div].minutes)}</span></span>
                            <span>単価 <span className="font-bold text-green-700">{fmtRate(divSummary[div].alloc, divSummary[div].minutes)}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                    <tr>
                      <th className="px-5 py-3 text-left">担当者</th>
                      {hasDivisions && <th className="px-4 py-3 text-left">所属</th>}
                      <th className="px-4 py-3 text-right">配分報酬合計</th>
                      <th className="px-4 py-3 text-right">業務時間合計</th>
                      <th className="px-4 py-3 text-right">時間単価</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStaff.map(r => (
                      <tr key={r.user_name} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-semibold text-gray-800">{r.user_name}</td>
                        {hasDivisions && <td className="px-4 py-3 text-xs text-gray-500">{staffDivMap[r.user_name] || '—'}</td>}
                        <td className="px-4 py-3 text-right font-bold text-blue-700">
                          <button onClick={() => setFeeBreakStaff(r)} className="hover:underline">
                            {fmtFee(r.total_alloc)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setDetailStaffRow(r)}
                            className="font-mono text-blue-600 hover:underline text-sm">
                            {fmtMinutes(r.total_minutes)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right text-green-700 font-bold">{fmtRate(r.total_alloc, r.total_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-5 py-3 font-bold text-gray-700" colSpan={hasDivisions ? 2 : 1}>
                        {filterDivision ? `${filterDivision} 合計` : '合計'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-800">{fmtFee(filteredStaff.reduce((s, r) => s + r.total_alloc, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-700 font-mono">{fmtMinutes(filteredStaff.reduce((s, r) => s + r.total_minutes, 0))}</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )
          })()}
        </div>
      ) : (
        /* ── 顧問先別 ── */
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 text-xs text-gray-500 font-medium">
            顧問先別実績（{year}年{month}月）
          </div>
          {clientRows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left min-w-[160px]">顧客名</th>
                    <th className="px-3 py-3 text-right w-28">月次報酬</th>
                    <th className="px-3 py-3 text-right w-24">業務時間</th>
                    <th className="px-3 py-3 text-right w-28">時間単価</th>
                    <th className="px-3 py-3 text-left">担当者別配分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientRows.map(r => {
                    const hourly = r.total_minutes > 0 && r.monthly_fee > 0
                      ? r.monthly_fee / (r.total_minutes / 60) : 0
                    const isLow = hourly > 0 && hourly < 3000
                    return (
                      <tr key={r.client_code} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-800">{r.client_name}</div>
                          <div className="text-xs text-gray-400 font-mono">{r.client_code}</div>
                        </td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {r.monthly_fee > 0 ? Math.round(r.monthly_fee).toLocaleString('ja-JP') + '円' : <span className="text-gray-300">未入力</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button onClick={() => setDetailRow(r)}
                            className="font-mono text-blue-600 hover:underline text-sm">
                            {fmtMinutes(r.total_minutes)}
                          </button>
                        </td>
                        <td className={`px-3 py-3 text-right font-bold ${isLow ? 'text-red-600' : hourly >= 5000 ? 'text-green-600' : 'text-gray-700'}`}>
                          {fmtRate(r.monthly_fee, r.total_minutes)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(r.staff_alloc).map(([user, alloc]) => (
                              <span key={user} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {user}：{Math.round(alloc).toLocaleString()}円
                              </span>
                            ))}
                            {Object.keys(r.staff_alloc).length === 0 && r.total_minutes > 0 && (
                              <span className="text-xs text-gray-400">報酬未入力</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
