// 決算整理表（領収書仕訳アプリ）用の読み取り口：支払調書の地代家賃を、事業年度の月の分だけ貸主×物件ごとに合計して返す
// ログインの代わりに、両方のアプリだけが知っている合言葉（KESSAN_API_KEY）で確かめる。返すのは集計だけ
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { serviceClient } from '@/lib/googleDrive'
import { matchKey } from '@/lib/contractKey'

const YM = /^(\d{4})-(0[1-9]|1[0-2])$/
const idx = (y: number, m: number) => y * 12 + (m - 1)

function keyOk(req: NextRequest): boolean {
  const want = process.env.KESSAN_API_KEY || ''
  const got = req.headers.get('x-kessan-key') || ''
  if (want.length < 32 || got.length !== want.length) return false
  return timingSafeEqual(Buffer.from(got), Buffer.from(want))
}

// 「12/25」「12月25日」などから月・日（年は支払調書の年）
function md(s: string | null | undefined): { m: number; d: number } | null {
  const t = String(s ?? '').normalize('NFKC')
  const r = t.match(/(\d{1,2})\s*[/月.-]\s*(\d{1,2})/)
  if (!r) return null
  const m = Number(r[1]), d = Number(r[2])
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { m, d } : null
}

type Row = { payee_name: string | null; payee_address: string | null; property_address: string | null; property_use: string | null; monthly_data: Record<string, { date: string; amount: number }> | null; renewal_date: string | null; renewal_amount: number | null; key_money_date: string | null; key_money_amount: number | null }

export async function GET(req: NextRequest) {
  if (!process.env.KESSAN_API_KEY) return NextResponse.json({ error: '業務管理アプリの設定（KESSAN_API_KEY）がまだです' }, { status: 503 })
  if (!keyOk(req)) return NextResponse.json({ error: '合言葉が違います' }, { status: 401 })
  const sp = req.nextUrl.searchParams
  const code = (sp.get('code') || '').normalize('NFKC').trim()
  const from = sp.get('from') || '', to = sp.get('to') || ''
  const fm = from.match(YM), tm = to.match(YM)
  if (!code || !fm || !tm) return NextResponse.json({ error: '顧問先コード・期間がありません' }, { status: 400 })
  const a = idx(Number(fm[1]), Number(fm[2])), b = idx(Number(tm[1]), Number(tm[2]))
  if (b < a || b - a > 23) return NextResponse.json({ error: '期間が正しくありません' }, { status: 400 })
  const years = Array.from({ length: Number(tm[1]) - Number(fm[1]) + 1 }, (_, i) => Number(fm[1]) + i)

  const db = serviceClient()
  // 顧問先：コードで探す（支払調書は client_code か client_id で結び付いている）
  const { data: cl } = await db.from('clients').select('id, name, code').eq('code', code).maybeSingle()
  const { data: byCode } = await db.from('payment_reports').select('id, year').eq('client_code', code).in('year', years)
  const { data: byId } = cl ? await db.from('payment_reports').select('id, year').eq('client_id', cl.id).in('year', years) : { data: [] }
  const reps = new Map<string, number>()
  for (const r of [...(byCode ?? []), ...(byId ?? [])]) reps.set(r.id, r.year)
  if (!cl && !reps.size) return NextResponse.json({ error: `業務管理アプリに顧問先コード「${code}」の顧問先がありません` }, { status: 404 })

  const out = new Map<string, { payee_name: string; payee_address: string; property_address: string; property_use: string; amount: number; first: number | null; last: number | null; extra: { kind: string; ym: number; day: number; amount: number }[] }>()
  let badDates = 0
  if (reps.size) {
    const { data: items, error } = await db.from('payment_report_items').select('report_id, payee_name, payee_address, property_address, property_use, monthly_data, renewal_date, renewal_amount, key_money_date, key_money_amount').in('report_id', [...reps.keys()]).order('sort_order')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const it of (items ?? []) as (Row & { report_id: string })[]) {
      const y = reps.get(it.report_id)!
      const k = `${matchKey(it.payee_name)}\u0001${matchKey(it.property_address)}`
      const o = out.get(k) ?? { payee_name: it.payee_name ?? '', payee_address: it.payee_address ?? '', property_address: it.property_address ?? '', property_use: it.property_use ?? '', amount: 0, first: null, last: null, extra: [] }
      // 新しい年の書き方（住所・用途）を優先
      if (it.payee_address) o.payee_address = it.payee_address
      if (it.property_use) o.property_use = it.property_use
      for (const [mk, v] of Object.entries(it.monthly_data ?? {})) {
        const n = idx(y, Number(mk)), amt = Number(v?.amount) || 0
        if (!amt || n < a || n > b) continue
        o.amount += amt
        o.first = o.first == null ? n : Math.min(o.first, n)
        o.last = o.last == null ? n : Math.max(o.last, n)
      }
      for (const [kind, date, amount] of [['更新料', it.renewal_date, it.renewal_amount], ['礼金', it.key_money_date, it.key_money_amount]] as const) {
        if (!Number(amount)) continue
        const d = md(date)
        if (!d) { badDates++; continue }
        const n = idx(y, d.m)
        if (n >= a && n <= b) o.extra.push({ kind, ym: n, day: d.d, amount: Number(amount) })
      }
      out.set(k, o)
    }
  }
  const ym = (n: number | null) => (n == null ? '' : `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`)
  return NextResponse.json({
    client_name: cl?.name ?? '',
    years: [...new Set(reps.values())].sort(),
    bad_dates: badDates,
    items: [...out.values()].filter((o) => o.amount || o.extra.length).map((o) => ({
      payee_name: o.payee_name, payee_address: o.payee_address, property_address: o.property_address, property_use: o.property_use,
      amount: o.amount, first: ym(o.first), last: ym(o.last),
      extra: o.extra.map((e) => ({ kind: e.kind, date: `${ym(e.ym)}-${String(e.day).padStart(2, '0')}`, amount: e.amount })),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
