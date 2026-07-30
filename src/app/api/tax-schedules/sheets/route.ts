import { NextResponse } from 'next/server'

const SHEET_ID = '1dopOS5hjcHsyk9-mWvTKYGWNQAFuPBaoF0rMjuptMhc'

// 試行するシート名の候補（よくある月名パターン）
const CANDIDATES = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]

async function sheetExists(name: string): Promise<boolean> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`
    const res = await fetch(url)
    if (!res.ok) return false
    const text = await res.text()
    // HTMLが返ってきたらシートなし、短すぎてもなし
    if (text.startsWith('<!') || text.length < 10) return false
    return true
  } catch {
    return false
  }
}

export async function GET() {
  // 全候補を並列チェック
  const checks = await Promise.all(
    CANDIDATES.map(async (name) => ({ name, exists: await sheetExists(name) }))
  )
  const found = checks.filter(c => c.exists).map(c => ({ name: c.name }))

  if (found.length > 0) {
    return NextResponse.json({ sheets: found })
  }

  // 何も見つからなければ全12ヶ月を選択肢として返す（手動で選んでもらう）
  return NextResponse.json({
    sheets: CANDIDATES.map(name => ({ name })),
    fallback: true,
  })
}
