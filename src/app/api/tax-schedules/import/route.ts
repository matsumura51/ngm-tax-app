import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const cols: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) {
        cols.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    cols.push(cur.trim())
    rows.push(cols)
  }
  return rows
}

function normalize(s: string): string {
  return s.replace(/[\s　]/g, '').toLowerCase()
}

// クライアント（ブラウザ）からCSVテキストを受け取りDBに保存する
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  const body = await req.json()
  const csvText: string = body.csv
  if (!csvText) return NextResponse.json({ error: 'CSVデータがありません' }, { status: 400 })

  const rows = parseCSV(csvText)
  if (rows.length < 2) return NextResponse.json({ error: 'データが見つかりません' }, { status: 400 })

  // ヘッダー1列目から年月・期限を抽出
  // 例: "予定納税一覧　令和8年6月　納付期限：6月30日（火） 顧客名"
  const header0 = rows[0][0]
  const reiwaMatch = header0.match(/令和(\d+)年(\d+)月/)
  const deadlineMatch = header0.match(/納付期限：([^\s　]+)/)
  if (!reiwaMatch) return NextResponse.json({ error: 'シートの年月が読み取れません: ' + header0 }, { status: 400 })

  const year = parseInt(reiwaMatch[1]) + 2018
  const month = parseInt(reiwaMatch[2])
  const deadline = deadlineMatch?.[1] || null

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data: clients } = await supabase.from('clients').select('id, code, name')
  const clientList = clients || []

  // データ行の先頭から何行スキップするか自動検出
  // 「顧客名」などの列ヘッダー行をスキップする
  let dataStart = 1
  for (let i = 1; i < Math.min(rows.length, 5); i++) {
    const v = normalize(rows[i][0] || '')
    if (v === '顧客名' || v === '顧客' || v === '氏名' || v === '社名' || v === '名称') {
      dataStart = i + 1
      break
    }
  }

  const records = []
  let lastClientName = ''
  let lastMatched: { id: string; code: string } | undefined

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i]
    const rawName = r[0] || ''

    if (rawName) {
      // 新しい顧客名が出たら更新
      lastClientName = rawName
      const normName = normalize(rawName)
      lastMatched = clientList.find(c => normalize(c.name) === normName)
        || clientList.find(c => normName.includes(normalize(c.name)) || normalize(c.name).includes(normName))
    }

    const clientName = lastClientName
    if (!clientName) continue

    // 税目・納付額・回数が全て空の行はスキップ（空白行・区切り行）
    if (!r[1] && !r[2] && !r[3]) continue

    records.push({
      client_id: lastMatched?.id || null,
      client_name: clientName,
      matched_client_code: lastMatched?.code || null,
      year, month, deadline,
      tax_type:       r[1] || null,
      amount:         r[2] || null,
      installment:    r[3] || null,
      payment_method: r[6] || null,
      send_date:      r[7] || null,
      payment_date:   r[8] || null,
      confirmation:   r[9] || null,
    })
  }

  if (records.length === 0) {
    const debugRows = rows.slice(0, 3).map(r => r.slice(0, 4))
    return NextResponse.json({ error: 'インポートできる行が0件でした', debugRows, dataStart, totalRows: rows.length }, { status: 400 })
  }

  // 既存データとマージする（顧客名・税目・回数・金額が一致する行は更新、それ以外は新規追加）
  // ダッシュボード上で入力済みの確認状況・納付日等はシートの値で上書きしない（既存値を優先）
  type ExistingRow = {
    id: string
    payment_method: string | null
    send_date: string | null
    payment_date: string | null
    confirmation: string | null
    contact_date: string | null
  }
  const { data: existingRows } = await supabase
    .from('tax_schedules')
    .select('id, client_name, tax_type, amount, installment, payment_method, send_date, payment_date, confirmation, contact_date')
    .eq('year', year).eq('month', month)
  const existing = existingRows || []

  function keyOf(r: { client_name: string; tax_type: string | null; installment: string | null; amount: string | null }) {
    return [r.client_name, r.tax_type, r.installment, r.amount].join('|')
  }
  const existingByKey = new Map<string, ExistingRow[]>()
  for (const row of existing) {
    const k = keyOf(row)
    if (!existingByKey.has(k)) existingByKey.set(k, [])
    existingByKey.get(k)!.push(row)
  }

  const matchedIds = new Set<string>()
  const toInsert: typeof records = []
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = []

  for (const rec of records) {
    const candidates = existingByKey.get(keyOf(rec)) || []
    const match = candidates.find(c => !matchedIds.has(c.id))
    if (match) {
      matchedIds.add(match.id)
      toUpdate.push({
        id: match.id,
        patch: {
          client_id: rec.client_id,
          matched_client_code: rec.matched_client_code,
          deadline: rec.deadline,
          payment_method: match.payment_method ?? rec.payment_method,
          send_date: match.send_date ?? rec.send_date,
          payment_date: match.payment_date ?? rec.payment_date,
          confirmation: match.confirmation ?? rec.confirmation,
        },
      })
    } else {
      toInsert.push(rec)
    }
  }

  // シートから消えた既存行のうち、確認状況等の入力が一切無いものだけ削除（入力済みのものは保持）
  const staleIds = existing
    .filter(r => !matchedIds.has(r.id))
    .filter(r => !r.payment_method && !r.send_date && !r.payment_date && !r.confirmation && !r.contact_date)
    .map(r => r.id)
  if (staleIds.length > 0) {
    await supabase.from('tax_schedules').delete().in('id', staleIds)
  }

  for (const u of toUpdate) {
    const { error } = await supabase.from('tax_schedules').update(u.patch).eq('id', u.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from('tax_schedules').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true, year, month, deadline,
    count: records.length, inserted: toInsert.length, updated: toUpdate.length,
  })
}
