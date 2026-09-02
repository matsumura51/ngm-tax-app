export interface ColumnDef {
  key: string
  label: string
  group: string
}

export const CLIENT_COLUMNS: ColumnDef[] = [
  // 顧客情報
  { key: 'code',               label: '顧客コード',             group: '顧客情報' },
  { key: 'name',               label: '顧客名',                 group: '顧客情報' },
  { key: 'entity_type',        label: '法・個区分',             group: '顧客情報' },
  { key: 'fiscal_month',       label: '決算月',                 group: '顧客情報' },
  { key: 'contract_status',    label: '契約ステータス',         group: '顧客情報' },
  { key: 'contract_start_date',label: '契約開始日',             group: '顧客情報' },
  { key: 'contract_end_date',  label: '契約終了日',             group: '顧客情報' },
  { key: 'withholding_tax',    label: '源泉税',                 group: '顧客情報' },
  { key: 'consumption_tax',    label: '消費税',                 group: '顧客情報' },
  { key: 'year_end_adjustment',label: '年調有無',               group: '顧客情報' },
  { key: 'notification_send',  label: '申告のお知らせ送付',     group: '顧客情報' },
  { key: 'jumin_tax',          label: '住民税',                 group: '顧客情報' },
  // 代表者情報
  { key: 'representative',     label: '代表者名',               group: '代表者情報' },
  { key: 'honorific',          label: '敬称',                   group: '代表者情報' },
  { key: 'representative_title',label: '役職名',                group: '代表者情報' },
  { key: 'employee_count',     label: '従業員数',               group: '代表者情報' },
  { key: 'invoice_number',     label: 'インボイス番号',         group: '代表者情報' },
  { key: 'client_department',  label: '部署名',                 group: '代表者情報' },
  { key: 'client_contact',     label: '顧客担当者名',           group: '代表者情報' },
  { key: 'website',            label: 'ホームページ',           group: '代表者情報' },
  // 連絡先
  { key: 'postal_code',        label: '郵便番号',               group: '連絡先' },
  { key: 'address',            label: '住所',                   group: '連絡先' },
  { key: 'phone',              label: 'TEL',                    group: '連絡先' },
  { key: 'fax',                label: 'FAX',                    group: '連絡先' },
  { key: 'email',              label: 'メールアドレス',         group: '連絡先' },
  // 送付先
  { key: 'send_postal_code',   label: '送付先郵便番号',         group: '送付先' },
  { key: 'send_address',       label: '送付先住所',             group: '送付先' },
  { key: 'send_tel',           label: '送付先TEL',              group: '送付先' },
  { key: 'send_recipient',     label: '送付先宛先',             group: '送付先' },
  // その他
  { key: 'capital',            label: '資本金',                 group: 'その他' },
  { key: 'tax_office',         label: '管轄税務署名',           group: 'その他' },
  { key: 'blue_white_type',    label: '青白区分',               group: 'その他' },
  { key: 'director_changed',   label: '役員変更',               group: 'その他' },
  { key: 'contact_notes',      label: '連絡・注意事項',         group: 'その他' },
  { key: 'notes',              label: '備考',                   group: 'その他' },
  // 担当スタッフ
  { key: 'primary_staff',      label: '主担当',                 group: '担当スタッフ' },
  { key: 'sub_staff',          label: '副担当',                 group: '担当スタッフ' },
  { key: 'manager',            label: '所長/責任者',            group: '担当スタッフ' },
]

export const COLUMN_GROUPS = Array.from(new Set(CLIENT_COLUMNS.map(c => c.group)))
