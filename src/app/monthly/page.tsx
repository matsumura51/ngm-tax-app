'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
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

// "YYYY-MM-DD" → "M/D" for table display; pass-through other formats
function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  const m = s.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (m) return `${parseInt(m[1])}/${parseInt(m[2])}`
  return s
}

// "M/D" or "YYYY-MM-DD" → "YYYY-MM-DD" (for date input value)
function toIso(s: string | null | undefined): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const parts = s.split('/')
  if (parts.length === 2) {
    const m = parts[0].padStart(2, '0')
    const d = parts[1].padStart(2, '0')
    return `${new Date().getFullYear()}-${m}-${d}`
  }
  return ''
}

function fmtFee(s: string | null | undefined): string {
  if (!s) return ''
  const n = parseInt(s.replace(/,/g, ''), 10)
  return isNaN(n) ? '' : n.toLocaleString('ja-JP')
}

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'

const SETTLE_FIELDS: { key: string; label: string; placeholder?: string; type?: string }[] = [
  { key: 'settle_consumption_judged', label: '消費税判定',           placeholder: '例: 課税／免税' },
  { key: 'settle_materials',          label: '資料収集',              type: 'date' },
  { key: 'settle_return_prepared',    label: '申告書作成',            type: 'date' },
  { key: 'settle_contact',            label: '連絡',                  type: 'date' },
  { key: 'settle_filed',              label: '電子申告',              type: 'date' },
  { key: 'settle_payment',            label: 'ダイレクト納付/納付書',  type: 'date' },
  { key: 'settle_return_docs',        label: '返却書類',               type: 'checkbox' },
  { key: 'director_change',           label: '役員変更',              placeholder: '例: なし' },
]
const SETTLE_TAX_FIELDS = [
  { key: 'settle_corp_tax_amount',        label: '法人税確定額' },
  { key: 'settle_con_tax_amount',         label: '消費税確定額' },
  { key: 'settle_con_tax_installments',   label: '消費税中間回数' },
  { key: 'settle_next_corp_interim',      label: '来期法人税中間（手動）' },
  { key: 'settle_next_con_interim',       label: '来期消費税中間（手動）' },
]
const CON_INSTALLMENT_OPTIONS = [
  { value: '0',  label: '0回（中間申告不要）' },
  { value: '1',  label: '年1回' },
  { value: '3',  label: '年3回' },
  { value: '11', label: '年11回' },
]

function calcInterim(amountStr: string | null | undefined): string {
  if (!amountStr) return ''
  const n = parseInt(amountStr.replace(/[^0-9]/g, ''), 10)
  if (isNaN(n) || n === 0) return ''
  return Math.floor(n / 2).toLocaleString('ja-JP') + '円'
}
function calcConInterimDetail(amountStr: string | null | undefined, installments: string | null | undefined): { perAmount: string; count: number } | null {
  if (!amountStr || !installments || installments === '0' || installments === '') return null
  const n = parseInt(amountStr.replace(/[^0-9]/g, ''), 10)
  if (isNaN(n) || n === 0) return null
  const count = parseInt(installments, 10)
  if (isNaN(count) || count === 0) return null
  // 年1回: 確定額÷2、年3回: 確定額÷4、年11回: 確定額÷12
  const divisor = count === 1 ? 2 : count === 3 ? 4 : 12
  return { perAmount: Math.floor(n / divisor).toLocaleString('ja-JP') + '円', count }
}
function fmtAmount(s: string | null | undefined): string {
  if (!s) return ''
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? '' : n.toLocaleString('ja-JP') + '円'
}

// ヘッダー背景色
const H1 = 'bg-[#5c3ea8]'
const H2 = 'bg-[#7b52c4]'
// スティッキー高さ: 1行目 py-2 + 11px font ≈ 32px
const TOP2 = 'top-8'

function MonthlyContent() {
  const searchParams = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, MonthlyProgress>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('月次進捗')
  const [highlightClientId, setHighlightClientId] = useState<string | null>(null)
  const highlightRef = useRef<HTMLTableRowElement | null>(null)
  const [saving, setSaving] = useState(false)

  const [monthModal, setMonthModal] = useState<{ client: Client; month: number } | null>(null)
  const [monthDates, setMonthDates] = useState<Record<string, string>>({})
  const [settleModal, setSettleModal] = useState<Client | null>(null)
  const [settleForm, setSettleForm] = useState<Record<string, string>>({})
  const [taxSchedules, setTaxSchedules] = useState<TaxSchedule[]>([])
  const [scheduleInfo, setScheduleInfo] = useState<{ imported_at: string | null; count: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sheets, setSheets] = useState<{ name: string }[]>([])
  const [selectedSheet, setSelectedSheet] = useState('6月')
  const [filterStaff, setFilterStaff] = useState('')
  const [filterDivision, setFilterDivision] = useState('')
  const [filterFiscalMonth, setFilterFiscalMonth] = useState('')
  const [editingCell, setEditingCell] = useState<{ id: string; field: string; value: string } | null>(null)
  const [filterTaxMonth, setFilterTaxMonth] = useState('')
  const [allUsers, setAllUsers] = useState<{ name: string; division: string | null }[]>([])
  const [filterHasAmount, setFilterHasAmount] = useState(false)

  const SHEET_ID = '1dopOS5hjcHsyk9-mWvTKYGWNQAFuPBaoF0rMjuptMhc'

  // URLパラムでタブ切替・行ハイライト
  useEffect(() => {
    const tab = searchParams.get('tab') as ActiveTab | null
    const highlight = searchParams.get('highlight')
    if (tab && ['月次進捗', '税務情報', '決算業務'].includes(tab)) setActiveTab(tab)
    if (highlight) setHighlightClientId(highlight)
  }, [searchParams])

  // ローディング完了後にスクロール＋モーダル自動オープン
  useEffect(() => {
    if (!loading && highlightClientId) {
      setTimeout(() => {
        if (highlightRef.current) {
          highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        // 決算業務タブでは入力モーダルを自動で開く
        if (activeTab === '決算業務') {
          const c = clients.find(cl => cl.id === highlightClientId)
          if (c) openSettleModal(c)
        }
        // ハイライトを3秒後に消す
        setTimeout(() => setHighlightClientId(null), 3000)
      }, 200)
    }
  }, [loading, highlightClientId])

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: clientsData }, { data: usersData }, progressRes] = await Promise.all([
      supabase.from('clients').select('*').is('contract_end_date', null).eq('show_in_monthly', true).order('code'),
      supabase.from('users').select('name, division').order('name'),
      fetch(`/api/monthly-progress/list?year=${year}`),
    ])
    const progressData: MonthlyProgress[] = progressRes.ok ? await progressRes.json() : []
    setClients(clientsData || [])
    setAllUsers(usersData || [])
    const map: Record<string, MonthlyProgress> = {}
    for (const p of progressData) map[p.client_code] = p
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
      const res = await fetch('/api/tax-schedules/sheets')
      const json = await res.json()
      const parsed: { name: string }[] = json.sheets || []
      if (parsed.length > 0) {
        setSheets(parsed)
        if (!parsed.find(s => s.name === selectedSheet)) setSelectedSheet(parsed[0].name)
      } else {
        setSheets([{ name: '6月' }])
      }
    } catch {
      setSheets([{ name: '6月' }])
    }
  }

  async function importFromSheet() {
    setImporting(true)
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(selectedSheet)}`
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

  async function generateFromSettle() {
    setGenerating(true)
    try {
      const supabase = createClient()
      const prevYear = year - 1
      const { data: prevProgress } = await supabase
        .from('monthly_progress')
        .select('*')
        .eq('year', prevYear)
      if (!prevProgress || prevProgress.length === 0) {
        alert(`${prevYear}年度の決算業務データが見つかりません`)
        return
      }
      // 当年の法人税中間・消費税中間レコードをすべて削除してから再生成
      await supabase.from('tax_schedules').delete().eq('year', year)
        .in('tax_type', ['法人税中間', '消費税中間'])
      const now = new Date().toISOString()
      const toInsert: Omit<TaxSchedule, 'id' | 'contact_date'>[] = []
      for (const p of prevProgress) {
        const clientName = p.client_name || ''
        const clientCode = p.client_code
        // 法人税中間
        if (p.settle_corp_tax_amount) {
          const base = parseInt(p.settle_corp_tax_amount.replace(/[^0-9]/g, ''), 10)
          if (!isNaN(base) && base > 0) {
            const interim = p.settle_next_corp_interim
              ? parseInt(p.settle_next_corp_interim.replace(/[^0-9]/g, ''), 10)
              : Math.floor(base / 2)
            toInsert.push({
              client_id: null, client_name: clientName,
              matched_client_code: clientCode,
              year, month: 0, tax_type: '法人税中間',
              amount: interim.toLocaleString('ja-JP') + '円',
              installment: '年1回',
              deadline: null, payment_method: null,
              send_date: null, payment_date: null,
              confirmation: null, imported_at: now,
            })
          }
        }
        // 消費税中間
        if (p.settle_con_tax_amount && p.settle_con_tax_installments && p.settle_con_tax_installments !== '0') {
          const base = parseInt(p.settle_con_tax_amount.replace(/[^0-9]/g, ''), 10)
          const count = parseInt(p.settle_con_tax_installments, 10)
          if (!isNaN(base) && base > 0 && !isNaN(count) && count > 0) {
            const perAmount = p.settle_next_con_interim
              ? parseInt(p.settle_next_con_interim.replace(/[^0-9]/g, ''), 10)
              : Math.floor(base / (count === 1 ? 2 : count === 3 ? 4 : 12))
            toInsert.push({
              client_id: null, client_name: clientName,
              matched_client_code: clientCode,
              year, month: 0, tax_type: '消費税中間',
              amount: perAmount.toLocaleString('ja-JP') + '円',
              installment: `年${count}回`,
              deadline: null, payment_method: null,
              send_date: null, payment_date: null,
              confirmation: null, imported_at: now,
            })
          }
        }
      }
      if (toInsert.length > 0) {
        await supabase.from('tax_schedules').insert(toInsert)
      }
      await loadTaxSchedules(year)
      alert(`${prevYear}年度の決算業務から ${toInsert.length}件の予定納税データを生成しました`)
    } catch (e) {
      alert('エラー: ' + String(e))
    } finally {
      setGenerating(false)
    }
  }

  function saveCell() {
    if (!editingCell) return
    const { id, field, value } = editingCell
    setEditingCell(null)
    setTaxSchedules(prev => prev.map(s => s.id === id ? { ...s, [field]: value || null } : s))
    fetch('/api/tax-schedules/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, field, value: value || null }),
    })
  }

  function edCell(s: TaxSchedule, field: 'payment_method' | 'send_date' | 'payment_date' | 'contact_date' | 'confirmation', extraClass = '') {
    const isEditing = editingCell?.id === s.id && editingCell?.field === field
    const val = (s[field] as string | null) || ''
    if (isEditing) {
      if (field === 'payment_method') {
        const sid = s.id
        return (
          <select
            autoFocus
            value={editingCell!.value}
            onChange={e => {
              const v = e.target.value
              setEditingCell(null)
              setTaxSchedules(prev => prev.map(ts => ts.id === sid ? { ...ts, payment_method: v || null } : ts))
              fetch('/api/tax-schedules/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: sid, field: 'payment_method', value: v || null }),
              })
            }}
            onBlur={() => setEditingCell(null)}
            onKeyDown={e => { if (e.key === 'Escape') setEditingCell(null) }}
            className="w-full px-1 py-0.5 text-[11px] border border-blue-400 rounded focus:outline-none bg-white"
          >
            <option value="">-</option>
            <option value="ダイレクト納付">ダイレクト納付</option>
            <option value="振替納税">振替納税</option>
            <option value="納付書">納付書</option>
            <option value="予納">予納</option>
            <option value="その他">その他</option>
          </select>
        )
      }
      return (
        <input
          autoFocus
          value={editingCell!.value}
          onChange={e => setEditingCell(c => c ? { ...c, value: e.target.value } : null)}
          onBlur={saveCell}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveCell() } else if (e.key === 'Escape') setEditingCell(null) }}
          className="w-full px-1 py-0.5 text-[11px] border border-blue-400 rounded focus:outline-none"
          style={{ minWidth: '60px' }}
        />
      )
    }
    return (
      <span
        onClick={() => setEditingCell({ id: s.id, field, value: val })}
        className={`block w-full min-h-[1.2em] cursor-pointer ${extraClass}`}
      >
        {val}
      </span>
    )
  }

  function prog(code: string): MonthlyProgress | null { return progressMap[code] || null }

  async function ensureProgress(client: Client): Promise<MonthlyProgress | null> {
    const existing = progressMap[client.code]
    if (existing) return existing
    const res = await fetch('/api/monthly-progress/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: client.id, client_code: client.code, client_name: client.name,
        year, fiscal_month: client.fiscal_month, industry: client.industry,
        consumption_tax: client.consumption_tax, withholding_tax: client.withholding_tax,
        invoice_registered: client.invoice_registered, primary_staff: client.primary_staff,
      }),
    })
    const data = await res.json()
    if (!res.ok) return null
    setProgressMap(prev => ({ ...prev, [client.code]: data }))
    return data
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
    const updates: Record<string, Record<string, string | null>> = {}
    for (const f of MONTHLY_FIELDS) {
      const existing = (p[f.key as keyof MonthlyProgress] as Record<string, string | null>) || {}
      updates[f.key] = { ...existing, [String(month)]: monthDates[f.key] || null }
    }
    const res = await fetch('/api/monthly-progress/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, updates }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`保存エラー: ${err.error || res.status}`)
      setSaving(false)
      return
    }
    setProgressMap(prev => ({ ...prev, [client.code]: { ...p!, ...updates } }))
    setSaving(false)
    setMonthModal(null)
  }

  function openSettleModal(client: Client) {
    const p = prog(client.code)
    const form: Record<string, string> = {}
    for (const f of [...SETTLE_FIELDS, ...SETTLE_TAX_FIELDS]) form[f.key] = (p?.[f.key as keyof MonthlyProgress] as string | null) || ''
    setSettleForm(form)
    setSettleModal(client)
  }

  async function saveSettleModal() {
    if (!settleModal) return
    setSaving(true)
    let p = prog(settleModal.code)
    if (!p) p = await ensureProgress(settleModal)
    if (!p) { setSaving(false); return }
    const updates: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(settleForm)) updates[k] = v || null
    const res = await fetch('/api/monthly-progress/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, updates }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`保存エラー: ${err.error || res.status}`)
      setSaving(false)
      return
    }
    setProgressMap(prev => ({ ...prev, [settleModal.code]: { ...p!, ...updates } }))

    // 2026年7月決算以降は月次進捗の決算業務から予定納税を自動生成
    const progYear = p.year
    const fm = settleModal.fiscal_month
    const isAutoTarget = fm !== null && fm !== 0 &&
      (progYear > 2026 || (progYear === 2026 && fm >= 7))

    if (isAutoTarget) {
      const merged = { ...p, ...updates }
      const corpAmt = merged.settle_corp_tax_amount as string | null
      const conAmt = merged.settle_con_tax_amount as string | null
      const conCount = merged.settle_con_tax_installments as string | null
      const nextCorp = merged.settle_next_corp_interim as string | null
      const nextCon = merged.settle_next_con_interim as string | null

      const rawMonth = fm + 6
      const taxMonth = rawMonth > 12 ? rawMonth - 12 : rawMonth
      const taxYear = rawMonth > 12 ? progYear + 1 : progYear

      type TaxRow = { tax_type: string; amount: string; installment: string }
      const toInsert: TaxRow[] = []

      if (corpAmt) {
        const base = parseInt(corpAmt.replace(/[^0-9]/g, ''), 10)
        if (!isNaN(base) && base > 0) {
          const interim = nextCorp
            ? parseInt(nextCorp.replace(/[^0-9]/g, ''), 10)
            : Math.floor(base / 2)
          toInsert.push({ tax_type: '法人税中間', amount: interim.toLocaleString('ja-JP') + '円', installment: '年1回' })
        }
      }
      if (conAmt && conCount && conCount !== '0') {
        const base = parseInt(conAmt.replace(/[^0-9]/g, ''), 10)
        const count = parseInt(conCount, 10)
        if (!isNaN(base) && base > 0 && !isNaN(count) && count > 0) {
          const perAmount = nextCon
            ? parseInt(nextCon.replace(/[^0-9]/g, ''), 10)
            : Math.floor(base / (count === 1 ? 2 : count === 3 ? 4 : 12))
          toInsert.push({ tax_type: '消費税中間', amount: perAmount.toLocaleString('ja-JP') + '円', installment: `年${count}回` })
        }
      }

      if (toInsert.length > 0) {
        const supabase = createClient()
        await supabase.from('tax_schedules')
          .delete()
          .eq('matched_client_code', p.client_code)
          .eq('year', taxYear)
          .eq('month', taxMonth)
          .in('tax_type', ['法人税中間', '消費税中間'])
        const now = new Date().toISOString()
        await supabase.from('tax_schedules').insert(toInsert.map(t => ({
          client_id: null,
          client_name: p!.client_name,
          matched_client_code: p!.client_code,
          year: taxYear,
          month: taxMonth,
          deadline: `${taxMonth}月末`,
          tax_type: t.tax_type,
          amount: t.amount,
          installment: t.installment,
          payment_method: null,
          send_date: null,
          payment_date: null,
          confirmation: null,
          imported_at: now,
        })))
      }
    }

    setSaving(false)
    setSettleModal(null)
  }

  const divisionOptions = Array.from(new Set(allUsers.map(u => u.division).filter(Boolean))).sort() as string[]
  const staffInDivision = filterDivision ? allUsers.filter(u => u.division === filterDivision).map(u => u.name) : null
  const staffOptions = Array.from(new Set(clients.map(c => c.primary_staff).filter(s => !staffInDivision || staffInDivision.includes(s || '')).filter(Boolean))).sort()
  const filtered = clients.filter(c => {
    if (search && !c.name.includes(search) && !c.code.includes(search)) return false
    if (filterDivision && staffInDivision && !staffInDivision.includes(c.primary_staff || '')) return false
    if (filterStaff && c.primary_staff !== filterStaff) return false
    if (filterFiscalMonth !== '') {
      const fm = filterFiscalMonth === '個人' ? 0 : parseInt(filterFiscalMonth)
      if (c.fiscal_month !== fm) return false
    }
    return true
  })
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
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">月次進捗表</h1>
        <p className="text-xs text-gray-500 leading-relaxed">
          資料収集をした日は必ず入力して下さい。「入力」は入力が終わった日です。「月次完成」は所長チェックが終わりその訂正が終わった日です。「報告」は訪問または資料を郵送した日です。毎月の報酬も入力して下さい。
        </p>
      </div>
      <div className="flex items-center gap-4 mb-5">
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
        {divisionOptions.length > 0 && (
          <select value={filterDivision} onChange={e => { setFilterDivision(e.target.value); setFilterStaff('') }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
            <option value="">所属（全チーム）</option>
            {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select value={filterStaff} onChange={e => setFilterStaff(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
          <option value="">{filterDivision ? `${filterDivision}の全員` : '担当者（全員）'}</option>
          {staffOptions.map(s => <option key={s} value={s!}>{s}</option>)}
        </select>
        <select value={filterFiscalMonth} onChange={e => setFilterFiscalMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700">
          <option value="">決算月（全月）</option>
          <option value="個人">個人</option>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={String(m)}>{m}月</option>)}
        </select>
        {(filterStaff || filterFiscalMonth || filterDivision) && (
          <button onClick={() => { setFilterStaff(''); setFilterFiscalMonth(''); setFilterDivision('') }}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <X size={14} />絞り込み解除
          </button>
        )}
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
                const isHL = c.id === highlightClientId
                return (
                  <tr key={c.id}
                    ref={isHL ? highlightRef : null}
                    className={isHL ? 'bg-orange-100 outline outline-2 outline-orange-400' : even ? 'bg-white' : 'bg-gray-50'}>
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
          {/* 予定納税額サマリー（当年度決算業務から来期を確認） */}
          {(() => {
            const rows = filtered.filter(c => {
              const p = prog(c.code)
              return p?.settle_corp_tax_amount || p?.settle_con_tax_amount || p?.settle_next_corp_interim || p?.settle_next_con_interim
            })
            if (rows.length === 0) return null
            return (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  予定納税額プレビュー — {year}年度決算業務から来期（{year + 1}年）中間を確認
                </h3>
                <div className="bg-white rounded-xl shadow overflow-x-auto">
                  <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
                    <thead>
                      <tr className={`${H1} text-white`}>
                        <th className={`sticky left-0 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-20`}>顧客コード</th>
                        <th className={`sticky left-20 top-0 z-40 ${H1} px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600`}>顧客名</th>
                        <th className={thH1}>法人税<br/>確定額</th>
                        <th className={thH1}>来期法人税<br/>中間（年1回）</th>
                        <th className={`${thH1} border-l border-purple-600`}>消費税<br/>確定額</th>
                        <th className={thH1}>回数</th>
                        <th className={thH1}>来期消費税<br/>中間（1回分）</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((c, ri) => {
                        const p = prog(c.code)
                        const even = ri % 2 === 0
                        const bg = even ? 'bg-white' : 'bg-gray-50'
                        const corpInterim = p?.settle_next_corp_interim ? fmtAmount(p.settle_next_corp_interim) : calcInterim(p?.settle_corp_tax_amount)
                        const conDetail = calcConInterimDetail(p?.settle_con_tax_amount, p?.settle_con_tax_installments)
                        const conInterim = p?.settle_next_con_interim ? fmtAmount(p.settle_next_con_interim) : (conDetail?.perAmount || '')
                        const conCount = p?.settle_con_tax_installments && p.settle_con_tax_installments !== '0'
                          ? `年${p.settle_con_tax_installments}回`
                          : p?.settle_con_tax_installments === '0' ? '不要' : ''
                        return (
                          <tr key={c.id} className={bg}>
                            <td className={stickyCode(even)}>{c.code}</td>
                            <td className={stickyName(even)}>{c.name}</td>
                            <td className={`${td} tabular-nums text-right`}>{fmtAmount(p?.settle_corp_tax_amount)}</td>
                            <td className={`${td} tabular-nums text-right font-semibold text-blue-700`}>
                              {corpInterim}
                              {p?.settle_next_corp_interim && <span className="ml-1 text-gray-400 font-normal text-[10px]">手動</span>}
                            </td>
                            <td className={`${td} tabular-nums text-right border-l border-gray-200`}>{fmtAmount(p?.settle_con_tax_amount)}</td>
                            <td className={`${td} text-center`}>{conCount}</td>
                            <td className={`${td} tabular-nums text-right font-semibold text-blue-700`}>
                              {conInterim}
                              {p?.settle_next_con_interim && <span className="ml-1 text-gray-400 font-normal text-[10px]">手動</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {year <= 2026 ? (
              <>
                <select
                  value={selectedSheet}
                  onChange={e => setSelectedSheet(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-28"
                >
                  {sheets.length === 0
                    ? <option value="6月">（読み込み中...）</option>
                    : sheets.map(s => <option key={s.name} value={s.name}>{s.name}</option>)
                  }
                </select>
                <button onClick={importFromSheet} disabled={importing}
                  className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  <RefreshCw size={13} className={importing ? 'animate-spin' : ''} />
                  {importing ? '読み込み中...' : 'スプレッドシートから読み込む'}
                </button>
              </>
            ) : (
              <button onClick={generateFromSettle} disabled={generating}
                className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
                <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
                {generating ? '生成中...' : `決算業務（${year - 1}年度）から予定を生成`}
              </button>
            )}
            <select value={filterTaxMonth} onChange={e => setFilterTaxMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
              <option value="">月（全て）</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => <option key={m} value={String(m)}>{m}月</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={filterHasAmount} onChange={e => setFilterHasAmount(e.target.checked)}
                className="w-4 h-4 accent-purple-700" />
              納付額あり のみ表示
            </label>
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
                  <th className={thH1}>連絡日</th>
                  <th className={thH1}>確認</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
                ) : filtered.flatMap((c, ci) => {
                  const even = ci % 2 === 0
                  const bg = even ? 'bg-white' : 'bg-gray-50'
                  const entries = taxSchedules.filter(s => s.matched_client_code === c.code && (!filterTaxMonth || s.month === parseInt(filterTaxMonth)))
                  if (entries.length === 0) {
                    if (filterHasAmount) return []
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
                      <td className={`${td} hover:bg-yellow-50`}>{edCell(s, 'payment_method')}</td>
                      <td className={`${td} hover:bg-yellow-50`}>{edCell(s, 'send_date')}</td>
                      <td className={`${td} hover:bg-yellow-50`}>{edCell(s, 'payment_date')}</td>
                      <td className={`${td} hover:bg-yellow-50`}>{edCell(s, 'contact_date')}</td>
                      <td className={`${td} hover:bg-yellow-50`}>{edCell(s, 'confirmation', s.confirmation ? 'text-green-600 font-medium' : '')}</td>
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
                <th className={thH1}>資料収集</th>
                <th className={thH1}>申告書作成</th>
                <th className={thH1}>連絡</th>
                <th className={thH1}>電子申告</th>
                <th className={`${thH1} border-l border-purple-600`}>ダイレクト納付/<br/>納付書</th>
                <th className={thH1}>返却書類</th>
                <th className={`${thH1} border-l border-purple-600`}>役員変更</th>
                <th className={`${thH1} border-l border-purple-600`}>法人税<br/>確定額</th>
                <th className={thH1}>消費税<br/>確定額</th>
                <th className={thH1}>来期<br/>法人税中間</th>
                <th className={thH1}>来期<br/>消費税中間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={14} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
              ) : filtered.map((c, ri) => {
                const p = prog(c.code)
                const even = ri % 2 === 0
                const isHL = c.id === highlightClientId
                return (
                  <tr key={c.id}
                    ref={isHL ? highlightRef : null}
                    onClick={() => openSettleModal(c)}
                    className={`cursor-pointer hover:bg-blue-50 ${isHL ? 'bg-orange-100 outline outline-2 outline-orange-400' : even ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className={stickyCode(even)}>{c.code}</td>
                    <td className={stickyName(even)}>{c.name}</td>
                    <td className={`${td} border-l border-gray-100`}>{p?.settle_consumption_judged || ''}</td>
                    <td className={td}>{fmtDate(p?.settle_materials)}</td>
                    <td className={td}>{fmtDate(p?.settle_return_prepared)}</td>
                    <td className={td}>{fmtDate(p?.settle_contact)}</td>
                    <td className={td}>{fmtDate(p?.settle_filed)}</td>
                    <td className={`${td} border-l border-gray-100 text-left whitespace-pre-line`}>{fmtDate(p?.settle_payment)}</td>
                    <td className={`${td} text-center`}>{p?.settle_return_docs === '1' ? '✓' : ''}</td>
                    <td className={`${td} border-l border-gray-100`}>{p?.director_change || ''}</td>
                    <td className={`${td} border-l border-gray-100 tabular-nums text-right`}>{fmtAmount(p?.settle_corp_tax_amount)}</td>
                    <td className={`${td} tabular-nums text-right`}>{fmtAmount(p?.settle_con_tax_amount)}</td>
                    <td className={`${td} tabular-nums text-right text-blue-700 font-medium`}>
                      {p?.settle_next_corp_interim ? fmtAmount(p.settle_next_corp_interim) : calcInterim(p?.settle_corp_tax_amount)}
                    </td>
                    <td className={`${td} tabular-nums text-right text-blue-700 font-medium`}>
                      {(() => {
                        if (p?.settle_next_con_interim) return <>{fmtAmount(p.settle_next_con_interim)}<span className="text-[10px] text-gray-400 ml-0.5">手動</span></>
                        const det = calcConInterimDetail(p?.settle_con_tax_amount, p?.settle_con_tax_installments)
                        if (!det) return ''
                        return <>{det.perAmount}<span className="text-[10px] text-gray-400 ml-0.5">×{det.count}回</span></>
                      })()}
                    </td>
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
              {SETTLE_FIELDS.map(({ key, label, placeholder, type }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</label>
                  {type === 'checkbox' ? (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settleForm[key] === '1'}
                        onChange={e => setSettleForm(f => ({ ...f, [key]: e.target.checked ? '1' : '' }))}
                        className="w-4 h-4 accent-purple-700 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{settleForm[key] === '1' ? '完了' : '未完了'}</span>
                    </label>
                  ) : type === 'date' ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="date"
                        value={toIso(settleForm[key])}
                        onChange={e => setSettleForm(f => ({ ...f, [key]: e.target.value }))}
                        className={inp}
                      />
                      {settleForm[key] && (
                        <button onClick={() => setSettleForm(f => ({ ...f, [key]: '' }))} className="text-gray-300 hover:text-gray-500 text-xs shrink-0">✕</button>
                      )}
                    </div>
                  ) : (
                    <input value={settleForm[key] || ''} onChange={e => setSettleForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder} className={inp} />
                  )}
                </div>
              ))}
            </div>

            {/* 納税額・予定納税セクション */}
            <div className="mt-5 pt-4 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-3">当期確定税額</p>
              <div className="space-y-3">
                {/* 法人税確定額 */}
                <div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-gray-500 w-36 shrink-0">法人税確定額</label>
                    <input
                      type="text" inputMode="numeric"
                      value={settleForm['settle_corp_tax_amount'] ? parseInt(settleForm['settle_corp_tax_amount'].replace(/[^0-9]/g, '') || '0', 10).toLocaleString('ja-JP') : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setSettleForm(f => ({ ...f, settle_corp_tax_amount: raw }))
                      }}
                      placeholder="例: 1,200,000"
                      className={inp}
                    />
                  </div>
                  {calcInterim(settleForm['settle_corp_tax_amount']) && (
                    <p className="text-xs text-blue-600 mt-1 ml-[156px]">
                      ÷2 → 来期法人税中間 <span className="font-semibold">{calcInterim(settleForm['settle_corp_tax_amount'])}</span>
                    </p>
                  )}
                </div>
                {/* 消費税確定額 + 回数 */}
                <div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-gray-500 w-36 shrink-0">消費税確定額</label>
                    <input
                      type="text" inputMode="numeric"
                      value={settleForm['settle_con_tax_amount'] ? parseInt(settleForm['settle_con_tax_amount'].replace(/[^0-9]/g, '') || '0', 10).toLocaleString('ja-JP') : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setSettleForm(f => ({ ...f, settle_con_tax_amount: raw }))
                      }}
                      placeholder="例: 800,000"
                      className={inp}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <label className="text-xs font-medium text-gray-500 w-36 shrink-0">中間申告回数</label>
                    <select
                      value={settleForm['settle_con_tax_installments'] || ''}
                      onChange={e => setSettleForm(f => ({ ...f, settle_con_tax_installments: e.target.value }))}
                      className={inp}
                    >
                      <option value="">選択してください</option>
                      {CON_INSTALLMENT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const detail = calcConInterimDetail(settleForm['settle_con_tax_amount'], settleForm['settle_con_tax_installments'])
                    if (!detail) return null
                    return (
                      <p className="text-xs text-blue-600 mt-1 ml-[156px]">
                        自動計算 → 来期消費税中間 <span className="font-semibold">{detail.perAmount}</span>
                        <span className="text-gray-500 ml-1">×{detail.count}回 / 年</span>
                      </p>
                    )
                  })()}
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-600 mt-4 mb-2">
                来期予定納税額（手動）
                <span className="ml-1 font-normal text-gray-400">— 自動計算と異なる場合のみ入力</span>
              </p>
              <div className="space-y-3">
                {([
                  { key: 'settle_next_corp_interim', label: '来期法人税中間（手動）' },
                  { key: 'settle_next_con_interim',  label: '来期消費税中間（手動）' },
                ] as const).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</label>
                    <input
                      type="text" inputMode="numeric"
                      value={settleForm[key] ? parseInt(settleForm[key].replace(/[^0-9]/g, '') || '0', 10).toLocaleString('ja-JP') : ''}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9]/g, '')
                        setSettleForm(f => ({ ...f, [key]: raw }))
                      }}
                      placeholder="例: 600,000"
                      className={inp}
                    />
                    {settleForm[key] && (
                      <button onClick={() => setSettleForm(f => ({ ...f, [key]: '' }))} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>
                    )}
                  </div>
                ))}
              </div>
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

export default function MonthlyPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">読み込み中...</div>}>
      <MonthlyContent />
    </Suspense>
  )
}
