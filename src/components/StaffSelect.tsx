'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// 在籍中のスタッフ名（ページ内で1回だけ取得して使い回す）
let staffNamesPromise: Promise<string[]> | null = null
function loadStaffNames(): Promise<string[]> {
  if (!staffNamesPromise) {
    staffNamesPromise = Promise.resolve(
      createClient().from('users').select('name, leave_date').order('code')
    ).then(({ data }) => (data || [])
      .filter((u: { leave_date: string | null }) => !u.leave_date)
      .map((u: { name: string }) => u.name)
      .filter(Boolean))
      .catch(() => { staffNamesPromise = null; return [] })
  }
  return staffNamesPromise
}

// 担当者を在籍中のスタッフから選ぶドロップダウン。
// 今入っている名前が選択肢に無い場合（字体の違い・退職者など）も、その名前を選択肢に残して表示する
export default function StaffSelect({ value, onChange, className, emptyLabel = '選択してください' }: {
  value: string | null | undefined
  onChange: (v: string) => void
  className?: string
  emptyLabel?: string
}) {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => { loadStaffNames().then(setNames) }, [])
  const current = value || ''
  const options = current && !names.includes(current) ? [current, ...names] : names
  return (
    <select className={className} value={current} onChange={e => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {options.map(n => <option key={n} value={n}>{n}</option>)}
    </select>
  )
}
