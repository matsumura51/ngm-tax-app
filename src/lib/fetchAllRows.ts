// Supabase/PostgRESTは1リクエストあたり最大1000件までしか返さないため、
// range()で分割取得して全件を確実に取得する共通ヘルパー。
// 件数が増え続けるテーブル（clients, daily_reports, client_questions 等）を
// 絞り込み無し・limit無しで取得する箇所では必ずこれを使うこと。
export async function fetchAllRows<T>(
  queryBuilder: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }
): Promise<T[]> {
  const pageSize = 1000
  let all: T[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryBuilder().range(offset, offset + pageSize - 1)
    if (error || !data) break
    all = all.concat(data)
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

// fetchAllRows の高速版：2ページ目以降を数ページずつ同時に取得する。
// ページの重複・取りこぼしを防ぐため、queryBuilder には必ず .order('id') など一意な並び順を付けること。
export async function fetchAllRowsParallel<T>(
  queryBuilder: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
  concurrency = 4
): Promise<T[]> {
  const pageSize = 1000
  const first = await queryBuilder().range(0, pageSize - 1)
  if (first.error || !first.data) return []
  let all: T[] = first.data
  if (first.data.length < pageSize) return all
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await Promise.all(Array.from({ length: concurrency }, (_, i) =>
      queryBuilder().range((page + i) * pageSize, (page + i + 1) * pageSize - 1)))
    let done = false
    for (const r of batch) {
      if (r.error || !r.data) { done = true; break }
      all = all.concat(r.data)
      if (r.data.length < pageSize) { done = true; break }
    }
    if (done) break
    page += concurrency
  }
  return all
}
