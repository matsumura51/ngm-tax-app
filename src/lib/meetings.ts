// 打合せ記録（meetings テーブル）の型と選択肢

export interface Meeting {
  id: string
  client_id: string | null
  client_code: string | null
  client_name: string
  meeting_date: string
  start_time: string | null
  end_time: string | null
  method: string | null
  place: string | null
  category: string | null
  subject: string | null
  attendees_client: string | null
  attendees_office: string | null
  content: string | null
  decisions: string | null
  todo: string | null
  next_date: string | null
  recorder: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface MeetingAttachment {
  id: string
  meeting_id: string
  file_name: string
  file_path: string
  file_size: number | null
  created_at: string
}

export type MeetingForm = Omit<Meeting, 'id' | 'created_at' | 'updated_at' | 'updated_by'>

export const MEETING_METHODS = ['来所', '訪問', '電話', 'オンライン', 'その他']
export const MEETING_CATEGORIES = ['月次', '決算', '確定申告', '年末調整', '給与計算', '税務調査', '相続', 'その他']

export const methodStyle: Record<string, string> = {
  '来所': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  '訪問': 'bg-blue-50 text-blue-700 border border-blue-200',
  '電話': 'bg-amber-50 text-amber-700 border border-amber-200',
  'オンライン': 'bg-purple-50 text-purple-700 border border-purple-200',
  'その他': 'bg-gray-50 text-gray-600 border border-gray-200',
}

export function todayJst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function emptyMeetingForm(): MeetingForm {
  return {
    client_id: null, client_code: null, client_name: '',
    meeting_date: todayJst(), start_time: null, end_time: null,
    method: '来所', place: null, category: '月次', subject: null,
    attendees_client: null, attendees_office: null,
    content: null, decisions: null, todo: null, next_date: null, recorder: null,
  }
}

// 保存用に空文字を null にそろえる
export function meetingPayload(f: MeetingForm) {
  const n = (v: string | null | undefined) => (v && v.trim() ? v : null)
  return {
    client_id: f.client_id || null,
    client_code: n(f.client_code),
    client_name: f.client_name.trim(),
    meeting_date: f.meeting_date,
    start_time: n(f.start_time),
    end_time: n(f.end_time),
    method: n(f.method),
    place: n(f.place),
    category: n(f.category),
    subject: n(f.subject),
    attendees_client: n(f.attendees_client),
    attendees_office: n(f.attendees_office),
    content: n(f.content),
    decisions: n(f.decisions),
    todo: n(f.todo),
    next_date: n(f.next_date),
    recorder: n(f.recorder),
  }
}

export function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function meetingFilePath(meetingId: string, fileName: string) {
  const safeName = encodeURIComponent(fileName).replace(/%/g, '_')
  return `meetings/${meetingId}/${Date.now()}_${safeName}`
}

export function fmtTime(t: string | null | undefined) {
  return t ? t.slice(0, 5) : ''
}
