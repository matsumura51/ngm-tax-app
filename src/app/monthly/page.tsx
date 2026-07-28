'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MonthlyProgress, Client } from '@/lib/types'
import { Search, X } from 'lucide-react'

const MONTHS = ['1','2','3','4','5','6','7','8','9','10','11','12']
const MONTHLY_FIELDS = [
  { key: 'monthly_contact',    label: '連絡' },
  { key: 'monthly_material',   label: '資料収集' },
  { key: 'monthly_input',      label: '入力' },
  { key: 'monthly_completion', label: '月次完成' },
  { key: 'monthly_report',     label: '報告' },
]
const CON_TAX_OPTIONS = ['本則', '簡易', '免税', '2割特例']
const EXISTS_OPTIONS = ['', '有り', '無し']

type ActiveTab = '月次進捗' | '税務情報' | '決算業務'

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  const m = s.match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (m) return `${parseInt(m[1])}/${parseInt(m[2])}`
  return s
}

const inp = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const sel = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

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

export default function MonthlyPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, MonthlyProgress>>({})
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('月次進捗')
  const [saving, setSaving] = useState(false)

  // Monthly modal
  const [monthModal, setMonthModal] = useState<{ client: Client; month: number } | null>(null)
  const [monthDates, setMonthDates] = useState<Record<string, string>>({})

  // Tax modal
  const [taxModal, setTaxModal] = useState<Client | null>(null)
  const [taxForm, setTaxForm] = useState<Record<string, string>>({})

  // Settlement modal
  const [settleModal, setSettleModal] = useState<Client | null>(null)
  const [settleForm, setSettleForm] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [year])

  async function load() {
    setLoading(true)
    const supabase = createClient()
    const [{ data: clientsData }, { data: progressData }] = await Promise.all([
      supabase.from('clients').select('*').is('contract_end_date', null).order('code'),
      supabase.from('monthly_progress').select('*').eq('year', year),
    ])
    setClients(clientsData || [])
    const map: Record<string, MonthlyProgress> = {}
    for (const p of (progressData || [])) map[p.client_code] = p
    setProgressMap(map)
    setLoading(false)
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

  // --- Monthly modal ---
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

  // --- Tax modal ---
  function openTaxModal(client: Client) {
    const p = prog(client.code)
    setTaxForm({
      prev_consumption_tax:    p?.prev_consumption_tax    || client.consumption_tax || '',
      consumption_tax:         p?.consumption_tax         || client.consumption_tax || '',
      prev_corp_interim_exists: p?.prev_corp_interim_exists || '',
      prev_corp_interim_date:  p?.prev_corp_interim_date  || '',
      corp_interim_exists:     p?.corp_interim_exists     || '',
      corp_interim_date:       p?.corp_interim_date       || '',
      prev_con_interim_exists: p?.prev_con_interim_exists || '',
      prev_con_interim_1:      p?.prev_con_interim_1      || '',
      prev_con_interim_2:      p?.prev_con_interim_2      || '',
      prev_con_interim_3:      p?.prev_con_interim_3      || '',
      con_interim_exists:      p?.con_interim_exists      || '',
      con_interim_1:           p?.con_interim_1           || '',
      con_interim_2:           p?.con_interim_2           || '',
      con_interim_3:           p?.con_interim_3           || '',
    })
    setTaxModal(client)
  }

  async function saveTaxModal() {
    if (!taxModal) return
    setSaving(true)
    let p = prog(taxModal.code)
    if (!p) p = await ensureProgress(taxModal)
    if (!p) { setSaving(false); return }
    const supabase = createClient()
    const updates: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(taxForm)) updates[k] = v || null
    await supabase.from('monthly_progress').update(updates).eq('id', p.id)
    setProgressMap(prev => ({ ...prev, [taxModal.code]: { ...p!, ...updates } }))
    setSaving(false)
    setTaxModal(null)
  }

  // --- Settlement modal ---
  function openSettleModal(client: Client) {
    const p = prog(client.code)
    const form: Record<string, string> = {}
    for (const f of SETTLE_FIELDS) {
      form[f.key] = (p?.[f.key as keyof MonthlyProgress] as string | null) || ''
    }
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
  const prevYear = year - 1

  function getMonthVal(code: string, field: string, month: string): string {
    const p = prog(code)
    if (!p) return ''
    const obj = p[field as keyof MonthlyProgress] as Record<string, string | null> | undefined
    return fmtDate(obj?.[month])
  }

  const thBase = 'px-2 py-2 text-center whitespace-nowrap font-medium'
  const tdBase = 'px-2 py-2 text-center text-gray-700 text-xs'
  const stickyCode = (even: boolean) => `sticky left-0 z-10 px-3 py-2 font-mono text-xs text-gray-600 whitespace-nowrap border-r border-gray-200 ${even ? 'bg-white' : 'bg-gray-50'}`
  const stickyName = (even: boolean) => `sticky left-20 z-10 px-3 py-2 font-medium text-xs text-gray-800 whitespace-nowrap border-r border-gray-200 max-w-[180px] truncate ${even ? 'bg-white' : 'bg-gray-50'}`

  return (
    <div className="p-6">
      {/* Header */}
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

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 gap-1">
        {(['月次進捗', '税務情報', '決算業務'] as ActiveTab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ===== 月次進捗 Tab ===== */}
      {activeTab === '月次進捗' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr className="bg-[#5c3ea8] text-white">
                <th className="sticky left-0 z-20 bg-[#5c3ea8] px-3 py-2 text-left whitespace-nowrap w-20" rowSpan={2}>顧客コード</th>
                <th className="sticky left-20 z-20 bg-[#5c3ea8] px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600" rowSpan={2}>顧客名</th>
                {MONTHS.map(m => (
                  <th key={m} colSpan={5}
                    className={`${thBase} border-l border-purple-600 ${String(currentMonth) === m ? 'bg-[#8b2252]' : ''}`}>
                    {m}月分
                  </th>
                ))}
              </tr>
              <tr className="bg-[#7b52c4] text-white">
                {MONTHS.map(m => (
                  MONTHLY_FIELDS.map(f => (
                    <th key={`${m}-${f.key}`}
                      className={`px-1 py-1.5 text-center whitespace-nowrap font-normal border-l border-purple-500 min-w-[3rem] ${
                        String(currentMonth) === m ? 'bg-[#a03268]' : ''
                      }`}>
                      {f.label}
                    </th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={62} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
              ) : filtered.map((c, ri) => (
                <tr key={c.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className={stickyCode(ri % 2 === 0)}>{c.code}</td>
                  <td className={stickyName(ri % 2 === 0)}>{c.name}</td>
                  {MONTHS.map(m => (
                    MONTHLY_FIELDS.map((f, fi) => {
                      const val = getMonthVal(c.code, f.key, m)
                      const isCur = String(currentMonth) === m
                      return (
                        <td key={`${m}-${f.key}`}
                          onClick={() => openMonthModal(c, parseInt(m))}
                          className={`px-1 py-2 text-center cursor-pointer hover:bg-blue-50 transition text-gray-700 ${
                            fi === 0 ? 'border-l border-gray-200' : ''
                          } ${isCur ? 'bg-pink-50' : ''}`}>
                          {val}
                        </td>
                      )
                    })
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 税務情報 Tab ===== */}
      {activeTab === '税務情報' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr className="bg-[#5c3ea8] text-white">
                <th className="sticky left-0 z-20 bg-[#5c3ea8] px-3 py-2 text-left whitespace-nowrap w-20">顧客コード</th>
                <th className="sticky left-20 z-20 bg-[#5c3ea8] px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600">顧客名</th>
                <th className={thBase}>決算月</th>
                <th className={thBase}>業種</th>
                <th className={`${thBase} border-l border-purple-600`}>{prevYear}<br/>消費税</th>
                <th className={thBase}>{year}<br/>消費税</th>
                <th className={`${thBase} border-l border-purple-600`}>{prevYear}期<br/>法人税中間有無</th>
                <th className={thBase}>{prevYear}期<br/>法人税中間</th>
                <th className={thBase}>{year}期<br/>法人税中間有無</th>
                <th className={thBase}>{year}期<br/>法人税中間</th>
                <th className={`${thBase} border-l border-purple-600`}>{prevYear}期<br/>消費税中間有無</th>
                <th className={thBase}>{prevYear}期<br/>消費税中間①</th>
                <th className={thBase}>{prevYear}期<br/>消費税中間②</th>
                <th className={thBase}>{prevYear}期<br/>消費税中間③</th>
                <th className={`${thBase} border-l border-purple-600`}>{year}期<br/>消費税中間有無</th>
                <th className={thBase}>{year}期<br/>消費税中間①</th>
                <th className={thBase}>{year}期<br/>消費税中間②</th>
                <th className={thBase}>{year}期<br/>消費税中間③</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={18} className="text-center py-8 text-gray-400">読み込み中...</td></tr>
              ) : filtered.map((c, ri) => {
                const p = prog(c.code)
                const even = ri % 2 === 0
                return (
                  <tr key={c.id} onClick={() => openTaxModal(c)}
                    className={`cursor-pointer hover:bg-blue-50 ${even ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className={stickyCode(even)}>{c.code}</td>
                    <td className={stickyName(even)}>{c.name}</td>
                    <td className={tdBase}>{c.fiscal_month === 0 ? '個人' : c.fiscal_month ? `${c.fiscal_month}月` : '-'}</td>
                    <td className={tdBase}>{c.industry || '-'}</td>
                    <td className={`${tdBase} border-l border-gray-100`}>{p?.prev_consumption_tax || c.consumption_tax || ''}</td>
                    <td className={tdBase}>{p?.consumption_tax || c.consumption_tax || ''}</td>
                    <td className={`${tdBase} border-l border-gray-100`}>{p?.prev_corp_interim_exists || ''}</td>
                    <td className={tdBase}>{p?.prev_corp_interim_date || ''}</td>
                    <td className={tdBase}>{p?.corp_interim_exists || ''}</td>
                    <td className={tdBase}>{p?.corp_interim_date || ''}</td>
                    <td className={`${tdBase} border-l border-gray-100`}>{p?.prev_con_interim_exists || ''}</td>
                    <td className={tdBase}>{p?.prev_con_interim_1 || ''}</td>
                    <td className={tdBase}>{p?.prev_con_interim_2 || ''}</td>
                    <td className={tdBase}>{p?.prev_con_interim_3 || ''}</td>
                    <td className={`${tdBase} border-l border-gray-100`}>{p?.con_interim_exists || ''}</td>
                    <td className={tdBase}>{p?.con_interim_1 || ''}</td>
                    <td className={tdBase}>{p?.con_interim_2 || ''}</td>
                    <td className={tdBase}>{p?.con_interim_3 || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 決算業務 Tab ===== */}
      {activeTab === '決算業務' && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="min-w-full border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr className="bg-[#5c3ea8] text-white">
                <th className="sticky left-0 z-20 bg-[#5c3ea8] px-3 py-2 text-left whitespace-nowrap w-20">顧客コード</th>
                <th className="sticky left-20 z-20 bg-[#5c3ea8] px-3 py-2 text-left whitespace-nowrap w-44 border-r border-purple-600">顧客名</th>
                <th className={`${thBase} border-l border-purple-600`}>消費税判定</th>
                <th className={thBase}>決算期<br/>お知らせ</th>
                <th className={thBase}>資料収集</th>
                <th className={thBase}>申告書作成</th>
                <th className={thBase}>連絡</th>
                <th className={thBase}>電子申告</th>
                <th className={`${thBase} border-l border-purple-600`}>ダイレクト納付/<br/>納付書</th>
                <th className={thBase}>総勘定元帳</th>
                <th className={thBase}>決算報告書</th>
                <th className={thBase}>消費税申告</th>
                <th className={thBase}>請求書</th>
                <th className={`${thBase} border-l border-purple-600`}>役員変更</th>
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
                    <td className={`${tdBase} border-l border-gray-100`}>{p?.settle_consumption_judged || ''}</td>
                    <td className={tdBase}>{p?.settle_notice || ''}</td>
                    <td className={tdBase}>{p?.settle_materials || ''}</td>
                    <td className={tdBase}>{p?.settle_return_prepared || ''}</td>
                    <td className={tdBase}>{p?.settle_contact || ''}</td>
                    <td className={tdBase}>{p?.settle_filed || ''}</td>
                    <td className={`${tdBase} border-l border-gray-100 whitespace-pre-line text-left`}>{p?.settle_payment || ''}</td>
                    <td className={`${tdBase} whitespace-pre-line text-left`}>{p?.ledger_status || ''}</td>
                    <td className={`${tdBase} whitespace-pre-line text-left`}>{p?.report_status || ''}</td>
                    <td className={tdBase}>{p?.consumption_tax_filed || ''}</td>
                    <td className={tdBase}>{p?.invoice_status || ''}</td>
                    <td className={`${tdBase} border-l border-gray-100`}>{p?.director_change || ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Monthly Modal ===== */}
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
                  <input type="date" value={monthDates[f.key] || ''}
                    onChange={e => setMonthDates(d => ({ ...d, [f.key]: e.target.value }))}
                    className={inp} />
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

      {/* ===== Tax Modal ===== */}
      {taxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setTaxModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-[520px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <div>
                <div className="font-bold text-gray-800">{taxModal.name}</div>
                <div className="text-sm text-gray-500">{year}年度 税務情報</div>
              </div>
              <button onClick={() => setTaxModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="space-y-5">
              {/* 消費税 */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b pb-1">消費税</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}消費税</label>
                    <select value={taxForm.prev_consumption_tax || ''} onChange={e => setTaxForm(f => ({ ...f, prev_consumption_tax: e.target.value }))} className={sel}>
                      <option value="">-</option>
                      {CON_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}消費税</label>
                    <select value={taxForm.consumption_tax || ''} onChange={e => setTaxForm(f => ({ ...f, consumption_tax: e.target.value }))} className={sel}>
                      <option value="">-</option>
                      {CON_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {/* 法人税中間 */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b pb-1">法人税中間</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}期 有無</label>
                    <select value={taxForm.prev_corp_interim_exists || ''} onChange={e => setTaxForm(f => ({ ...f, prev_corp_interim_exists: e.target.value }))} className={sel}>
                      {EXISTS_OPTIONS.map(o => <option key={o} value={o}>{o || '-'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}期 期日</label>
                    <input value={taxForm.prev_corp_interim_date || ''} onChange={e => setTaxForm(f => ({ ...f, prev_corp_interim_date: e.target.value }))} placeholder="例: 2025/09" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}期 有無</label>
                    <select value={taxForm.corp_interim_exists || ''} onChange={e => setTaxForm(f => ({ ...f, corp_interim_exists: e.target.value }))} className={sel}>
                      {EXISTS_OPTIONS.map(o => <option key={o} value={o}>{o || '-'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}期 期日</label>
                    <input value={taxForm.corp_interim_date || ''} onChange={e => setTaxForm(f => ({ ...f, corp_interim_date: e.target.value }))} placeholder="例: 2026/09" className={inp} />
                  </div>
                </div>
              </div>
              {/* 消費税中間 */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b pb-1">消費税中間</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}期 有無</label>
                    <select value={taxForm.prev_con_interim_exists || ''} onChange={e => setTaxForm(f => ({ ...f, prev_con_interim_exists: e.target.value }))} className={sel}>
                      {EXISTS_OPTIONS.map(o => <option key={o} value={o}>{o || '-'}</option>)}
                    </select>
                  </div>
                  <div />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}期 ①</label>
                    <input value={taxForm.prev_con_interim_1 || ''} onChange={e => setTaxForm(f => ({ ...f, prev_con_interim_1: e.target.value }))} placeholder="例: 2025/9" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}期 ②</label>
                    <input value={taxForm.prev_con_interim_2 || ''} onChange={e => setTaxForm(f => ({ ...f, prev_con_interim_2: e.target.value }))} placeholder="例: 2025/12" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{prevYear}期 ③</label>
                    <input value={taxForm.prev_con_interim_3 || ''} onChange={e => setTaxForm(f => ({ ...f, prev_con_interim_3: e.target.value }))} placeholder="例: 2026/3" className={inp} />
                  </div>
                  <div />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}期 有無</label>
                    <select value={taxForm.con_interim_exists || ''} onChange={e => setTaxForm(f => ({ ...f, con_interim_exists: e.target.value }))} className={sel}>
                      {EXISTS_OPTIONS.map(o => <option key={o} value={o}>{o || '-'}</option>)}
                    </select>
                  </div>
                  <div />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}期 ①</label>
                    <input value={taxForm.con_interim_1 || ''} onChange={e => setTaxForm(f => ({ ...f, con_interim_1: e.target.value }))} placeholder="例: 2026/9" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}期 ②</label>
                    <input value={taxForm.con_interim_2 || ''} onChange={e => setTaxForm(f => ({ ...f, con_interim_2: e.target.value }))} placeholder="例: 2026/12" className={inp} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{year}期 ③</label>
                    <input value={taxForm.con_interim_3 || ''} onChange={e => setTaxForm(f => ({ ...f, con_interim_3: e.target.value }))} placeholder="例: 2027/3" className={inp} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setTaxModal(null)} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">キャンセル</button>
              <button onClick={saveTaxModal} disabled={saving} className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Settlement Modal ===== */}
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
