'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { CLIENT_COLUMNS, COLUMN_GROUPS } from '@/lib/clientColumns'
import { ChevronLeft, Download } from 'lucide-react'
import type { Client } from '@/lib/types'
import * as XLSX from 'xlsx'

function formatValue(key: string, val: unknown): string {
  if (val === null || val === undefined) return ''
  if (key === 'fiscal_month') {
    const n = Number(val)
    return n === 0 ? '個人' : `${n}月`
  }
  if (key === 'invoice_registered') return val ? '○' : ''
  if (key === 'directors' || key === 'documents') return ''
  return String(val)
}

export default function ClientExportPage() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(CLIENT_COLUMNS.map(c => c.key))
  )
  const [exporting, setExporting] = useState(false)

  function toggleCol(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleGroup(group: string) {
    const groupKeys = CLIENT_COLUMNS.filter(c => c.group === group).map(c => c.key)
    const allOn = groupKeys.every(k => selected.has(k))
    setSelected(prev => {
      const next = new Set(prev)
      groupKeys.forEach(k => allOn ? next.delete(k) : next.add(k))
      return next
    })
  }

  function selectAll() { setSelected(new Set(CLIENT_COLUMNS.map(c => c.key))) }
  function clearAll() { setSelected(new Set()) }

  async function doExport() {
    setExporting(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('code')

      if (error) throw error

      const cols = CLIENT_COLUMNS.filter(c => selected.has(c.key))
      if (cols.length === 0) { alert('列を1つ以上選択してください'); return }

      const headerRow = cols.map(c => c.label)
      const dataRows = (data as Client[]).map(client =>
        cols.map(c => formatValue(c.key, (client as unknown as Record<string, unknown>)[c.key]))
      )

      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])

      // 列幅を自動調整
      const colWidths = cols.map((c, i) => {
        const maxLen = Math.max(
          c.label.length * 2,
          ...dataRows.map(row => String(row[i] ?? '').length)
        )
        return { wch: Math.min(maxLen + 2, 40) }
      })
      ws['!cols'] = colWidths

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '顧客カルテ')

      const date = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `顧客カルテ_${date}.xlsx`)
    } catch (e) {
      alert('エクスポートに失敗しました: ' + String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">顧客データ Excelエクスポート</h1>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            エクスポートする列を選択してください（<span className="font-medium text-blue-600">{selected.size}</span> / {CLIENT_COLUMNS.length} 列選択中）
          </p>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
              全選択
            </button>
            <button onClick={clearAll} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
              全解除
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {COLUMN_GROUPS.map(group => {
            const groupCols = CLIENT_COLUMNS.filter(c => c.group === group)
            const allOn = groupCols.every(c => selected.has(c.key))
            const someOn = groupCols.some(c => selected.has(c.key))
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={el => { if (el) el.indeterminate = !allOn && someOn }}
                    onChange={() => toggleGroup(group)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-gray-700">{group}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pl-6">
                  {groupCols.map(col => (
                    <label key={col.key} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                      <input
                        type="checkbox"
                        checked={selected.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="w-3.5 h-3.5 accent-blue-600"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/clients" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </Link>
        <button
          onClick={doExport}
          disabled={exporting || selected.size === 0}
          className="flex items-center gap-2 px-6 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
        >
          <Download size={16} />
          {exporting ? 'エクスポート中...' : 'Excelダウンロード'}
        </button>
      </div>
    </div>
  )
}
