'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

const INDUSTRY_OPTIONS = ['1：卸売業', '2：小売業', '3：製造業', '4：建設業', '5：不動産業', '6：サービス業', '7：飲食業']
const CONSUMPTION_TAX_OPTIONS = ['免税', '本則', '簡易', '2割特例']
const WITHHOLDING_TAX_OPTIONS = ['納特', '毎月', '不要']

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ClientNewPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    representative: '',
    phone: '',
    address: '',
    email: '',
    fiscal_month: '',
    industry: '',
    consumption_tax: '',
    withholding_tax: '',
    invoice_registered: false,
    primary_staff: '',
    sub_staff: '',
    manager: '',
    notes: '',
  })

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function save() {
    if (!form.code || !form.name) {
      alert('顧客コードと顧客名は必須です')
      return
    }
    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('clients').insert({
      ...form,
      fiscal_month: form.fiscal_month ? parseInt(form.fiscal_month) : null,
    }).select().single()
    if (error) {
      alert('エラー: ' + error.message)
      setSaving(false)
      return
    }
    router.push(`/clients/${data.id}`)
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">顧客カルテ 新規作成</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="顧客コード *">
            <input className={inputClass} value={form.code} onChange={e => set('code', e.target.value)} placeholder="例：001" />
          </Field>
          <Field label="顧客名 *">
            <input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} placeholder="例：株式会社〇〇" />
          </Field>
          <Field label="代表者名">
            <input className={inputClass} value={form.representative} onChange={e => set('representative', e.target.value)} />
          </Field>
          <Field label="電話番号">
            <input className={inputClass} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="例：03-1234-5678" />
          </Field>
          <Field label="業種">
            <select className={inputClass} value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">選択</option>
              {INDUSTRY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="決算月">
            <select className={inputClass} value={form.fiscal_month} onChange={e => set('fiscal_month', e.target.value)}>
              <option value="">選択</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}月</option>
              ))}
            </select>
          </Field>
          <Field label="消費税">
            <select className={inputClass} value={form.consumption_tax} onChange={e => set('consumption_tax', e.target.value)}>
              <option value="">選択</option>
              {CONSUMPTION_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="源泉税">
            <select className={inputClass} value={form.withholding_tax} onChange={e => set('withholding_tax', e.target.value)}>
              <option value="">選択</option>
              {WITHHOLDING_TAX_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="インボイス登録" className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.invoice_registered} onChange={e => set('invoice_registered', e.target.checked)} className="w-4 h-4" />
              <span className="text-sm">登録済み</span>
            </label>
          </Field>
          <Field label="主担当">
            <input className={inputClass} value={form.primary_staff} onChange={e => set('primary_staff', e.target.value)} />
          </Field>
          <Field label="副担当">
            <input className={inputClass} value={form.sub_staff} onChange={e => set('sub_staff', e.target.value)} />
          </Field>
          <Field label="所長/責任者">
            <input className={inputClass} value={form.manager} onChange={e => set('manager', e.target.value)} />
          </Field>
          <Field label="メールアドレス" className="col-span-2">
            <input className={inputClass} value={form.email} onChange={e => set('email', e.target.value)} type="email" />
          </Field>
          <Field label="住所" className="col-span-2">
            <input className={inputClass} value={form.address} onChange={e => set('address', e.target.value)} />
          </Field>
          <Field label="備考" className="col-span-2">
            <textarea className={inputClass + ' resize-none'} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/clients" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            キャンセル
          </Link>
          <button onClick={save} disabled={saving} className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
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
