// 実績レポート：月額報酬（Pot A）の配分計算
//
// 「顧問先 × 処理対象月 × 業務区分」ごとに、その月を処理対象として計上した全担当者（どのレポート月で計上したかは問わない）で
// 区分の配分額（rate × その月の報酬）を人数均等割する。各担当者は、その対象月・区分を自分が最初に計上したレポート月でのみ受け取る。
// 例：8月分のチェックを中江が9月に、松村が10月に計上 → チェック枠（30%）を2人で折半し、中江は9月・松村は10月のレポートで受け取る。
// 同じ対象月で複数区分のレート合計が100%を超える場合は、合計100%になるよう縮小する。

export interface PotAEntry {
  client_code: string
  task_type: string
  user: string
  reportKey: string        // 計上したレポート月 'YYYY-M'
  months: string[]         // 処理対象月 'YYYY-M' の一覧
}

export interface PotAResult {
  alloc: Record<string, number>   // 担当者 → 当月レポートでの配分額
  displayFee: number              // 当月レポートで初めて処理対象になった月の報酬合計（表示用「月次報酬」）
}

const keyNum = (k: string) => { const [y, m] = k.split('-').map(Number); return y * 12 + m }

export function allocatePotA(
  entries: PotAEntry[],
  feeByMonth: Record<string, Record<string, number>>,
  taskAlloc: Record<string, { rate: number }>,
  thisReportKey: string,
): Record<string, PotAResult> {
  // info[client][month][task][user] = その担当者が最初に計上したレポート月
  const info: Record<string, Record<string, Record<string, Record<string, string>>>> = {}
  for (const e of entries) {
    if (!taskAlloc[e.task_type]) continue
    for (const m of e.months) {
      if (!(feeByMonth[e.client_code]?.[m] > 0)) continue
      const byUser = ((info[e.client_code] ??= {})[m] ??= {})[e.task_type] ??= {}
      const cur = byUser[e.user]
      if (!cur || keyNum(e.reportKey) < keyNum(cur)) byUser[e.user] = e.reportKey
    }
  }

  const result: Record<string, PotAResult> = {}
  for (const [code, byMonth] of Object.entries(info)) {
    const res: PotAResult = { alloc: {}, displayFee: 0 }
    for (const [m, byTask] of Object.entries(byMonth)) {
      const fee = feeByMonth[code][m]
      const totalRate = Object.keys(byTask).reduce((s, tt) => s + taskAlloc[tt].rate, 0)
      const factor = totalRate > 1 ? 1 / totalRate : 1
      const firstKey = Object.values(byTask).flatMap(u => Object.values(u)).sort((a, b) => keyNum(a) - keyNum(b))[0]
      if (firstKey === thisReportKey) res.displayFee += fee
      for (const [tt, byUser] of Object.entries(byTask)) {
        const share = taskAlloc[tt].rate * fee * factor / Object.keys(byUser).length
        for (const [user, k] of Object.entries(byUser)) {
          if (k === thisReportKey) res.alloc[user] = (res.alloc[user] || 0) + share
        }
      }
    }
    if (res.displayFee > 0 || Object.keys(res.alloc).length > 0) result[code] = res
  }
  return result
}
