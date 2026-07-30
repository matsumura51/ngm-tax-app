import { NextResponse } from 'next/server'

const SHEET_ID = '1dopOS5hjcHsyk9-mWvTKYGWNQAFuPBaoF0rMjuptMhc'

function decodeEscaped(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
}

export async function GET() {
  // 方法1: Google Sheets Feeds API v3（廃止予定だがパブリックシートでは動作することがある）
  try {
    const res = await fetch(
      `https://spreadsheets.google.com/feeds/worksheets/${SHEET_ID}/public/basic?alt=json`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const json = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries: any[] = json.feed?.entry || []
      const sheets = entries.map((e) => {
        const name: string = e['title']?.['$t'] || ''
        const links: Array<{ rel: string; href: string }> = e['link'] || []
        const vizLink = links.find(l => l.href?.includes('gviz'))
        const gidMatch = vizLink?.href?.match(/[?&#]gid=(\d+)/)
        return { name, gid: gidMatch?.[1] || '' }
      }).filter(s => s.gid)
      if (sheets.length > 0) return NextResponse.json({ sheets })
    }
  } catch { /* fallthrough */ }

  // 方法2: スプレッドシートのHTMLからシート名・gidを抽出
  try {
    const res = await fetch(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (res.ok) {
      const html = await res.text()
      const sheets: { name: string; gid: string }[] = []

      // パターン A: "sheetId":NNN ... "title":"TTT"
      const reA = /"sheetId":(\d+)[^}]{0,300}?"title":"([^"\\]{1,60})"/g
      let m
      while ((m = reA.exec(html)) !== null) {
        const gid = m[1], name = decodeEscaped(m[2])
        if (!sheets.find(s => s.gid === gid)) sheets.push({ gid, name })
      }

      // パターン B: gid=NNN の直後に来るシート名テキスト
      if (sheets.length === 0) {
        const reB = /[#&?]gid=(\d+)[^>]*>\s*<[^>]+>\s*([^<]{1,40})\s*</g
        while ((m = reB.exec(html)) !== null) {
          const gid = m[1], name = m[2].trim()
          if (name && !sheets.find(s => s.gid === gid)) sheets.push({ gid, name })
        }
      }

      if (sheets.length > 0) return NextResponse.json({ sheets })
    }
  } catch { /* fallthrough */ }

  // フォールバック: 既知のgidを返す
  return NextResponse.json({ sheets: [{ gid: '510339633', name: '6月' }] })
}
