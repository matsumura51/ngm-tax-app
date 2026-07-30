'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MonthlyProgress, Client, TaxSchedule } from '@/lib/types'
import { Search, X, RefreshCw } from 'lucide-react'

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MONTHLY_FIELDS = [
  { key: 'monthly_contact',    label: '連絡',    type: 'date' },
  { key: 'monthly_material',   label: '資料収集', type: 'date' },
  { key: 'monthly_input',      label: '入力',    type: 'date' },
  { key: 'monthly_completion', label: '月次完成', type: 'date' },
  { key: 'monthly_report',     label: '報告',    type: 'date' },
  { key: 'monthly_fee',        label: '報酬',    type: 'text' },
]
type ActiveTab = '月次進捗' | '税務情報' | '決算業務'

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  const m = s.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (m) return `${parseInt(m[1])}/${parseInt(m[2])}`
  return s
}

function fmtFee(s: string | null | undefined): string {
  if (!s) return ''
  const n = parseInt(s.replace(/,/g, ''), 10)
  return isNaN(n) ? '' : n.toLocaleString('ja-JP')
}

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

const SETTLE_FIELDS = [
  { key: 'settle_consumption_judged', label: '消費税判定' },
  { key: 'settle_notice',             label: '決算期お知らせ' },
  { key: 'settle_materials',          label: '資料収集' },
  { key: 'settle_return_prepared',    label: '申告書作成' },
  { key: 'settle_contact',            label: '連絡' },
  { key: 'settle_filed',              label: '電子申告' },
  { key: 'settle_payment',            label: 'ダイレクト納付/納付書' },
  { key: 'ledger_status',             label: '総勘定元帳' },
  { key: 'report_status',             label: '決算報告書' },
  { key: 'consumption_tax_filed',     label: '消費税申告' },
  { key: 'invoice_status',            label: '請求書' },
  { key: 'director_change',           label: '役員変更' },
]

// ヘッダー背景色
const H1 = 'bg-[#5c3ea8]'
const H2 = 'bg-[#7b52c4]'
// スティッキー高さ: 1行目 py-2 + 11px font ≈ 32px
const TOP2 = 'top-8'

export default function MonthlyPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, MonthlyProgress>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('月次進捗')
  const [saving, setSaving] = useState(false)

  const [monthModal, setMonthModal] = useState<{ client: Client; month: number } | null>(null)
  const [monthDates, setMonthDates] = useState<Record<string, string>>({})
  const [settleModal, setSettleModal] = useState<Client | null>(null)
  const [settleForm, setSettleForm] = useState<Record<string, string>>({})
  const [taxSchedules, setTaxSchedules] = useState<TaxSchedule[]>([])
  const [scheduleInfo, setScheduleInfo] = useState<{ imported_at: string | null; count: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [sheets, setSheets] = useState<{ name: string; gid: string }[]>([])
  const [selectedGid, setSelectedGid] = useState('510339633')

  const SHEET_ID = '1dopOS5hjcHsyk9-mWvTKYGWNQAFuPBaoF0rMjuptMhc'

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: clientsData }, { data: progressData }] = await Promise.all([
      supabase.from('clients').select('*').is('contract_end_date', null).eq('show_in_monthly', true).order('code'),
      supabase.from('monthly_progress').select('*').eq('year', year),
    ])
    setClients(clientsData || [])
    const map: Record<string, MonthlyProgress> = {}
    for (const p of (progressData || [])) map[p.client_code] = p
    setProgressMap(map)
    setLoading(false)
  }

  useEffect(() => {
    if (activeTab === '税務情報') {
      loadTaxSchedules()
      loadSheets()
    }
  }, [activeTab, year])

  async function loadTaxSchedules(y = year) {
    const supabase = createClient()
    const { data } = await supabase.from('tax_schedules')
      .select('*').eq('year', y).order('month').order('client_name')
    setTaxSchedules(data || [])
    if (data && data.length > 0) {
      setScheduleInfo({ imported_at: data[0].imported_at, count: data.length })
    } else {
      setScheduleInfo(null)
    }
  }

  async function loadSheets() {
    try {
      const res = await fetch(
        `https://spreadsheets.google.com/feeds/worksheets/${SHEET_ID}/public/basic?alt=json`
      )
      if (!res.ok) return
      const json = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries: any[] = json.feed?.entry || []
      const parsed = entries.map((e) => {
        const name: string = e['title']?.['$t'] || ''
        const links: Array<{ href: string }> = e['link'] || []
        const vizLink = links.find(l => l.href?.includes('gviz/tq'))
        const gidMatch = vizLink?.href?.match(/[?&#]gid=(\d+)/)
        return { name, gid: gidMatch?.[1] || '' }
      }).filter(s => s.gid)
      if (parsed.length > 0) {
        setSheets(parsed)
        if (!parsed.find(s => s.gid === selectedGid)) setSelectedGid(parsed[0].gid)
      }
    } catch {
      // シート一覧取得失敗時はデフォルトgidのまま使用
    }
  }

  async function importFromSheet() {
    setImporting(true)
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${selectedGid}`
      const csvRes = await fetch(gvizUrl)
      if (!csvRes.ok) throw new Error(`スプレッドシート取得エラー: HTTP ${csvRes.status}`)
      const csvText = await csvRes.text()
      const res = await fetch('/api/tax-schedules/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(`読み込みエラー: ${json.error}\n\n先頭3行:\n${JSON.stringify(json.debugRows, null, 2)}`)
        return
      }
      await loadTaxSchedules(json.year)
      alert(`${json.year}年${json.month}月分 ${json.count}件を読み込みました`)
    } catch (e) {
      alert('エラー: ' + String(e))
    } finally {
      setImporting(false)
    }
  }

  function prog(code: string): MonthlyProgress | null { return progressMap[code] || null }

  async function ensureProgress(client: Client): Promise<MonthlyProgress | null> {
    const existing = progressMap[client.code]
    if (existing) return existing
    const supabase = createClient()
    const { data } = await supabase.from('monthly_progress').insert({
      client_id: client.id, client_code: client.code, client_name: client.name,
      year, fiscal_month: client.fiscal_month, industry: client.industry,
      consumption_tax: client.consumption_tax, withholding_tax: client.withholding_tax,
      invoice_registered: client.invoice_registered, primary_staff: client.primary_staff,
    }).select().single()
    if (data) { setProgressMap(prev => ({ ...prev, [client.code]: data })); return data }
    return null
  }

  function openMonthModal(client: Client, month: number) {
    const p = prog(client.code)
    const dates: Record<string, string> = {}
    for (const f of MONTHLY_FIELDS) {
      const val = p?.[f.key as keyof MonthlyProgress] as Record<string, string | null> | undefined
      dates[f.key] = val?.[String(month)] || ''
    }
    setMonthDates(dates)
    setMonthModal({ client, month })
  }

  async function saveMonthModal() {
    if (!monthModal) return
    setSaving(true)
    const { client, month } = monthModal
    let p = prog(client.code)
    if (!p) p = await ensureProgress(client)
    if (!p) { setSaving(false); return }
    const supabase = createClient()
    const updates: Record<string, Record<string, string | null>> = {}
    for (const f of MONTHLY_FIELDS) {
      const existing = (p[f.key as keyof MonthlyProgress] as Record<string, string | null>) || {}
      updates[f.key] = { ...existing, [String(month)]: monthDates[f.key] || null }
    }
    await supabase.from('monthly_progress').update(updates).eq('id', p.id)
    setProgressMap(prev => ({ ...prev, [client.code]: { ...p!, ...updates } }))
    setSaving(false)
    setMonthModal(null)
  }

  function openSettleModal(client: Client) {
    const p = prog(client.code)
    const form: Record<string, string> = {}
    for (const f of SETTLE_FIELDS) form[f.key] = (p?.[f.key as keyof MonthlyProgress] as string | null) || ''
    setSettleForm(form)
    setSettleModal(client)
  }

  async function saveSettleModal() {
    if (!settleModal) return
    setSaving(true)
    let p = prog(settleModal.code)
    if (!p) p = await ensureProgress(settleModal)
    if (!p) { setSaving(false); return }
    const supabase = createClient()
    const updates: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(settleForm)) updates[k] = v || null
    await supabase.from('monthly_progress').update(updates).eq('id', p.id)
    setProgressMap(prev => ({ ...prev, [settleModal.code]: { ...p!, ...updates } }))
    setSaving(false)
    setSettleModal(null)
  }

  const filtered = clients.filter(c => !search || c.name.includes(search) || c.code.includes(search))
  const currentMonth = new Date().getMonth() + 1

  function getMonthVal(code: string, field: string, month: string, isDate: boolean): string {
    const p = prog(code)
    if (!p) return ''
    const obj = p[field as keyof MonthlyProgress] as Record<string, string | null> | undefined
    const v = obj?.[month] || ''
    if (isDate) return fmtDate(v)
    if (field === 'monthly_fee') return fmtFee(v)
    return v
  }

  // 共通スティッキーセルスタイル
  const thH1 = `sticky top-0 z-30 ${H1} text-white text-center whitespace-nowrap px-2 py-2 font-medium`
  const thH2 = `sticky ${TOP2} z-30 ${H2} text-white text-center whitespace-nowrap px-1 py-1.5 font-normal`
  const td = 'px-2 py-2 text-center text-gray-700 text-[11px]'

  function stickyCode(even: boolean) {
    return `sticky left-0 top-0 z-40 ${even ? 'bg-white' : 'bg-gray-50'} px-3 py-2 font-mono text-[11px] text-gray-600 whitespace-nowrap border-r border-gray-200`
  }
  function stickyName(even: boolean) {
    return `sticky left-20 top-0 z-40 ${even ? 'bg-white' : 'bg-gray-50'} px-3 py-2 font-medium text-[11px] text-gray-800 whitespace-nowrap border-r border-gray-200 max-w-[180px] truncate`
  }

  const tableContainer = 'bg-white rounded-xl shadow overflow-x-auto'
  const containerStyle = { maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' as const }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-5">
        <h1 className="text-2xl font-bold text-gray-800">月次進捗表</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {[2023, 2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}年度</option>
          ))}
        </select>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="顧客名・コードで検索" value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm w-64" />
        </div>
        <span className="text-sm text-gray-500">{filtered.length}件</span>
      </div>

      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {(['月次進捗', '税務情報', '決算業務'] as ActiveTab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
              activeTab === tab ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ===== 月次進捗 Tab ===== */}
      {activeTab === '月次進捗' && (
        <div className={tableContainer} style={containerStyle}>
          <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              {/* Row 1: 固定情報 + 月グループ */}
              <tr className={`${H1} text-white`}>
                <th className={`sticky left-0 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-20`} rowSpan={2}>顧客コード</th>
                <th className={`sticky left-20 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600`} rowSpan={2}>顧客名</th>
                <th className={`${thH1} w-14`} rowSpan={2}>決算月</th>
                <th className={`${thH1} w-20 border-r border-purple-600`} rowSpan={2}>主担当</th>
                {MONTHS.map(m => (
                  <th key={m} colSpan={6}
                    className={`${thH1} border-l border-purple-600 ${String(currentMonth) === m ? '!bg-[#8b2252]' : ''}`}>
                    {m}月分
                  </th>
                ))}
              </tr>
              {/* Row 2: 各月の項目名 */}
              <tr className={`${H2} text-white`}>
                {MONTHS.map(m => (
                  MONTHLY_FIELDS.map(f => (
                    <th key={`${m}-${f.key}`}
                      className={`${thH2} min-w-[3rem] border-l border-purple-500 ${String(currentMonth) === m ? '!bg-[#a03268]' : ''}`}>
                      {f.label}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={76} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
              ) : filtered.map((c, ri) => {
                const even = ri % 2 === 0
                const p = prog(c.code)
                return (
                  <tr key={c.id} className={even ? 'bg-white' : 'bg-gray-50'}>
                    <td className={stickyCode(even)}>{c.code}</td>
                    <td className={stickyName(even)}>{c.name}</td>
                    <td className={td}>{c.fiscal_month === 0 ? '個人' : c.fiscal_month ? `${c.fiscal_month}月` : '-'}</td>
                    <td className={`${td} border-r border-gray-200`}>{c.primary_staff || p?.primary_staff || '-'}</td>
                    {MONTHS.map(m => (
                      MONTHLY_FIELDS.map((f, fi) => {
                        const val = getMonthVal(c.code, f.key, m, f.type === 'date')
                        const isCur = String(currentMonth) === m
                        const isFee = f.key === 'monthly_fee'
                        return (
                          <td key={`${m}-${f.key}`}
                            onClick={() => openMonthModal(c, parseInt(m))}
                            className={`px-1 py-2 text-center cursor-pointer hover:bg-blue-50 transition text-[11px] ${
                              fi === 0 ? 'border-l border-gray-200' : ''
                            } ${isCur ? 'bg-pink-50' : ''} ${isFee && val ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
                            {val}
                          </td>
                        )
                      })
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 税務情報 Tab ===== */}
      {activeTab === '税務情報' && (
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <select
              value={selectedGid}
              onChange={e => setSelectedGid(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-28"
            >
              {sheets.length === 0
                ? <option value="510339633">（読み込み中...）</option>
                : sheets.map(s => <option key={s.gid} value={s.gid}>{s.name}</option>)
              }
            </select>
            <button onClick={importFromSheet} disabled={importing}
              className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
              <RefreshCw size={13} className={importing ? 'animate-spin' : ''} />
              {importing ? '読み込み中...' : '読み込む'}
            </button>
            {scheduleInfo && (
              <span className="text-xs text-gray-500">
                合計 {scheduleInfo.count}件
                　最終読み込み: {new Date(scheduleInfo.imported_at!).toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })}
              </span>
            )}
          </div>

          <div className={tableContainer} style={containerStyle}>
            <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
              <thead>
                <tr className={`${H1} text-white`}>
                  <th className={`sticky left-0 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-20`}>顧客コード</th>
                  <th className={`sticky left-20 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600`}>顧客名</th>
                  <th className={thH1}>税目</th>
                  <th className={thH1}>納付額</th>
                  <th className={thH1}>回数</th>
                  <th className={`${thH1} text-red-200`}>期限</th>
                  <th className={thH1}>納付方法</th>
                  <th className={thH1}>送付日・申告日</th>
                  <th className={thH1}>納付日</th>
                  <th className={thH1}>確認</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
                ) : filtered.flatMap((c, ci) => {
                  const even = ci % 2 === 0
                  const bg = even ? 'bg-white' : 'bg-gray-50'
                  const entries = taxSchedules.filter(s => s.matched_client_code === c.code)
                  if (entries.length === 0) {
                    return [(
                      <tr key={c.id} className={bg}>
                        <td className={stickyCode(even)}>{c.code}</td>
                        <td className={stickyName(even)}>{c.name}</td>
                        <td className={td}></td>
                        <td className="px-2 py-2 text-right text-gray-400 text-[11px] tabular-nums">0円</td>
                        <td className={td}></td>
                        <td className={td}></td>
                        <td className={td}></td>
                        <td className={td}></td>
                        <td className={td}></td>
                        <td className={td}></td>
                      </tr>
                    )]
                  }
                  return entries.map((s, ei) => (
                    <tr key={s.id} className={bg}>
                      <td className={stickyCode(even)}>{ei === 0 ? c.code : ''}</td>
                      <td className={stickyName(even)}>{ei === 0 ? c.name : ''}</td>
                      <td className={td}>{s.tax_type || ''}</td>
                      <td className="px-2 py-2 text-right text-gray-800 text-[11px] font-medium tabular-nums">{s.amount || ''}</td>
                      <td className={td}>{s.installment || ''}</td>
                      <td className="px-2 py-2 text-center text-red-600 font-medium text-[11px]">{s.deadline || ''}</td>
                      <td className={td}>{s.payment_method || ''}</td>
                      <td className={td}>{s.send_date || ''}</td>
                      <td className={td}>{s.payment_date || ''}</td>
                      <td className={`${td} ${s.confirmation ? 'text-green-600 font-medium' : ''}`}>{s.confirmation || ''}</td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== 決算業務 Tab ===== */}
      {activeTab === '決算業務' && (
        <div className={tableContainer} style={containerStyle}>
          <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr className={`${H1} text-white`}>
                <th className={`sticky left-0 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-20`}>顧客コード</th>
                <th className={`sticky left-20 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600`}>顧客名</th>
                <th className={`${thH1} border-l border-purple-600`}>消費税判定</th>
                <th className={thH1}>決算期<br/>お知らせ</th>
                <th className={thH1}>資料収集</th>
                <th className={thH1}>申告書作成</th>
                <th className={thH1}>連絡</th>
                <th className={thH1}>電子申告</th>
                <th className={`${thH1} border-l border-purple-600`}>ダイレクト納付/<br/>納付書</th>
                <th className={thH1}>総勘定元帳</th>
                <th className={thH1}>決算報告書</th>
                <th className={thH1}>消費税申告</th>
                <th className={thH1}>請求書</th>
                <th className={`${thH1} border-l border-purple-600`}>役員変更</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={14} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
              ) : filtered.map((c, ri) => {
                const p = prog(c.code)
                const even = ri % 2 === 0
                return (
                  <tr key={c.id} onClick={() => openSettleModal(c)}
                    className={`cursor-pointer hover:bg-blue-50 ${even ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className={stickyCode(even)}>{c.code}</td>
                    <td className={stickyName(even)}>{c.name}</td>
                    <td className={`${td} border-l border-gray-100`}>{p?.settle_consumption_judged || ''}</td>
                    <td className={td}>{p?.settle_notice || ''}</td>
                    <td className={td}>{p?.settle_materials || ''}</td>
                    <td className={td}>{p?.settle_return_prepared || ''}</td>
                    <td className={td}>{p?.settle_contact || ''}</td>
                    <td className={td}>{p?.settle_filed || ''}</td>
                    <td className={`${td} border-l border-gray-100 text-left whitespace-pre-line`}>{p?.settle_payment || ''}</td>
                    <td className={`${td} text-left whitespace-pre-line`}>{p?.ledger_status || ''}</td>
                    <td className={`${td} text-left whitespace-pre-line`}>{p?.report_status || ''}</td>
                    <td className={td}>{p?.consumption_tax_filed || ''}</td>
                    <td className={td}>{p?.invoice_status || ''}</td>
                    <td className={`${td} border-l border-gray-100`}>{p?.director_change || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 月次進捗 モーダル ===== */}
      {monthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setMonthModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-bold text-gray-800">{monthModal.client.name}</div>
                <div className="text-sm text-blue-600 font-medium">{year}年 {monthModal.month}月</div>
              </div>
              <button onClick={() => setMonthModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {MONTHLY_FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-500 w-16 shrink-0">{f.label}</label>
                  {f.type === 'date' ? (
                    <input type="date" value={monthDates[f.key] || ''}
                      onChange={e => setMonthDates(d => ({ ...d, [f.key]: e.target.value }))}
                      className={inp} />
                  ) : (
                    <input type="text" inputMode="numeric"
                      value={fmtFee(monthDates[f.key])}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setMonthDates(d => ({ ...d, [f.key]: raw }))
                      }}
                      placeholder="例: 10,000" className={inp} />
                  )}
                  {monthDates[f.key] && (
                    <button onClick={() => setMonthDates(d => ({ ...d, [f.key]: '' }))} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMonthModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              <button onClick={saveMonthModal} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 決算業務 モーダル ===== */}
      {settleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSettleModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-[460px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <div>
                <div className="font-bold text-gray-800">{settleModal.name}</div>
                <div className="text-sm text-gray-500">{year}年度 決算業務</div>
              </div>
              <button onClick={() => setSettleModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {SETTLE_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</label>
                  <input value={settleForm[key] || ''} onChange={e => setSettleForm(f => ({ ...f, [key]: e.target.value }))} className={inp} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setSettleModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              <button onClick={saveSettleModal} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
