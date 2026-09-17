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
