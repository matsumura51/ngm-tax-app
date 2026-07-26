'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Client, MonthlyProgress, Schedule } from '@/lib/types'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'

const INDUSTRY_OPTIONS = ['1：卸売業', '2：小売業', '3：製造業', '4：建設業', '5：不動産業', '6：サービス業', '7：飲食業']
const CONSUMPTION_TAX_OPTIONS = ['免税', '本則', '簡易', '2割特例']
const WITHHOLDING_TAX_OPTIONS = ['納特', '毎月', '不要']
const PROGRESS_ROWS = [
  { key: 'monthly_contact', label: '連絡' },
  { key: 'monthly_material', label: '資料' },
  { key: 'monthly_input', label: '入力' },
  { key: 'monthly_completion', label: '完了' },
  { key: 'monthly_report', label: '報告' },
]

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type Tab = '基本情報' | '月次進捗' | 'スケジュール'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [form, setForm] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('基本情報')
  const [progressYear, setProgressYear] = useState(new Date().getFullYear())
  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => { loadClient() }, [id])
  useEffect(() => {
    if (tab === '月次進捗' && client) loadProgress()
  }, [tab, progressYear, client])
  useEffect(() => {
    if (tab === 'スケジュール' && client) loadSchedules()
  }, [tab, client])

  async function loadClient() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').eq('id', id).single()
    if (data) { setClient(data); setForm(data) }
  }

  async function loadProgress() {
    const supabase = createClient()
    const { data } = await supabase
      .from('monthly_progress')
      .select('*')
      .eq('client_code', client!.code)
      .eq('year', progressYear)
      .maybeSingle()
    setProgress(data)
  }

  async function loadSchedules() {
    const supabase = createClient()
    const { data } = await supabase
      .from('schedules')
      .select('*')
      .eq('client_id', id)
      .order('start_datetime')
      .limit(30)
    setSchedules(data || [])
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update(form).eq('id', id)
    if (error) alert('保存エラー: ' + error.message)
    else await loadClient()
    setSaving(false)
  }

  async function updateCell(field: string, month: number, value: string | null) {
    const supabase = createClient()
    if (!progress) {
      const newRec = {
        client_id: client!.id,
        client_code: client!.code,
        client_name: client!.name,
        year: progressYear,
        fiscal_month: client!.fiscal_month,
        industry: client!.industry,
        consumption_tax: client!.consumption_tax,
        withholding_tax: client!.withholding_tax,
        invoice_registered: client!.invoice_registered,
        primary_staff: client!.primary_staff,
        sub_staff: client!.sub_staff,
        manager: client!.manager,
        [field]: { [String(month)]: value },
      }
      const { data } = await supabase.from('monthly_progress').insert(newRec).select().single()
      setProgress(data)
    } else {
      const current = (progress[field as keyof MonthlyProgress] as Record<string, string | null>) || {}
      const updated = { ...current, [String(month)]: value }
      await supabase.from('monthly_progress').update({ [field]: updated }).eq('id', progress.id)
      setProgress({ ...progress, [field]: updated } as MonthlyProgress)
    }
  }

  function set(field: keyof Client, value: string | boolean | number | null) {
    setForm(f => ({ ...f, [field]: value }))
  }

  if (!client) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <div className="text-sm text-gray-500 font-mono">{client.code}</div>
          <h1 className="text-2xl font-bold text-gray-800">{client.name}</h1>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['基本情報', '月次進捗', 'スケジュール'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === '基本情報' && (
        <div className="bg-white rounded-xl shadow p-6 max-w-3xl">
          <div className="grid grid-cols-2 gap-4">
            <Field label="顧客コード">
              <input className={inputClass} value={form.code || ''} onChange={e => set('code', e.target.value)} />
            </Field>
            <Field label="顧客名">
              <input className={inputClass} value={form.name || ''} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label="代表者名">
              <input className={inputClass} value={form.representative || ''} onChange={e => set('representative', e.target.value)} />
            </Field>
            <Field label="電話番号">
              <input className={inputClass} value={form.phone || ''} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="業種">
              <select className={inputClass} value={form.industry || ''} onChange={e => set('industry', e.target.value)}>
                <option value="">選択</option>
                {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="決算月">
              <select className={inputClass} value={form.fiscal_month?.toString() || ''} onChange={e => set('fiscal_month', e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">選択</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}月</option>
                ))}
              </select>
            </Field>
            <Field label="消費税">
              <select className={inputClass} value={form.consumption_tax || ''} onChange={e => set('consumption_tax', e.target.value)}>
                <option value="">選択</option>
                {CONSUMPTION_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="源泉税">
              <select className={inputClass} value={form.withholding_tax || ''} onChange={e => set('withholding_tax', e.target.value)}>
                <option value="">選択</option>
                {WITHHOLDING_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="インボイス登録">
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={form.invoice_registered || false} onChange={e => set('invoice_registered', e.target.checked)} className="w-4 h-4" />
                <span className="text-sm">登録済み</span>
              </label>
            </Field>
            <Field label="主担当">
              <input className={inputClass} value={form.primary_staff || ''} onChange={e => set('primary_staff', e.target.value)} />
            </Field>
            <Field label="副担当">
              <input className={inputClass} value={form.sub_staff || ''} onChange={e => set('sub_staff', e.target.value)} />
            </Field>
            <Field label="所長/責任者">
              <input className={inputClass} value={form.manager || ''} onChange={e => set('manager', e.target.value)} />
            </Field>
            <Field label="メールアドレス" className="col-span-2">
              <input className={inputClass} value={form.email || ''} onChange={e => set('email', e.target.value)} type="email" />
            </Field>
            <Field label="住所" className="col-span-2">
              <input className={inputClass} value={form.address || ''} onChange={e => set('address', e.target.value)} />
            </Field>
            <Field label="備考" className="col-span-2">
              <textarea className={inputClass + ' resize-none'} rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
            </Field>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={save} disabled={saving} className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {tab === '月次進捗' && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setProgressYear(y => y - 1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <span className="font-bold text-lg">{progressYear}年</span>
            <button onClick={() => setProgressYear(y => y + 1)} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left text-sm w-16 sticky left-0 bg-gray-50">項目</th>
                  {Array.from({ length: 12 }, (_, i) => (
                    <th key={i + 1} className="border border-gray-200 px-1 py-2 text-center w-24">{i + 1}月</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROGRESS_ROWS.map(row => (
                  <tr key={row.key}>
                    <td className="border border-gray-200 px-3 py-1.5 font-medium bg-gray-50 whitespace-nowrap sticky left-0 text-sm">{row.label}</td>
                    {Array.from({ length: 12 }, (_, i) => {
                      const month = i + 1
                      const data = progress?.[row.key as keyof MonthlyProgress] as Record<string, string | null> | undefined
                      const date = data?.[String(month)] || ''
                      return (
                        <td key={month} className="border border-gray-200 p-0">
                          <input
                            type="date"
                            value={date}
                            onChange={e => updateCell(row.key, month, e.target.value || null)}
                            className="w-full text-xs px-1 py-1.5 border-none outline-none bg-transparent cursor-pointer text-center"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'スケジュール' && (
        <div className="bg-white rounded-xl shadow overflow-hidden max-w-3xl">
          <div className="flex justify-between items-center p-4 border-b">
            <span className="font-medium text-gray-700">スケジュール一覧</span>
            <Link
              href={`/schedules/new?client_id=${client.id}&client_name=${encodeURIComponent(client.name)}&client_code=${client.code}`}
              className="flex items-center gap-1 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700"
            >
              <Plus size={14} /> 予定を追加
            </Link>
          </div>
          {schedules.length === 0 ? (
            <div className="text-center py-10 text-gray-400">スケジュールはありません</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {schedules.map(s => (
                <li key={s.id}>
                  <Link href={`/schedules/${s.id}`} className="flex items-center px-4 py-3 hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{s.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(s.start_datetime).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                        {' '}
                        {new Date(s.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        {s.user_name && ` · ${s.user_name}`}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
