import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { fetchAllRows } from '@/lib/fetchAllRows'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 前回生成した結果を返す（Geminiは呼ばない）
export async function GET() {
  const { data, error } = await supabase
    .from('top_mistakes_report')
    .select('checklist, count, generated_at')
    .eq('id', 'global')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ report: data || null })
}

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })

  // 全顧客の「指摘」をすべて取得（1000件超のためfetchAllRowsで分割取得）
  const checks = await fetchAllRows<{ category: string | null; content: string | null }>(() =>
    supabase
      .from('client_checks')
      .select('category, content')
      .eq('type', '指摘')
      .order('check_date', { ascending: false }))

  const rows = checks.filter(c => c.content && c.content.trim())
  if (rows.length === 0) {
    return NextResponse.json({ error: '指摘の記録がありません' }, { status: 400 })
  }

  const listText = rows.map(c => `・[${c.category || '未分類'}] ${c.content}`).join('\n')

  const prompt = `
以下は、税理士法人内の全顧客分の「指摘事項」記録（${rows.length}件、顧客名・担当者名は含みません）です。

${listText}

---

上記をふまえて、全社的に特に間違えやすい・繰り返し発生しているミスのパターンを**重要度・頻度の高い順に上位10項目**にまとめてください。

- 似た内容の指摘はまとめて1項目として扱ってください
- 各項目は「何が・なぜ間違えやすいか」が分かる1〜2文の説明を付けてください
- 該当する記録がおおよそ何件くらいあったか目安を添えてください
- 記帳・決算・確定申告・年末調整・給与計算など、区分ごとの傾向があれば触れてください

出力形式：
1. 【区分】項目タイトル（目安◯件）
   説明文
2. ...（10項目まで）

出力は日本語でお願いします。
`

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' })

  // 503（高負荷による一時的なエラー）は数秒待って自動リトライする。
  const maxAttempts = 3
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(prompt)
      const text = result.response.text()
      const generated_at = new Date().toISOString()
      await supabase.from('top_mistakes_report').upsert({
        id: 'global', checklist: text, count: rows.length, generated_at,
      })
      return NextResponse.json({ checklist: text, count: rows.length, generated_at })
    } catch (e: unknown) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      const isRetryable = msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand')
      if (!isRetryable) break
      if (attempt === maxAttempts) {
        return NextResponse.json(
          { error: 'Geminiが一時的に高負荷になっているため、暫く経ってから再度生成して下さい' },
          { status: 503 }
        )
      }
      await new Promise(r => setTimeout(r, attempt * 2000))
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr)
  return NextResponse.json({ error: 'Gemini APIエラー: ' + msg }, { status: 500 })
}
