-- 打合せ記録
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  client_code text,
  client_name text not null,
  meeting_date date not null,
  start_time time,
  end_time time,
  method text,
  place text,
  category text,
  subject text,
  attendees_client text,
  attendees_office text,
  content text,
  decisions text,
  todo text,
  next_date date,
  recorder text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_client_id_idx on public.meetings(client_id);
create index if not exists meetings_meeting_date_idx on public.meetings(meeting_date desc);

-- 打合せ記録の添付ファイル（ファイル本体は Storage の attachments バケット meetings/ 以下）
create table if not exists public.meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);
create index if not exists meeting_attachments_meeting_id_idx on public.meeting_attachments(meeting_id);

-- 全員が見られて、全員が直せる
alter table public.meetings enable row level security;
alter table public.meeting_attachments enable row level security;
drop policy if exists "meetings_all" on public.meetings;
create policy "meetings_all" on public.meetings for all to authenticated using (true) with check (true);
drop policy if exists "meeting_attachments_all" on public.meeting_attachments;
create policy "meeting_attachments_all" on public.meeting_attachments for all to authenticated using (true) with check (true);

NOTIFY pgrst, 'reload schema';
