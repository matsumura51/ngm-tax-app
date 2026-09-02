'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import TaxReturnTab from './TaxReturnTab'
import { RefreshCw } from 'lucide-react'

export default function TaxReturnPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  async function syncRecords() {
    setSyncing(true)
    setSyncMsg('')
    const supabase = createClient()

    const { data: clients } = await supabase
      .from('clients')
      .select('id, code, name, primary_staff')
      .eq('include_tax_return', true)
      .order('code')

    if (!clients) { setSyncing(false); return }

    const { data: existing } = await supabase
      .from('tax_return_records')
      .select('client_id, client_code')
      .eq('year', year)

    const existingIds = new Set((existing || []).map(r => r.client_id || r.client_code))

    const newClients = clients.filter(c => !existingIds.has(c.id) && !existingIds.has(c.code))

    // 前年の next_year_notes を取得
    const prevYearNotes: Record<string, string | null> = {}
    if (newClients.length > 0) {
      const { data: prevRecords } = await supabase
        .from('tax_return_records')
        .select('client_id, next_year_notes')
        .eq('year', year - 1)
        .in('client_id', newClients.map(c => c.id))
      for (const r of (prevRecords || [])) {
        if (r.client_id) prevYearNotes[r.client_id] = r.next_year_notes
      }
    }

    const toInsert = newClients.map(c => ({
      client_id: c.id, client_code: c.code, client_name: c.name,
      year, status: '未着手', staff_name: c.primary_staff || null,
      consumption_tax: false, general_ledger_pdf: false,
      doc_returned: false,
      next_year_notes: prevYearNotes[c.id] || null,
    }))

    if (toInsert.length > 0) {
      const { error } = await supabase.from('tax_return_records').insert(toInsert)
      if (error) { alert('同期エラー: ' + error.message); setSyncing(false); return }
      setSyncMsg(`${toInsert.length}件 追加しました`)
    } else {
      setSyncMsg('新規追加なし（既に全件あります）')
    }

    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 4000)
    setReloadKey(k => k + 1)
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">確定申告 進捗管理</h1>
      <p className="text-xs text-gray-500 mb-5">確定申告業務の進捗を管理します</p>

      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {years.map(y => <option key={y} value={y}>令和{y - 2018}年分（{y}年）</option>)}
        </select>

        <button onClick={syncRecords} disabled={syncing}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          顧客カルテから対象を同期
        </button>

        {syncMsg && <span className="text-sm text-green-600 font-medium">{syncMsg}</span>}
      </div>

      <TaxReturnTab key={`tr-${year}-${reloadKey}`} year={year} />
    </div>
  )
}
