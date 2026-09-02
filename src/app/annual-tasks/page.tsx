'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import YearEndAdjTab from './YearEndAdjTab'
import WithholdingSemiTab from './WithholdingSemiTab'
import { RefreshCw } from 'lucide-react'

type Tab = '年末調整（1月）' | '源泉納期の特例（7月）'

export default function AnnualTasksPage() {
  const [tab, setTab] = useState<Tab>('年末調整（1月）')
  const [year, setYear] = useState(new Date().getFullYear())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // 顧客カルテから対象顧客を同期してレコードを生成
  async function syncRecords() {
    setSyncing(true)
    setSyncMsg('')
    const supabase = createClient()

    if (tab === '年末調整（1月）') {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, code, name, primary_staff, withholding_tax')
        .eq('include_year_end_adj', true)
        .order('code')

      if (!clients) { setSyncing(false); return }

      const { data: existing } = await supabase
        .from('year_end_adj_records')
        .select('client_id, client_code')
        .eq('year', year)

      const existingIds = new Set((existing || []).map(r => r.client_id || r.client_code))

      const newClients = clients.filter(c => !existingIds.has(c.id) && !existingIds.has(c.code))

      // 前年の next_year_notes を取得
      const prevYearNotes: Record<string, string | null> = {}
      if (newClients.length > 0) {
        const { data: prevRecords } = await supabase
          .from('year_end_adj_records')
          .select('client_id, client_code, next_year_notes')
          .eq('year', year - 1)
          .in('client_id', newClients.map(c => c.id))
        for (const r of (prevRecords || [])) {
          if (r.client_id) prevYearNotes[r.client_id] = r.next_year_notes
        }
      }

      const toInsert = newClients.map(c => ({
        client_id: c.id, client_code: c.code, client_name: c.name,
        year, status: '未完了', staff_name: c.primary_staff || null,
        next_year_notes: prevYearNotes[c.id] || null,
      }))

      if (toInsert.length > 0) {
        const { error } = await supabase.from('year_end_adj_records').insert(toInsert)
        if (error) { alert('同期エラー: ' + error.message); setSyncing(false); return }
        setSyncMsg(`${toInsert.length}件 追加しました`)
      } else {
        setSyncMsg('新規追加なし（既に全件あります）')
      }
    } else {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, code, name, primary_staff')
        .eq('include_withholding_semi', true)
        .order('code')

      if (!clients) { setSyncing(false); return }

      const { data: existing } = await supabase
        .from('withholding_semi_records')
        .select('client_id, client_code')
        .eq('year', year)

      const existingIds = new Set((existing || []).map(r => r.client_id || r.client_code))

      const toInsert = clients
        .filter(c => !existingIds.has(c.id) && !existingIds.has(c.code))
        .map(c => ({
          client_id: c.id, client_code: c.code, client_name: c.name,
          year, status: '未完了', staff_name: c.primary_staff || null,
          tax_amount: 0, labor_insurance_amount: 0,
          has_labor_insurance: false, has_santeikiso: false,
        }))

      if (toInsert.length > 0) {
        const { error } = await supabase.from('withholding_semi_records').insert(toInsert)
        if (error) { alert('同期エラー: ' + error.message); setSyncing(false); return }
        setSyncMsg(`${toInsert.length}件 追加しました`)
      } else {
        setSyncMsg('新規追加なし（既に全件あります）')
      }
    }

    setSyncing(false)
    setTimeout(() => setSyncMsg(''), 4000)
    // タブコンポーネントのリロードは key prop で対応
    setReloadKey(k => k + 1)
  }

  const [reloadKey, setReloadKey] = useState(0)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">年調・源泉 進捗管理</h1>
      <p className="text-xs text-gray-500 mb-5">年末調整（1月）／源泉所得税 納期の特例（7月）の業務進捗を管理します</p>

      {/* タブ＋年度 */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {(['年末調整（1月）', '源泉納期の特例（7月）'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setSyncMsg('') }}
              className={`px-5 py-2.5 text-sm font-medium transition ${
                tab === t
                  ? t === '年末調整（1月）' ? 'bg-amber-500 text-white' : 'bg-teal-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {years.map(y => <option key={y} value={y}>令和{y - 2018}年（{y}年）</option>)}
        </select>

        <button onClick={syncRecords} disabled={syncing}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          顧客カルテから対象を同期
        </button>

        {syncMsg && (
          <span className="text-sm text-green-600 font-medium">{syncMsg}</span>
        )}
      </div>

      {tab === '年末調整（1月）'
        ? <YearEndAdjTab key={`yea-${year}-${reloadKey}`} year={year} />
        : <WithholdingSemiTab key={`whs-${year}-${reloadKey}`} year={year} />
      }
    </div>
  )
}
