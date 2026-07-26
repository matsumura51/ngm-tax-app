'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Director, ClientDocument } from '@/lib/types'

const INDUSTRY_OPTIONS = ['1：卸売業', '2：小売業', '3：製造業', '4：建設業', '5：不動産業', '6：サービス業', '7：飲食業']
const WITHHOLDING_TAX_OPTIONS = ['納特', '毎月', '不要']
const CONTRACT_STATUS_OPTIONS = ['契約中', '契約終了', '見込み', '休止']
const ENTITY_TYPE_OPTIONS = ['法人', '個人']
const YES_NO_OPTIONS = ['有', '無']
const BLUE_WHITE_OPTIONS = ['青色', '白色']

const ic = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const icReq = 'w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-red-50'

const REQUIRED = ['code', 'name', 'entity_type', 'fiscal_month', 'withholding_tax', 'consumption_tax', 'primary_staff', 'contract_status', 'send_postal_code', 'send_address', 'send_tel', 'send_recipient'] as const

type FormState = {
  code: string; name: string; entity_type: string
  fiscal_month: string; contract_status: string; industry: string
  contract_start_date: string; contract_end_date: string
  withholding_tax: string; consumption_tax: string
  year_end_adjustment: string; notification_send: string
  representative: string; honorific: string; representative_title: string
  employee_count: string; invoice_number: string
  client_department: string; client_contact: string; website: string
  email: string; postal_code: string; address: string; phone: string; fax: string
  send_postal_code: string; send_address: string; send_tel: string; send_recipient: string
  contact_notes: string; capital: string; tax_office: string
  blue_white_type: string; chatwork_id: string; director_changed: string; exclude_productivity: string
  primary_staff: string; sub_staff: string; manager: string; notes: string
}

const INIT: FormState = {
  code: '', name: '', entity_type: '', fiscal_month: '', contract_status: '', industry: '',
  contract_start_date: '', contract_end_date: '', withholding_tax: '', consumption_tax: '',
  year_end_adjustment: '', notification_send: '', representative: '', honorific: '',
  representative_title: '', employee_count: '', invoice_number: '', client_department: '',
  client_contact: '', website: '', email: '', postal_code: '', address: '', phone: '', fax: '',
  send_postal_code: '', send_address: '', send_tel: '', send_recipient: '', contact_notes: '',
  capital: '', tax_office: '', blue_white_type: '', chatwork_id: '', director_changed: '',
  exclude_productivity: '', primary_staff: '', sub_staff: '', manager: '', notes: '',
}

export default function ClientNewPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [form, setForm] = useState<FormState>(INIT)
  const [directors, setDirectors] = useState<Director[]>([])
  const [documents, setDocuments] = useState<ClientDocument[]>([])

  function set(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }))
  }

  function validate() {
    const newErrors: Partial<Record<keyof FormState, string>> = {}
    const labels: Record<string, string> = {
      code: '顧客コード', name: '顧客名', entity_type: '法・個区分',
      fiscal_month: '決算月', withholding_tax: '源泉税', consumption_tax: '消費税',
      primary_staff: '主担当', contract_status: '契約ステータス',
      send_postal_code: '送付先郵便番号', send_address: '送付先住所',
      send_tel: '送付先TEL', send_recipient: '送付先宛先',
    }
    for (const field of REQUIRED) {
      if (!form[field]) newErrors[field] = `${labels[field]}は必須です`
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function setDirector(index: number, key: keyof Director, value: string) {
    const dirs = [...directors]
    dirs[index] = { ...dirs[index], [key]: value }
    setDirectors(dirs)
  }

  function setDocument(index: number, key: keyof ClientDocument, value: string) {
    const docs = [...documents]
    docs[index] = { ...docs[index], [key]: value }
    setDocuments(docs)
  }

  async function save() {
    if (!validate()) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('clients').insert({
      ...form,
      fiscal_month: form.fiscal_month ? parseInt(form.fiscal_month) : null,
      employee_count: form.employee_count ? parseInt(form.employee_count) : null,
      capital: form.capital ? parseInt(form.capital) : null,
      contract_start_date: form.contract_start_date || null,
      contract_end_date: form.contract_end_date || null,
      directors,
      documents,
    }).select().single()
    if (error) {
      alert('エラー: ' + error.message)
      setSaving(false)
      return
    }
    router.push(`/clients/${data.id}`)
  }

  const hasErrors = Object.keys(errors).length > 0

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-gray-800">顧客カルテ 新規作成</h1>
      </div>

      {hasErrors && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          必須項目が入力されていません。赤枠の項目を入力してください。
        </div>
      )}

      <div className="space-y-5">
        {/* 顧客情報 */}
        <Section title="顧客情報">
          <div className="grid grid-cols-4 gap-4">
            <F label="顧客コード" required>
              <input className={errors.code ? icReq : ic} value={form.code} onChange={e => set('code', e.target.value)} placeholder="例：02206" />
              {errors.code && <p className="text-xs text-red-500 mt-0.5">{errors.code}</p>}
            </F>
            <F label="顧客名" required cn="col-span-2">
              <input className={errors.name ? icReq : ic} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例：株式会社〇〇" />
              {errors.name && <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>}
            </F>
            <F label="法・個区分" required>
              <select className={errors.entity_type ? icReq : ic} value={form.entity_type} onChange={e => set('entity_type', e.target.value)}>
                <option value="">選択</option>
                {ENTITY_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.entity_type && <p className="text-xs text-red-500 mt-0.5">{errors.entity_type}</p>}
            </F>

            <F label="決算月" required>
              <select className={errors.fiscal_month ? icReq : ic} value={form.fiscal_month} onChange={e => set('fiscal_month', e.target.value)}>
                <option value="">選択</option>
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
              </select>
              {errors.fiscal_month && <p className="text-xs text-red-500 mt-0.5">{errors.fiscal_month}</p>}
            </F>
            <F label="契約ステータス" required>
              <select className={errors.contract_status ? icReq : ic} value={form.contract_status} onChange={e => set('contract_status', e.target.value)}>
                <option value="">選択</option>
                {CONTRACT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.contract_status && <p className="text-xs text-red-500 mt-0.5">{errors.contract_status}</p>}
            </F>
            <F label="業種" cn="col-span-2">
              <select className={ic} value={form.industry} onChange={e => set('industry', e.target.value)}>
                <option value="">選択</option>
                {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </F>

            <F label="契約開始日" cn="col-span-2">
              <input type="date" className={ic} value={form.contract_start_date} onChange={e => set('contract_start_date', e.target.value)} />
            </F>
            <F label="契約終了日" cn="col-span-2">
              <input type="date" className={ic} value={form.contract_end_date} onChange={e => set('contract_end_date', e.target.value)} />
            </F>

            <F label="源泉税" required>
              <select className={errors.withholding_tax ? icReq : ic} value={form.withholding_tax} onChange={e => set('withholding_tax', e.target.value)}>
                <option value="">選択</option>
                {WITHHOLDING_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.withholding_tax && <p className="text-xs text-red-500 mt-0.5">{errors.withholding_tax}</p>}
            </F>
            <F label="消費税" required>
              <select className={errors.consumption_tax ? icReq : ic} value={form.consumption_tax} onChange={e => set('consumption_tax', e.target.value)}>
                <option value="">選択</option>
                {['免税', '本則', '簡易', '2割特例'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {errors.consumption_tax && <p className="text-xs text-red-500 mt-0.5">{errors.consumption_tax}</p>}
            </F>
            <F label="年調有無">
              <select className={ic} value={form.year_end_adjustment} onChange={e => set('year_end_adjustment', e.target.value)}>
                <option value="">選択</option>
                {YES_NO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </F>
            <F label="申告の知らせ送付">
              <select className={ic} value={form.notification_send} onChange={e => set('notification_send', e.target.value)}>
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
              <input className={ic} value={form.representative} onChange={e => set('representative', e.target.value)} />
            </F>
            <F label="敬称">
              <input className={ic} value={form.honorific} onChange={e => set('honorific', e.target.value)} placeholder="様" />
            </F>
            <F label="役職名">
              <input className={ic} value={form.representative_title} onChange={e => set('representative_title', e.target.value)} placeholder="代表取締役" />
            </F>
            <F label="従業員数">
              <input type="number" className={ic} value={form.employee_count} onChange={e => set('employee_count', e.target.value)} />
            </F>
            <F label="インボイス番号" cn="col-span-2">
              <input className={ic} value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="T1234567890123" />
            </F>
            <F label="部署名">
              <input className={ic} value={form.client_department} onChange={e => set('client_department', e.target.value)} />
            </F>
            <F label="顧客担当者名" cn="col-span-2">
              <input className={ic} value={form.client_contact} onChange={e => set('client_contact', e.target.value)} />
            </F>
            <F label="ホームページ" cn="col-span-4">
              <input className={ic} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://" />
            </F>
          </div>
        </Section>

        {/* 連絡先 */}
        <Section title="連絡先">
          <div className="grid grid-cols-4 gap-4">
            <F label="郵便番号">
              <input className={ic} value={form.postal_code} onChange={e => set('postal_code', e.target.value)} placeholder="000-0000" />
            </F>
            <F label="住所" cn="col-span-3">
              <input className={ic} value={form.address} onChange={e => set('address', e.target.value)} />
            </F>
            <F label="TEL" cn="col-span-2">
              <input className={ic} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="00-0000-0000" />
            </F>
            <F label="FAX" cn="col-span-2">
              <input className={ic} value={form.fax} onChange={e => set('fax', e.target.value)} placeholder="00-0000-0000" />
            </F>
            <F label="メールアドレス" cn="col-span-4">
              <input type="email" className={ic} value={form.email} onChange={e => set('email', e.target.value)} />
            </F>
          </div>
        </Section>

        {/* 送付先 */}
        <Section title="送付先">
          <div className="grid grid-cols-4 gap-4">
            <F label="送付先郵便番号" required>
              <input className={errors.send_postal_code ? icReq : ic} value={form.send_postal_code} onChange={e => set('send_postal_code', e.target.value)} placeholder="000-0000" />
              {errors.send_postal_code && <p className="text-xs text-red-500 mt-0.5">{errors.send_postal_code}</p>}
            </F>
            <F label="送付先住所" required cn="col-span-2">
              <input className={errors.send_address ? icReq : ic} value={form.send_address} onChange={e => set('send_address', e.target.value)} />
              {errors.send_address && <p className="text-xs text-red-500 mt-0.5">{errors.send_address}</p>}
            </F>
            <F label="送付先TEL" required>
              <input className={errors.send_tel ? icReq : ic} value={form.send_tel} onChange={e => set('send_tel', e.target.value)} />
              {errors.send_tel && <p className="text-xs text-red-500 mt-0.5">{errors.send_tel}</p>}
            </F>
            <F label="送付先宛先" required cn="col-span-4">
              <input className={errors.send_recipient ? icReq : ic} value={form.send_recipient} onChange={e => set('send_recipient', e.target.value)} placeholder="株式会社〇〇 〇〇 様" />
              {errors.send_recipient && <p className="text-xs text-red-500 mt-0.5">{errors.send_recipient}</p>}
            </F>
          </div>
        </Section>

        {/* その他 */}
        <Section title="その他">
          <div className="grid grid-cols-4 gap-4">
            <F label="資本金">
              <input type="number" className={ic} value={form.capital} onChange={e => set('capital', e.target.value)} placeholder="5000000" />
            </F>
            <F label="管轄税務署名">
              <input className={ic} value={form.tax_office} onChange={e => set('tax_office', e.target.value)} />
            </F>
            <F label="青白区分">
              <select className={ic} value={form.blue_white_type} onChange={e => set('blue_white_type', e.target.value)}>
                <option value="">選択</option>
                {BLUE_WHITE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </F>
            <F label="ChatWork連携">
              <input className={ic} value={form.chatwork_id} onChange={e => set('chatwork_id', e.target.value)} />
            </F>
            <F label="役員変更" cn="col-span-2">
              <input className={ic} value={form.director_changed} onChange={e => set('director_changed', e.target.value)} />
            </F>
            <F label="生産性分析除外" cn="col-span-2">
              <select className={ic} value={form.exclude_productivity} onChange={e => set('exclude_productivity', e.target.value)}>
                <option value="">選択</option>
                <option value="生産性分析から除外しない">生産性分析から除外しない</option>
                <option value="生産性分析から除外する">生産性分析から除外する</option>
              </select>
            </F>
            <F label="連絡・注意事項" cn="col-span-4">
              <textarea className={ic + ' resize-none'} rows={3} value={form.contact_notes} onChange={e => set('contact_notes', e.target.value)} />
            </F>
            <F label="備考" cn="col-span-4">
              <textarea className={ic + ' resize-none'} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
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
              {directors.map((d, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">
                    <input className={ic} value={d.role} onChange={e => setDirector(i, 'role', e.target.value)} placeholder="代表取締役" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={ic} value={d.name} onChange={e => setDirector(i, 'name', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => setDirectors(directors.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setDirectors([...directors, { role: '', name: '' }])} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
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
              {documents.map((d, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">
                    <input type="date" className={ic} value={d.date} onChange={e => setDocument(i, 'date', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={ic} value={d.document_name} onChange={e => setDocument(i, 'document_name', e.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => setDocuments(documents.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setDocuments([...documents, { date: '', document_name: '' }])} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
            <Plus size={14} /> 行を追加
          </button>
        </Section>

        {/* 担当スタッフ */}
        <Section title="担当スタッフ">
          <div className="grid grid-cols-3 gap-4">
            <F label="主担当" required>
              <input className={errors.primary_staff ? icReq : ic} value={form.primary_staff} onChange={e => set('primary_staff', e.target.value)} />
              {errors.primary_staff && <p className="text-xs text-red-500 mt-0.5">{errors.primary_staff}</p>}
            </F>
            <F label="副担当">
              <input className={ic} value={form.sub_staff} onChange={e => set('sub_staff', e.target.value)} />
            </F>
            <F label="所長/責任者">
              <input className={ic} value={form.manager} onChange={e => set('manager', e.target.value)} />
            </F>
          </div>
        </Section>
      </div>

      <div className="mt-6 flex justify-end gap-3 pb-10">
        <Link href="/clients" className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </Link>
        <button onClick={save} disabled={saving} className="px-8 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
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

function F({ label, children, cn = '', required = false }: { label: string; children: React.ReactNode; cn?: string; required?: boolean }) {
  return (
    <div className={cn}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
