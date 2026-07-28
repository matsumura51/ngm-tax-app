'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase'
import { Client, MonthlyProgress, Schedule, Director, ClientDocument } from '@/lib/types'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'

const WITHHOLDING_TAX_OPTIONS = ['納特', '毎月', '不要']
const CONTRACT_STATUS_OPTIONS = ['契約中', '契約終了', '見込み', '休止']
const ENTITY_TYPE_OPTIONS = ['法人', '個人']
const YES_NO_OPTIONS = ['有', '無']
const BLUE_WHITE_OPTIONS = ['青色', '白色']
const PROGRESS_ROWS = [
  { key: 'monthly_contact', label: '連絡' },
  { key: 'monthly_material', label: '資料' },
  { key: 'monthly_input', label: '入力' },
  { key: 'monthly_completion', label: '完了' },
  { key: 'monthly_report', label: '報告' },
]

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

type Tab = '基本情報' | '月次進捗' | 'スケジュール'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [form, setForm] = useState<Partial<Client>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<Tab>('基本情報')
  const [progressYear, setProgressYear] = useState(new Date().getFullYear())
  const [progress, setProgress] = useState<MonthlyProgress | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => { loadClient() }, [id])
  useEffect(() => { if (tab === '月次進捗' && client) loadProgress() }, [tab, progressYear, client])
  useEffect(() => { if (tab === 'スケジュール' && client) loadSchedules() }, [tab, client])

  async function loadClient() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('*').eq('id', id).single()
    if (data) {
      setClient(data)
      setForm({ ...data, directors: data.directors || [], documents: data.documents || [] })
    }
  }

  async function loadProgress() {
    const supabase = createClient()
    const { data } = await supabase.from('monthly_progress').select('*').eq('client_code', client!.code).eq('year', progressYear).maybeSingle()
    setProgress(data)
  }

  async function loadSchedules() {
    const supabase = createClient()
    const { data } = await supabase.from('schedules').select('*').eq('client_id', id).order('start_datetime').limit(30)
    setSchedules(data || [])
  }

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('clients').update(form).eq('id', id)
    if (error) alert('保存エラー: ' + error.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); await loadClient() }
    setSaving(false)
  }

  async function updateCell(field: string, month: number, value: string | null) {
    const supabase = createClient()
    if (!progress) {
      const newRec = {
        client_id: client!.id, client_code: client!.code, client_name: client!.name,
        year: progressYear, fiscal_month: client!.fiscal_month, industry: client!.industry,
        consumption_tax: client!.consumption_tax, withholding_tax: client!.withholding_tax,
        invoice_registered: client!.invoice_registered,
        primary_staff: client!.primary_staff, sub_staff: client!.sub_staff, manager: client!.manager,
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

  function set(field: keyof Client, value: string | boolean | number | null | Director[] | ClientDocument[]) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function setDirector(index: number, key: keyof Director, value: string) {
    const dirs = [...(form.directors || [])]
    dirs[index] = { ...dirs[index], [key]: value }
    set('directors', dirs)
  }

  function addDirector() {
    set('directors', [...(form.directors || []), { role: '', name: '' }])
  }

  function removeDirector(index: number) {
    set('directors', (form.directors || []).filter((_, i) => i !== index))
  }

  function setDocument(index: number, key: keyof ClientDocument, value: string) {
    const docs = [...(form.documents || [])]
    docs[index] = { ...docs[index], [key]: value }
    set('documents', docs)
  }

  function addDocument() {
    set('documents', [...(form.documents || []), { date: '', document_name: '' }])
  }

  function removeDocument(index: number) {
    set('documents', (form.documents || []).filter((_, i) => i !== index))
  }

  if (!client) return <div className="p-6 text-gray-400">読み込み中...</div>

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <div className="flex items-center gap-3 flex-1">
          <div>
            <div className="text-sm text-gray-500 font-mono">{client.code}</div>
            <h1 className="text-2xl font-bold text-gray-800">{client.name}</h1>
          </div>
          {client.entity_type && (
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">{client.entity_type}</span>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['基本情報', '月次進捗', 'スケジュール'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === '基本情報' && (
        <div className="max-w-4xl space-y-6">
          {/* 顧客情報 */}
          <Section title="顧客情報">
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={!!form.show_in_monthly}
                  onChange={e => set('show_in_monthly', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm font-medium text-blue-700">月次進捗表に表示する</span>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <F label="顧客コード">
                <input className={ic} value={form.code || ''} onChange={e => set('code', e.target.value)} />
              </F>
              <F label="顧客名" cn="col-span-2">
                <input className={ic} value={form.name || ''} onChange={e => set('name', e.target.value)} />
              </F>
              <F label="法・個区分">
                <select className={ic} value={form.entity_type || ''} onChange={e => set('entity_type', e.target.value)}>
                  <option value="">選択</option>
                  {ENTITY_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>

              <F label="決算月">
                <select className={ic} value={form.fiscal_month?.toString() || ''} onChange={e => set('fiscal_month', e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">選択</option>
                  <option value="0">個人</option>
                  {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
                </select>
              </F>
              <F label="契約ステータス">
                <select className={ic} value={form.contract_status || ''} onChange={e => set('contract_status', e.target.value)}>
                  <option value="">選択</option>
                  {CONTRACT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>

              <F label="契約開始日" cn="col-span-2">
                <input type="date" className={ic} value={form.contract_start_date || ''} onChange={e => set('contract_start_date', e.target.value || null)} />
              </F>
              <F label="契約終了日" cn="col-span-2">
                <input type="date" className={ic} value={form.contract_end_date || ''} onChange={e => set('contract_end_date', e.target.value || null)} />
              </F>

              <F label="源泉税">
                <select className={ic} value={form.withholding_tax || ''} onChange={e => set('withholding_tax', e.target.value)}>
                  <option value="">選択</option>
                  {WITHHOLDING_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="消費税">
                <select className={ic} value={form.consumption_tax || ''} onChange={e => set('consumption_tax', e.target.value)}>
                  <option value="">選択</option>
                  {['免税', '本則', '簡易', '2割特例'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="年調有無">
                <select className={ic} value={form.year_end_adjustment || ''} onChange={e => set('year_end_adjustment', e.target.value)}>
                  <option value="">選択</option>
                  {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="申告の知らせ送付">
                <select className={ic} value={form.notification_send || ''} onChange={e => set('notification_send', e.target.value)}>
                  <option value="">選択</option>
                  {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
            </div>
          </Section>

          {/* 代表者情報 */}
          <Section title="代表者情報">
            <div className="grid grid-cols-4 gap-4">
              <F label="代表者名" cn="col-span-2">
                <input className={ic} value={form.representative || ''} onChange={e => set('representative', e.target.value)} />
              </F>
              <F label="敬称">
                <input className={ic} value={form.honorific || ''} onChange={e => set('honorific', e.target.value)} placeholder="様" />
              </F>
              <F label="役職名">
                <input className={ic} value={form.representative_title || ''} onChange={e => set('representative_title', e.target.value)} placeholder="代表取締役" />
              </F>
              <F label="従業員数">
                <input type="number" className={ic} value={form.employee_count?.toString() || ''} onChange={e => set('employee_count', e.target.value ? parseInt(e.target.value) : null)} />
              </F>
              <F label="インボイス番号" cn="col-span-2">
                <input className={ic} value={form.invoice_number || ''} onChange={e => set('invoice_number', e.target.value)} placeholder="T1234567890123" />
              </F>
              <F label="部署名">
                <input className={ic} value={form.client_department || ''} onChange={e => set('client_department', e.target.value)} />
              </F>
              <F label="顧客担当者名" cn="col-span-2">
                <input className={ic} value={form.client_contact || ''} onChange={e => set('client_contact', e.target.value)} />
              </F>
              <F label="ホームページ" cn="col-span-4">
                <input className={ic} value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://" />
              </F>
            </div>
          </Section>

          {/* 連絡先 */}
          <Section title="連絡先">
            <div className="grid grid-cols-4 gap-4">
              <F label="郵便番号">
                <input className={ic} value={form.postal_code || ''} onChange={e => set('postal_code', e.target.value)} placeholder="000-0000" />
              </F>
              <F label="住所" cn="col-span-3">
                <input className={ic} value={form.address || ''} onChange={e => set('address', e.target.value)} />
              </F>
              <F label="TEL" cn="col-span-2">
                <input className={ic} value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="00-0000-0000" />
              </F>
              <F label="FAX" cn="col-span-2">
                <input className={ic} value={form.fax || ''} onChange={e => set('fax', e.target.value)} placeholder="00-0000-0000" />
              </F>
              <F label="メールアドレス" cn="col-span-4">
                <input type="email" className={ic} value={form.email || ''} onChange={e => set('email', e.target.value)} />
              </F>
            </div>
          </Section>

          {/* 送付先 */}
          <Section title="送付先">
            <div className="grid grid-cols-4 gap-4">
              <F label="送付先郵便番号">
                <input className={ic} value={form.send_postal_code || ''} onChange={e => set('send_postal_code', e.target.value)} placeholder="000-0000" />
              </F>
              <F label="送付先住所" cn="col-span-2">
                <input className={ic} value={form.send_address || ''} onChange={e => set('send_address', e.target.value)} />
              </F>
              <F label="送付先TEL">
                <input className={ic} value={form.send_tel || ''} onChange={e => set('send_tel', e.target.value)} />
              </F>
              <F label="送付先宛先" cn="col-span-4">
                <input className={ic} value={form.send_recipient || ''} onChange={e => set('send_recipient', e.target.value)} placeholder="株式会社〇〇 〇〇 様" />
              </F>
            </div>
          </Section>

          {/* その他 */}
          <Section title="その他">
            <div className="grid grid-cols-4 gap-4">
              <F label="資本金">
                <input type="number" className={ic} value={form.capital?.toString() || ''} onChange={e => set('capital', e.target.value ? parseInt(e.target.value) : null)} placeholder="5000000" />
              </F>
              <F label="管轄税務署名">
                <input className={ic} value={form.tax_office || ''} onChange={e => set('tax_office', e.target.value)} />
              </F>
              <F label="青白区分">
                <select className={ic} value={form.blue_white_type || ''} onChange={e => set('blue_white_type', e.target.value)}>
                  <option value="">選択</option>
                  {BLUE_WHITE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </F>
              <F label="役員変更">
                <input className={ic} value={form.director_changed || ''} onChange={e => set('director_changed', e.target.value)} />
              </F>
              <F label="連絡・注意事項" cn="col-span-4">
                <textarea className={ic + ' resize-none'} rows={3} value={form.contact_notes || ''} onChange={e => set('contact_notes', e.target.value)} />
              </F>
              <F label="備考" cn="col-span-4">
                <textarea className={ic + ' resize-none'} rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
              </F>
            </div>
          </Section>

          {/* 役員構成 */}
          <Section title="役員構成">
            <table className="w-full text-sm mb-3">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium w-1/3">役職</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">氏名</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(form.directors || []).map((d, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input className={ic} value={d.role} onChange={e => setDirector(i, 'role', e.target.value)} placeholder="代表取締役" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={ic} value={d.name} onChange={e => setDirector(i, 'name', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeDirector(i)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addDirector} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> 行を追加
            </button>
          </Section>

          {/* 書類 */}
          <Section title="書類">
            <table className="w-full text-sm mb-3">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium w-40">日付</th>
                  <th className="px-3 py-2 text-left text-xs text-gray-500 font-medium">書類名</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(form.documents || []).map((d, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input type="date" className={ic} value={d.date} onChange={e => setDocument(i, 'date', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input className={ic} value={d.document_name} onChange={e => setDocument(i, 'document_name', e.target.value)} />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removeDocument(i)} className="text-gray-300 hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addDocument} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
              <Plus size={14} /> 行を追加
            </button>
          </Section>

          {/* 担当スタッフ */}
          <Section title="担当スタッフ">
            <div className="grid grid-cols-3 gap-4">
              <F label="主担当">
                <input className={ic} value={form.primary_staff || ''} onChange={e => set('primary_staff', e.target.value)} />
              </F>
              <F label="副担当">
                <input className={ic} value={form.sub_staff || ''} onChange={e => set('sub_staff', e.target.value)} />
              </F>
              <F label="所長/責任者">
                <input className={ic} value={form.manager || ''} onChange={e => set('manager', e.target.value)} />
              </F>
            </div>
          </Section>

          <div className="flex justify-end pb-6">
            <button onClick={save} disabled={saving}
              className="px-8 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
              {saved ? '保存しました ✓' : saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {tab === '月次進捗' && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setProgressYear(y => y - 1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
            <span className="font-bold text-lg">{progressYear}年</span>
            <button onClick={() => setProgressYear(y => y + 1)} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
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
                          <input type="date" value={date} onChange={e => updateCell(row.key, month, e.target.value || null)}
                            className="w-full text-xs px-1 py-1.5 border-none outline-none bg-transparent cursor-pointer text-center" />
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
            <Link href={`/schedules/new?client_id=${client.id}&client_name=${encodeURIComponent(client.name)}&client_code=${client.code}`}
              className="flex items-center gap-1 text-sm bg-purple-600 text-white px-3 py-1.5 rounded-lg hover:bg-purple-700">
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
                        {' '}{new Date(s.start_datetime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function F({ label, children, cn = '' }: { label: string; children: React.ReactNode; cn?: string }) {
  return (
    <div className={cn}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
