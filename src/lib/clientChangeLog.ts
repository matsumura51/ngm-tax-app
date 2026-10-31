// 顧客カルテの変更ログ（client_change_logs）
// 顧客カルテの保存時に、変わった項目ごとに「日時・変更した人・項目・変更前→変更後」を記録する。
// 役員構成・書類は中身を記録せず「変更」とだけ記録する。

import { createClient } from '@/lib/supabase'

export const CLIENT_FIELD_LABELS: Record<string, string> = {
  code: '顧客コード', name: '顧客名', entity_type: '法・個区分', fiscal_month: '決算月',
  contract_status: '契約ステータス', contract_start_date: '契約開始日', contract_end_date: '契約終了日',
  withholding_tax: '源泉税', consumption_tax: '消費税', year_end_adjustment: '年調有無',
  notification_send: '申告のお知らせ送付', jumin_tax: '住民税', report_interval: '報告間隔',
  show_in_monthly: '月次進捗表に表示する', include_year_end_adj: '年末調整 対象',
  include_withholding_semi: '源泉納期の特例（7月） 対象', include_tax_return: '確定申告 対象',
  include_payroll: '給与計算あり', payroll_staff: '給与計算担当',
  representative: '代表者名', honorific: '敬称', representative_title: '役職名', employee_count: '従業員数',
  invoice_number: 'インボイス番号', client_department: '部署名', client_contact: '顧客担当者名', website: 'ホームページ',
  postal_code: '郵便番号', address: '住所', phone: 'TEL', fax: 'FAX', email: 'メールアドレス',
  send_postal_code: '送付先郵便番号', send_address: '送付先住所', send_tel: '送付先TEL', send_recipient: '送付先宛先',
  capital: '資本金', tax_office: '管轄税務署名', blue_white_type: '青白区分', director_changed: '役員変更',
  contact_notes: '連絡・注意事項', notes: '備考',
  primary_staff: '主担当', sub_staff: '副担当', manager: '所長/責任者',
  directors: '役員構成', documents: '書類',
}

// 中身は記録せず「変更」とだけ記録する項目
const SUMMARY_ONLY = new Set(['directors', 'documents'])

export interface ClientChangeLog {
  id: string
  client_id: string
  changed_at: string
  user_name: string | null
  field_label: string
  old_value: string | null
  new_value: string | null
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'あり' : 'なし'
  return String(v).trim()
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

// 保存前（before）と保存内容（after）を比べて、変わった項目の一覧を作る
export function diffClient(before: Record<string, unknown>, after: Record<string, unknown>) {
  const rows: { field_label: string; old_value: string | null; new_value: string | null }[] = []
  for (const [key, label] of Object.entries(CLIENT_FIELD_LABELS)) {
    if (!(key in after)) continue
    if (SUMMARY_ONLY.has(key)) {
      if (!sameJson(before[key], after[key])) rows.push({ field_label: `${label}を変更`, old_value: null, new_value: null })
      continue
    }
    const o = toText(before[key]), n = toText(after[key])
    if (o !== n) rows.push({ field_label: label, old_value: o || null, new_value: n || null })
  }
  return rows
}

async function currentUserName(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('users').select('name').eq('id', user.id).maybeSingle()
  return data?.name || null
}

// 変更ログを書き込む（失敗しても保存自体は止めない）
export async function writeClientChangeLogs(clientId: string, rows: { field_label: string; old_value: string | null; new_value: string | null }[]) {
  if (rows.length === 0) return
  try {
    const user_name = await currentUserName()
    const changed_at = new Date().toISOString()
    await createClient().from('client_change_logs').insert(rows.map(r => ({ ...r, client_id: clientId, user_name, changed_at })))
  } catch { /* 記録に失敗しても顧客カルテの保存は完了させる */ }
}
