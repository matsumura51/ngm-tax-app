// Gemini API呼び出しの共通リトライ処理。
// 503（高負荷）は数秒待って再試行、429（レート制限/クォータ超過）は
// エラーメッセージ中の「Please retry in Ns」を読み取って待ってから再試行する。
type GenerateContentFn = (prompt: string) => Promise<{ response: { text: () => string } }>

export class GeminiOverloadedError extends Error {}

function parseRetryDelaySeconds(msg: string): number | null {
  const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":"(\d+)s"/)
  if (!m) return null
  const v = parseFloat(m[1])
  return isNaN(v) ? null : v
}

export async function callGeminiWithRetry(
  generateContent: GenerateContentFn,
  prompt: string,
  maxAttempts = 3
): Promise<string> {
  let lastErr: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await generateContent(prompt)
      return result.response.text()
    } catch (e: unknown) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      const isOverloaded = msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand')
      const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests')
      if (!isOverloaded && !isQuota) throw e
      if (attempt === maxAttempts) throw new GeminiOverloadedError(msg)
      const suggested = parseRetryDelaySeconds(msg)
      const waitMs = suggested ? (suggested + 1) * 1000 : attempt * 2000
      await new Promise(r => setTimeout(r, waitMs))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
