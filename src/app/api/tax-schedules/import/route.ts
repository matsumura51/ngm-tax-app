import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1dopOS5hjcHsyk9-mWvTKYGWNQAFuPBaoF0rMjuptMhc/gviz/tq?tqx=out:csv&gid=510339633'

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

export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })

  // Fetch CSV
  let csvText: string
  try {
    const res = await fetch(SHEET_URL, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    csvText = await res.text()
  } catch (e) {
    return NextResponse.json({ error: 'スプレッドシートの取得に失敗しました: ' + String(e) }, { status: 500 })
  }

  const rows = parseCSV(csvText)
  if (rows.length < 2) return NextResponse.json({ error: 'データが見つかりません' }, { status: 400 })

  // Extract year/month/deadline from header (col 0)
  // "予定納税一覧　令和8年6月　納付期限：6月30日（火） 顧客名"
  const header0 = rows[0][0]
  const reiwaMatch = header0.match(/令和(\d+)年(\d+)月/)
  const deadlineMatch = header0.match(/納付期限：([^\s　]+)/)
  if (!reiwaMatch) return NextResponse.json({ error: 'シートの年月が読み取れません' }, { status: 400 })

  const year = parseInt(reiwaMatch[1]) + 2018
  const month = parseInt(reiwaMatch[2])
  const deadline = deadlineMatch?.[1] || null

  // Load clients for matching
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data: clients } = await supabase.from('clients').select('id, code, name')
  const clientList = clients || []

  // Parse data rows (skip header row)
  const records = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const clientName = r[0] || ''
    if (!clientName) continue

    const normName = normalize(clientName)
    const matched = clientList.find(c => normalize(c.name) === normName)
      || clientList.find(c => normName.includes(normalize(c.name)) || normalize(c.name).includes(normName))

    records.push({
      client_id: matched?.id || null,
      client_name: clientName,
      matched_client_code: matched?.code || null,
      year,
      month,
      deadline,
      tax_type:       r[1] || null,
      amount:         r[2] || null,
      installment:    r[3] || null,
      payment_method: r[6] || null,
      send_date:      r[7] || null,
      payment_date:   r[8] || null,
      confirmation:   r[9] || null,
    })
  }

  // Delete existing records for this year/month then insert
  await supabase.from('tax_schedules').delete().eq('year', year).eq('month', month)
  const { error } = await supabase.from('tax_schedules').insert(records)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, year, month, deadline, count: records.length })
}
