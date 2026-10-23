// 掲示板の確認対象者の判定
// 入社日より前に書き込まれた掲示板は、その人の確認対象にしない（入社日当日は対象）。
// 入社日が未登録の人はすべての掲示板が対象。

type BulletinLike = { post_date: string | null; created_at: string }
type UserLike = { hire_date?: string | null }

// 掲示板の書き込み日（YYYY-MM-DD・JST）。掲載日が無ければ作成日時を使う
export function bulletinDate(b: BulletinLike): string {
  if (b.post_date) return b.post_date.slice(0, 10)
  return new Date(new Date(b.created_at).getTime() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function isBulletinTarget(u: UserLike, b: BulletinLike): boolean {
  if (!u.hire_date) return true
  return u.hire_date.slice(0, 10) <= bulletinDate(b)
}

export function bulletinTargets<U extends UserLike>(users: U[], b: BulletinLike): U[] {
  return users.filter(u => isBulletinTarget(u, b))
}
