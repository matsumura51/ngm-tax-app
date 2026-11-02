'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'

// 顧問先の主担当（顧客カルテの今の主担当）を、顧客ID・顧客コードから引けるようにする
export function useClientPrimaryStaff() {
  const [byId, setById] = useState<Record<string, string | null>>({})
  const [byCode, setByCode] = useState<Record<string, string | null>>({})
  useEffect(() => {
    const supabase = createClient()
    fetchAllRows<{ id: string; code: string; primary_staff: string | null }>(
      () => supabase.from('clients').select('id, code, primary_staff').order('id'))
      .then(rows => {
        const i: Record<string, string | null> = {}, c: Record<string, string | null> = {}
        for (const r of rows) { i[r.id] = r.primary_staff; if (r.code) c[r.code] = r.primary_staff }
        setById(i); setByCode(c)
      })
  }, [])
  return (row: { client_id: string | null; client_code: string | null }): string | null =>
    (row.client_id && byId[row.client_id]) || (row.client_code && byCode[row.client_code]) || null
}
