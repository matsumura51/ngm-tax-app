'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// 業務区分ごとの配分率と分割方法
const TASK_ALLOC: Record<string, { rate: number; splitBy: 'time' | 'person' }> = {
  '記帳':  { rate: 0.4, splitBy: 'time' },
  '決算':  { rate: 0.4, splitBy: 'time' },
  '訪問':  { rate: 0.4, splitBy: 'person' },
  '来所':  { rate: 0.4, splitBy: 'person' },
  'チェック': { rate: 0.2, splitBy: 'person' },
}

function toMinutes(s: string | null | undefined): number {
  if (!s) return 0
  const [h, m] = s.split(':').map(Number)
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
}

function fmtMinutes(m: number): string {
  if (m === 0) return '—'
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

function fmtFee(n: number): string {
  return Math.round(n).toLocaleString('ja-JP') + '円'
}

function fmtRate(fee: number, minutes: number): string {
  if (minutes === 0 || fee === 0) return '—'
  const hourly = (fee / (minutes / 60))
  return Math.round(hourly).toLocaleString('ja-JP') + '円/h'
}

function monthSpan(subject: string | null, details: string | null): number {
  if (!subject) return 1
  const end = details || subject
  const [sy, sm] = subject.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  if (isNaN(sy) || isNaN(sm) || isNaN(ey) || isNaN(em)) return 1
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
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
  entry_fee: number  // 処理月の報酬
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

    // 明細のreport_idで日報を取得し、当月のものだけ残す
    const allReportIds = [...new Set(details.map(d => d.report_id))]
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('id, user_name, date')
      .in('id', allReportIds)
      .gte('date', startDate)
      .lte('date', endDate)

    const reportMap: Record<string, { user_name: string; date: string }> = {}
    for (const r of (reports || [])) reportMap[r.id] = { user_name: r.user_name, date: r.date }

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
      .select('client_code, monthly_fee, year')

    // feeByMonth[client_code]['YYYY-M'] = fee
    const feeByMonth: Record<string, Record<string, number>> = {}
    for (const p of (progress || [])) {
      if (!feeByMonth[p.client_code]) feeByMonth[p.client_code] = {}
      for (const [m, f] of Object.entries(p.monthly_fee || {})) {
        if (f) feeByMonth[p.client_code][`${p.year}-${m}`] = Number(String(f).replace(/[^0-9]/g, ''))
      }
    }
    // 処理月（subject: 'YYYY-MM'）から報酬を取得。見つからない場合はレポート月→任意月の順でフォールバック
    const getSubjectFee = (code: string, subject: string | null): number => {
      if (subject) {
        const parts = subject.split('-').map(Number)
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          const fee = feeByMonth[code]?.[`${parts[0]}-${parts[1]}`]
          if (fee) return fee
        }
      }
      const reportMonthFee = feeByMonth[code]?.[`${year}-${monthStr}`]
      if (reportMonthFee) return reportMonthFee
      // 当月データなし → 登録済みの非ゼロ最大値を使用
      const allFees = Object.values(feeByMonth[code] || {}).filter(f => f > 0)
      return allFees.length > 0 ? Math.max(...allFees) : 0
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
        entry_fee: getSubjectFee(d.client_code!, d.subject || null),  // 処理月の報酬
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // 表示用：当月の月次報酬を直接参照（加重平均は0費用のエントリで歪む）
    const clientDisplayFee = (code: string): number => {
      const thisMonth = feeByMonth[code]?.[`${year}-${monthStr}`]
      if (thisMonth) return thisMonth
      // 当月データなし → エントリの非ゼロentry_fee最大値
      const maxFee = entries.filter(e => e.client_code === code && e.entry_fee > 0)
                            .reduce((mx, e) => Math.max(mx, e.entry_fee), 0)
      return maxFee
    }

    // クライアントごとに集計
    const clientMap: Record<string, ClientRow> = {}
    for (const e of entries) {
      if (!clientMap[e.client_code]) {
        clientMap[e.client_code] = {
          client_code: e.client_code,
          client_name: e.client_name,
          monthly_fee: clientDisplayFee(e.client_code),  // 処理月の加重平均報酬
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

    // 報酬配分を計算（処理月の報酬を使用・合計を加重平均報酬でキャップ）
    for (const row of Object.values(clientMap)) {
      if (row.monthly_fee === 0) continue

      // task_typeごとにグループ化（entry_fee込み）
      const byTask: Record<string, { user: string; mins: number; subject: string | null; details: string | null; entry_fee: number }[]> = {}
      for (const e of entries.filter(e => e.client_code === row.client_code)) {
        const tt = e.task_type || 'その他'
        if (!byTask[tt]) byTask[tt] = []
        byTask[tt].push({ user: e.user_name, mins: e.work_minutes, subject: e.subject, details: e.details, entry_fee: e.entry_fee })
      }

      // 各タスクの生プール（処理月の報酬×月数で計算）
      const rawPools: Record<string, number> = {}
      for (const [taskType, alloc] of Object.entries(TASK_ALLOC)) {
        const taskEntries = byTask[taskType] || []
        if (taskEntries.length === 0) continue
        if (alloc.splitBy === 'time') {
          // entry_fee × 月数 × 時間 の加重和 / 総時間
          const totalWeightedFee = taskEntries.reduce((s, e) => s + e.entry_fee * e.mins * monthSpan(e.subject, e.details), 0)
          const totalMins = taskEntries.reduce((s, e) => s + e.mins, 0)
          rawPools[taskType] = totalMins > 0 ? alloc.rate * totalWeightedFee / totalMins : 0
        } else {
          // 担当者ごとに entry_fee × 最大月数
          const personData: Record<string, { months: number; fee: number }> = {}
          for (const e of taskEntries) {
            const ms = monthSpan(e.subject, e.details)
            if (!personData[e.user] || ms > personData[e.user].months) {
              personData[e.user] = { months: ms, fee: e.entry_fee }
            }
          }
          const totalFeeMonths = Object.values(personData).reduce((s, p) => s + p.fee * p.months, 0)
          const numPersons = Object.keys(personData).length
          rawPools[taskType] = numPersons > 0 ? alloc.rate * totalFeeMonths / numPersons : 0
        }
      }

      // 合計が加重平均報酬を超えないよう正規化
      const capFee = row.monthly_fee
      const totalRaw = Object.values(rawPools).reduce((s, v) => s + v, 0)
      const normFactor = totalRaw > capFee ? capFee / totalRaw : 1

      // 配分を実行
      for (const [taskType, alloc] of Object.entries(TASK_ALLOC)) {
        const taskEntries = byTask[taskType] || []
        if (taskEntries.length === 0) continue
        const pool = (rawPools[taskType] || 0) * normFactor

        if (alloc.splitBy === 'time') {
          const totalWeightedFee = taskEntries.reduce((s, e) => s + e.entry_fee * e.mins * monthSpan(e.subject, e.details), 0)
          for (const e of taskEntries) {
            const w = e.entry_fee * e.mins * monthSpan(e.subject, e.details)
            const share = totalWeightedFee > 0 ? (w / totalWeightedFee) * pool : pool / taskEntries.length
            row.staff_alloc[e.user] = (row.staff_alloc[e.user] || 0) + share
          }
        } else {
          const personData: Record<string, { months: number; fee: number }> = {}
          for (const e of taskEntries) {
            const ms = monthSpan(e.subject, e.details)
            if (!personData[e.user] || ms > personData[e.user].months) {
              personData[e.user] = { months: ms, fee: e.entry_fee }
            }
          }
          const totalFeeMonths = Object.values(personData).reduce((s, p) => s + p.fee * p.months, 0)
          for (const [user, data] of Object.entries(personData)) {
            const share = totalFeeMonths > 0 ? (data.fee * data.months / totalFeeMonths) * pool : pool / Object.keys(personData).length
            row.staff_alloc[user] = (row.staff_alloc[user] || 0) + share
          }
        }
      }
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
<p>記帳・決算40%／訪問・来所40%（人数均等割）／チェック20% を報酬から配分</p>
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
        記帳・決算40%／訪問・来所40%（人数均等割）／チェック20% を報酬から配分
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
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-gray-600">{fmtMinutes(e.work_minutes)}</td>
                      <td className="px-3 py-2.5 text-gray-600 text-xs">{e.report_content || ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                  <tr>
                    <td colSpan={3} className="px-4 py-2 font-bold text-gray-700 text-xs">合計</td>
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
                        <td className="px-4 py-3 text-right font-bold text-blue-700">{fmtFee(r.total_alloc)}</td>
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
