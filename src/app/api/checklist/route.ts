import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { client_id } = await req.json()
  if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })

  // 指摘・クレーム・処理方法をすべて取得
  const { data: checks, error } = await supabase
    .from('client_checks')
    .select('check_date, checker, category, type, content, status, corrected_date, correction_note')
    .eq('client_id', client_id)
    .order('check_date', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!checks || checks.length === 0) {
    return NextResponse.json({ error: '記録がありません' }, { status: 400 })
  }

  // 種別ごとに分類
  const mistakes = checks.filter(c => c.type === '指摘' || c.type === 'クレーム' || !c.type)
  const methods  = checks.filter(c => c.type === '処理方法')

  // 担当者名を匿名化
  const staffMap: Record<string, string> = {}
  const staffLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let staffCount = 0
  function anonymize(name: string | null): string {
    if (!name) return '担当者不明'
    if (!staffMap[name]) staffMap[name] = `担当者${staffLabels[staffCount++ % 26]}`
    return staffMap[name]
  }

  function formatRows(rows: NonNullable<typeof checks>) {
    return rows.map((c, i) => {
      const lines = [
        `【${i + 1}】`,
        `日付: ${c.check_date || '不明'}`,
        `種別: ${c.type || '指摘'}`,
        `担当: ${anonymize(c.checker)}`,
        `区分: ${c.category || '未分類'}`,
        `内容: ${c.content || ''}`,
      ]
      if (c.status && c.type !== '処理方法') lines.push(`状況: ${c.status}`)
      if (c.correction_note) lines.push(`備考: ${c.correction_note}`)
      return lines.join('\n')
    }).join('\n\n')
  }

  const mistakeSection = mistakes.length > 0
    ? `## 過去の指摘・クレーム（${mistakes.length}件）\n\n${formatRows(mistakes)}`
    : '## 過去の指摘・クレーム\n（記録なし）'

  const methodSection = methods.length > 0
    ? `## この顧客固有の処理方法・特殊対応（${methods.length}件）\n\n${formatRows(methods)}`
    : '## この顧客固有の処理方法・特殊対応\n（記録なし）'

  const prompt = `
以下は、ある顧客（社名・個人名は「A社」「担当者A/B/C」に置き換えています）の記録です。

${mistakeSection}

${methodSection}

---

上記をふまえて、以下の3つを作成してください。

## 1. 繰り返し発生しているミス・問題のまとめ
指摘・クレームから、同じような問題が何度も出ている項目を抽出し、簡潔にまとめてください。（処理方法の記録は除く）

## 2. この顧客固有の注意事項・特殊処理
「処理方法」の記録から、担当者が必ず把握すべき特殊対応・注意事項をまとめてください。

## 3. 業務チェックリスト（AI作成）
上記のミス履歴と特殊処理を加味して、この顧客の記帳・申告業務を行う際のチェックリストを作成してください。
- 過去にミスがあった項目は「⚠」マークを付けてください
- この顧客固有の特殊処理は「★」マークを付けてください
- 重要度の高いものを上に配置してください

出力形式（チェックリスト部分は必ずこの形式）：
☐ ⚠ 確認事項（過去にミスあり）
☐ ★ 確認事項（この顧客固有の処理）
☐ 確認事項（一般的な確認）

出力は日本語でお願いします。社名や担当者名は「A社」「担当者A」のままで構いません。
`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text()
    return NextResponse.json({ checklist: text, count: checks.length, mistakeCount: mistakes.length, methodCount: methods.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Gemini APIエラー: ' + msg }, { status: 500 })
  }
}
