export type Industry = '1：卸売業' | '2：小売業' | '3：製造業' | '4：建設業' | '5：不動産業' | '6：サービス業' | '7：飲食業'
export type ConsumptionTax = '免税' | '本則' | '簡易' | '2割特例'
export type WithholdingTax = '納特' | '毎月' | '不要'

export interface Director {
  role: string
  name: string
}

export interface ClientDocument {
  date: string
  document_name: string
}

export interface Client {
  id: string
  code: string
  name: string
  entity_type: string | null
  // 顧客情報
  fiscal_month: number | null
  contract_status: string | null
  industry: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  withholding_tax: string | null
  consumption_tax: string | null
  invoice_registered: boolean
  year_end_adjustment: string | null
  notification_send: string | null
  // 代表者
  representative: string | null
  honorific: string | null
  representative_title: string | null
  employee_count: number | null
  invoice_number: string | null
  // 顧客担当
  client_department: string | null
  client_contact: string | null
  website: string | null
  // 連絡先
  email: string | null
  postal_code: string | null
  address: string | null
  phone: string | null
  fax: string | null
  // 送付先
  send_postal_code: string | null
  send_address: string | null
  send_tel: string | null
  send_recipient: string | null
  // その他
  contact_notes: string | null
  capital: number | null
  tax_office: string | null
  blue_white_type: string | null
  chatwork_id: string | null
  director_changed: string | null
  directors: Director[]
  documents: ClientDocument[]
  exclude_productivity: string | null
  // 担当スタッフ
  primary_staff: string | null
  sub_staff: string | null
  manager: string | null
  notes: string | null
  created_at: string
}

export interface MonthlyProgress {
  id: string
  client_id: string
  client_code: string
  client_name: string
  year: number
  fiscal_month: number | null
  industry: string | null
  consumption_tax: string | null
  withholding_tax: string | null
  invoice_registered: boolean
  primary_staff: string | null
  sub_staff: string | null
  input_staff: string | null
  window_staff: string | null
  manager: string | null
  monthly_contact: Record<string, string | null>
  monthly_input: Record<string, string | null>
  monthly_material: Record<string, string | null>
  monthly_completion: Record<string, string | null>
  monthly_report: Record<string, string | null>
  ledger_status: string | null
  report_status: string | null
  consumption_tax_filed: string | null
  invoice_status: string | null
  notes: string | null
  created_at: string
}

export interface DailyReport {
  id: string
  user_id: string
  user_name: string
  date: string
  important_report: string | null
  performance_activity: string | null
  total_hours: string | null
  manager_comment: string | null
  unread_check: string
  created_at: string
  details?: DailyReportDetail[]
}

export interface DailyReportDetail {
  id: string
  report_id: string
  sort_order: number
  start_time: string | null
  end_time: string | null
  work_time: string | null
  task_type: string | null
  client_code: string | null
  client_name: string | null
  task_code: string | null
  task_name: string | null
  report_type: string | null
  report_content: string | null
  details: string | null
  subject: string | null
}

export interface Schedule {
  id: string
  user_id: string
  user_name: string
  client_id: string | null
  client_name: string | null
  client_code: string | null
  title: string
  start_datetime: string
  end_datetime: string | null
  color: string | null
  type: 'スケジュール' | 'TODO'
  memo: string | null
  task_type: string | null
  priority: string | null
  no_deadline: boolean
  recurring_id: number | null
  created_at: string
}

export interface User {
  id: string
  name: string
  code: string | null
  department: string | null
  email: string | null
  role: string | null
}
