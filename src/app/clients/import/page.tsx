'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { ChevronLeft, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

const COLUMN_MAP: Record<string, string> = {
  // 顧客基本
  '顧客コード': 'code',
  'コード': 'code',
  '顧客名': 'name',
  '名称': 'name',
  // 法個区分
  '法・個区分': 'entity_type',
  '法個区分': 'entity_type',
  '法・個区分（法人/個人）': 'entity_type',
  // 決算月
  '決算月': 'fiscal_month',
  // 契約
  '契約ステータス': 'contract_status',
  '契約ステータス（期更新）': 'contract_status',
  '契約状況': 'contract_status',
  '契約開始日': 'contract_start_date',
  '契約終了日': 'contract_end_date',
  // 税務
  '消費税': 'consumption_tax',
  '消費税区分': 'consumption_tax',
  '源泉': 'withholding_tax',
  '源泉税': 'withholding_tax',
  '源泉徴収税': 'withholding_tax',
  '年調有無': 'year_end_adjustment',
  '年末調整': 'year_end_adjustment',
  '申告のお知らせ送付の有無': 'notification_send',
  '申告の知らせ送付の有無': 'notification_send',
  '申告お知らせ': 'notification_send',
  // 代表者
  '代表者': 'representative',
  '代表者名': 'representative',
  '敬称': 'honorific',
  '役職名': 'representative_title',
  '従業員数': 'employee_count',
  'インボイス番号': 'invoice_number',
  '適格請求書番号': 'invoice_number',
  '部署名': 'client_department',
  '顧客担当者名': 'client_contact',
  '顧客担当者': 'client_contact',
  'ホームページ': 'website',
  'リンク': 'website',
  // 連絡先
  '郵便番号': 'postal_code',
  '住所': 'address',
  'TEL': 'phone',
  '電話': 'phone',
  '電話番号': 'phone',
  'FAX': 'fax',
  'Fax': 'fax',
  'メール': 'email',
  'メールアドレス': 'email',
  // 送付先
  '送付先郵便番号': 'send_postal_code',
  '送付先住所': 'send_address',
  '送付先宛先': 'send_recipient',
  '送付先TEL': 'send_tel',
  '送付先電話番号': 'send_tel',
  // 担当スタッフ
  '主担当': 'primary_staff',
  '担当': 'primary_staff',
  '担当者': 'primary_staff',
  '副担当': 'sub_staff',
  '所長': 'manager',
  '責任者': 'manager',
  // その他
  '資本金': 'capital',
  '管轄税務署名': 'tax_office',
  '税務署': 'tax_office',
  '青白区分': 'blue_white_type',
  '役員変更': 'director_changed',
  '連絡・注意事項': 'contact_notes',
  '連絡注意事項': 'contact_notes',
  '業種': 'industry',
  'インボイス': 'invoice_registered',
  '備考': 'notes',
  'メモ': 'notes',
  '注記': 'notes',
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

export default function ClientImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [encoding, setEncoding] = useState<'Shift-JIS' | 'UTF-8'>('Shift-JIS')
  // selectedIdx: set of header indices chosen for import (defaults to all mapped cols)
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null)

  function readFile(file: File, enc: 'Shift-JIS' | 'UTF-8') {
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers, rows } = parseCSV(text)
      setHeaders(headers)
      setRows(rows.filter(r => r.some(c => c)))
      setResult(null)
      // auto-select all mapped columns
      const mapped = new Set(
        headers.map((h, i) => (COLUMN_MAP[h] ? i : -1)).filter(i => i >= 0)
      )
      setSelectedIdx(mapped)
    }
    reader.readAsText(file, enc)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    readFile(file, encoding)
  }

  function onEncodingChange(enc: 'Shift-JIS' | 'UTF-8') {
    setEncoding(enc)
    const file = fileRef.current?.files?.[0]
    if (file) readFile(file, enc)
  }

  function toggleHeader(idx: number) {
    if (!COLUMN_MAP[headers[idx]]) return
    setSelectedIdx(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function selectAllMapped() {
    setSelectedIdx(new Set(headers.map((h, i) => (COLUMN_MAP[h] ? i : -1)).filter(i => i >= 0)))
  }

  function clearAllMapped() {
    setSelectedIdx(new Set())
  }

  async function doImport() {
    if (rows.length === 0) return
    setImporting(true)
    const supabase = createClient()

    const errors: string[] = []
    let success = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const record: Record<string, string | number | boolean | null> = {}

      for (let j = 0; j < headers.length; j++) {
        if (!selectedIdx.has(j)) continue
        const header = headers[j]
        const dbField = COLUMN_MAP[header]
        if (!dbField) continue
        const val = row[j]?.trim() || ''

        if (dbField === 'fiscal_month') {
          if (val === '個人') {
            record[dbField] = 0
          } else {
            record[dbField] = val ? parseInt(val.replace('月', '')) || null : null
          }
        } else if (dbField === 'invoice_registered') {
          record[dbField] = val === '○' || val === '✓' || val === '1' || val === 'true' || val === '登録済み'
        } else if (dbField === 'employee_count' || dbField === 'capital') {
          record[dbField] = val ? parseInt(val.replace(/[,，]/g, '')) || null : null
        } else {
          record[dbField] = val || null
        }
      }

      if (!record.code || !record.name) {
        errors.push(`行${i + 2}: 顧客コードまたは顧客名が空です`)
        continue
      }

      const { error } = await supabase.from('clients').upsert(record as any, { onConflict: 'code' })
      if (error) errors.push(`行${i + 2} (${record.code}): ${error.message}`)
      else success++
    }

    setResult({ success, errors })
    setImporting(false)
  }

  const mappedHeaders = headers.map((h, i) => ({ h, i, dbField: COLUMN_MAP[h] || null }))

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clients" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">顧客データ CSVインポート</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-700">
        <p className="font-medium mb-1">CSVファイルの形式について</p>
        <p>kintoneからのエクスポートファイルに対応しています。1行目にヘッダー行が必要です。</p>
        <p className="mt-1 text-xs text-blue-600">顧客コード / 顧客名 / 法・個区分 / 決算月 / 契約ステータス / 郵便番号 / 住所 / 代表者名 / TEL / 送付先郵便番号 / 送付先住所 / 送付先宛先 / 担当者 / 年調有無 / 申告のお知らせ送付の有無 / 備考 など</p>
        <p className="mt-1 text-xs">※ 既存の顧客コードがある場合は上書き更新します</p>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm font-medium text-gray-600">文字コード：</span>
        {(['Shift-JIS', 'UTF-8'] as const).map(enc => (
          <label key={enc} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
            <input
              type="radio"
              name="encoding"
              value={enc}
              checked={encoding === enc}
              onChange={() => onEncodingChange(enc)}
              className="accent-blue-600"
            />
            {enc}
            {enc === 'Shift-JIS' && <span className="text-xs text-gray-400">（kintone標準）</span>}
          </label>
        ))}
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition mb-5"
        onClick={() => fileRef.current?.click()}
      >
        <Upload size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-gray-500 font-medium">CSVファイルを選択してください</p>
        <p className="text-xs text-gray-400 mt-1">クリックまたはドラッグ＆ドロップ</p>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
      </div>

      {headers.length > 0 && !result && (
        <>
          {/* 列選択 */}
          <div className="bg-white rounded-xl shadow p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-gray-700">インポートする列を選択</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  チェックを外した列はインポートされません。グレーの列は未対応です。
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={selectAllMapped} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">全選択</button>
                <button onClick={clearAllMapped} className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">全解除</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {mappedHeaders.map(({ h, i, dbField }) => (
                <label
                  key={i}
                  className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition
                    ${dbField
                      ? selectedIdx.has(i)
                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                      : 'border-gray-100 bg-gray-50 text-gray-300 cursor-default'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={dbField ? selectedIdx.has(i) : false}
                    disabled={!dbField}
                    onChange={() => toggleHeader(i)}
                    className="mt-0.5 w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
                  />
                  <span className="leading-snug">
                    <span className="block font-medium">{h}</span>
                    {dbField && <span className="text-gray-400 font-normal">→ {dbField}</span>}
                    {!dbField && <span className="text-gray-300">未対応</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* プレビュー */}
          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">データプレビュー（最初の3件）</h2>
              <div className="text-sm text-gray-500">
                {rows.length}件 ／ {selectedIdx.size}列選択中
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {headers.map((h, i) => (
                      selectedIdx.has(i) ? (
                        <th key={i} className="px-3 py-2 text-left whitespace-nowrap text-blue-700">
                          {h}
                        </th>
                      ) : null
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        selectedIdx.has(j) ? (
                          <td key={j} className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{cell || '-'}</td>
                        ) : null
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/clients" className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              キャンセル
            </Link>
            <button
              onClick={doImport}
              disabled={importing || selectedIdx.size === 0}
              className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {importing ? 'インポート中...' : `${rows.length}件をインポート`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle size={20} className="text-green-500" />
            <span className="font-semibold text-gray-800">{result.success}件のインポートが完了しました</span>
          </div>
          {result.errors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-2">
                <AlertCircle size={16} /> {result.errors.length}件のエラー
              </div>
              <ul className="text-xs text-red-600 space-y-1">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => { setHeaders([]); setRows([]); setResult(null); setSelectedIdx(new Set()) }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
            >
              続けてインポート
            </button>
            <Link href="/clients" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              顧客一覧へ戻る
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
