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
  jumin_tax: string | null
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
  show_in_monthly: boolean
  include_year_end_adj: boolean
  include_withholding_semi: boolean
  include_tax_return: boolean
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
  monthly_fee: Record<string, string | null>
  ledger_status: string | null
  report_status: string | null
  consumption_tax_filed: string | null
  invoice_status: string | null
  notes: string | null
  created_at: string
  // 税務情報（前期・当期）
  prev_consumption_tax: string | null
  prev_corp_interim_exists: string | null
  prev_corp_interim_date: string | null
  prev_con_interim_exists: string | null
  prev_con_interim_1: string | null
  prev_con_interim_2: string | null
  prev_con_interim_3: string | null
  corp_interim_exists: string | null
  corp_interim_date: string | null
  con_interim_exists: string | null
  con_interim_1: string | null
  con_interim_2: string | null
  con_interim_3: string | null
  // 決算業務
  settle_consumption_judged: string | null
  settle_notice: string | null
  settle_materials: string | null
  settle_return_prepared: string | null
  settle_contact: string | null
  settle_filed: string | null
  settle_payment: string | null
  director_change: string | null
  // 決算業務
  settle_return_docs: string | null          // '1' = チェック済み
  // 決算業務 – 納税額・予定納税
  settle_corp_tax_amount: string | null
  settle_con_tax_amount: string | null
  settle_con_tax_installments: string | null   // '0' | '1' | '3' | '11'
  settle_next_corp_interim: string | null
  settle_next_con_interim: string | null
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
  facility: string | null
  companions: string | null
  break_minutes: number | null
  created_at: string
}

export interface TaxSchedule {
  id: string
  client_id: string | null
  client_name: string
  matched_client_code: string | null
  year: number
  month: number
  deadline: string | null
  tax_type: string | null
  amount: string | null
  installment: string | null
  payment_method: string | null
  send_date: string | null
  payment_date: string | null
  contact_date: string | null
  confirmation: string | null
  imported_at: string
}

export interface User {
  id: string
  name: string
  code: string | null
  department: string | null
  email: string | null
  role: string | null
  hire_date: string | null
  leave_date: string | null
  division: string | null
}

export interface ClientCheckAttachment {
  id: string
  check_id: string
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
}

export interface ClientQuestionAttachment {
  id: string
  question_id: string
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
}

export interface ClientCheck {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  check_date: string
  checker: string | null
  category: string | null
  type: string | null
  content: string
  status: string
  corrected_date: string | null
  correction_note: string | null
  created_at: string
}

export interface ClientQuestion {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  question_date: string
  work_date: string | null
  questioner: string | null
  category: string | null
  content: string
  status: string
  answered_date: string | null
  answer: string | null
  created_at: string
}

export interface WithholdingRecord {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  year: number
  created_at: string
}

export interface WithholdingRecordItem {
  id: string
  record_id: string
  sort_order: number
  payee_name: string | null
  payee_type: string | null
  monthly_data: Record<string, { date: string; gross: number; tax: number }>
  created_at: string
}

export interface YearEndAdjRecord {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  year: number
  status: string
  staff_name: string | null
  input_staff: string | null
  material_distributed_at: string | null
  material_received_at: string | null
  material_scanned: boolean
  director_confirmed_at: string | null
  payment_method: string | null
  payment_note: string | null
  sent_filed_at: string | null
  payment_due_at: string | null
  tax_amount: number
  payment_confirmed_at: string | null
  direct_payment_confirmed_at: string | null
  houjin_chosho: boolean
  salary_report: boolean
  depreciation_assets: boolean
  returned: boolean
  return_method: string | null
  notes: string | null
  next_year_notes: string | null
  created_at: string
}

export interface WithholdingSemiRecord {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  year: number
  status: string
  staff_name: string | null
  doc_received_at: string | null
  confirmed_at: string | null
  payment_method: string | null
  sent_filed_at: string | null
  direct_payment_at: string | null
  tax_amount: number
  payment_confirmed_at: string | null
  has_labor_insurance: boolean
  labor_insurance_amount: number
  labor_insurance_sent_at: string | null
  has_santeikiso: boolean
  santeikiso_sent_at: string | null
  notes: string | null
  created_at: string
}

export interface TaxReturnRecord {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  year: number
  status: string
  staff_name: string | null
  input_staff: string | null
  doc_received_at: string | null
  data_input_completed_at: string | null
  tax_type: string | null
  income_category: string | null
  consumption_tax: boolean
  return_completed_at: string | null
  accountant_check_at: string | null
  e_filing_at: string | null
  e_filing_pdf: string | null
  payment_method: string | null
  general_ledger_pdf: boolean
  doc_returned: boolean
  return_method: string | null
  notes: string | null
  next_year_notes: string | null
  created_at: string
}

export interface PaymentReport {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  year: number
  created_at: string
}

export interface PaymentReportItem {
  id: string
  report_id: string
  sort_order: number
  payee_name: string | null
  payee_address: string | null
  property_address: string | null
  property_use: string | null
  monthly_data: Record<string, { date: string; amount: number }>
  renewal_date: string | null
  renewal_amount: number
  key_money_date: string | null
  key_money_amount: number
  created_at: string
}
