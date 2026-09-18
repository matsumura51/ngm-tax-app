import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { callGeminiWithRetry, GeminiOverloadedError } from '@/lib/geminiRetry'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CHUNK_SIZE = 150 // 無料枠のトークン上限（分あたり）に収まるよう分割するサイズ

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

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' })
  const generate = (prompt: string) => model.generateContent(prompt)

  // 全件を1リクエストで送ると無料枠のトークン上限を超えるため、
  // チャンクに分けて候補パターンを抽出→最後に統合する2段階（map-reduce）方式にする
  const chunks: (typeof rows)[] = []
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) chunks.push(rows.slice(i, i + CHUNK_SIZE))

  try {
    const candidateSummaries: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const listText = chunk.map(c => `・[${c.category || '未分類'}] ${c.content}`).join('\n')
      const chunkPrompt = `
以下は、税理士法人内の「指摘事項」記録の一部（${i + 1}/${chunks.length}分割、${chunk.length}件、顧客名・担当者名は含みません）です。

${listText}

---
この中から、特に間違えやすい・繰り返し発生していそうなミスのパターンを最大10件抽出してください。似た内容はまとめてください。
出力形式（この形式のみ。説明や前置きは不要）：
・[区分] パターンの要約（該当件数の目安）
`
      const text = await callGeminiWithRetry(generate, chunkPrompt)
      candidateSummaries.push(`--- ${i + 1}/${chunks.length}分割目からの候補 ---\n${text}`)
      // 無料枠は「1分あたりのトークン数」制限のため、連続リクエストの間隔を空ける
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1500))
    }

    const finalPrompt = `
以下は、税理士法人内の全「指摘事項」（合計${rows.length}件）を${chunks.length}回に分けて抽出した、間違えやすいミスパターンの候補一覧です。

${candidateSummaries.join('\n\n')}

---
これらの候補を統合し、全社的に特に重要度・頻度の高いミスパターンを**上位10項目**にまとめてください。

- 同じ・似た内容の候補は1項目にまとめ、件数の目安があれば合算してください
- 各項目は「何が・なぜ間違えやすいか」が分かる1〜2文の説明を付けてください
- 記帳・決算・確定申告・年末調整・給与計算など、区分ごとの傾向があれば触れてください

出力形式：
1. 【区分】項目タイトル（目安◯件）
   説明文
2. ...（10項目まで）

出力は日本語でお願いします。
`
    const finalText = await callGeminiWithRetry(generate, finalPrompt)
    const generated_at = new Date().toISOString()
    await supabase.from('top_mistakes_report').upsert({
      id: 'global', checklist: finalText, count: rows.length, generated_at,
    })
    return NextResponse.json({ checklist: finalText, count: rows.length, generated_at })
  } catch (e: unknown) {
    if (e instanceof GeminiOverloadedError) {
      return NextResponse.json(
        { error: 'Geminiが一時的に高負荷／利用上限に達しているため、暫く経ってから再度生成して下さい' },
        { status: 503 }
      )
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Gemini APIエラー: ' + msg }, { status: 500 })
  }
}
