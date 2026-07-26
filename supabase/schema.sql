-- ユーザープロファイル
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  code text,
  department text,
  email text,
  created_at timestamptz default now()
);
alter table public.users enable row level security;
create policy "users can view all" on public.users for select using (auth.role() = 'authenticated');
create policy "users can update own" on public.users for update using (auth.uid() = id);

-- 顧客マスタ
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  fiscal_month integer,
  industry text,
  consumption_tax text,
  invoice_registered boolean default false,
  withholding_tax text,
  created_at timestamptz default now()
);
alter table public.clients enable row level security;
create policy "authenticated can view clients" on public.clients for select using (auth.role() = 'authenticated');
create policy "authenticated can insert clients" on public.clients for insert with check (auth.role() = 'authenticated');
create policy "authenticated can update clients" on public.clients for update using (auth.role() = 'authenticated');

-- 月次進捗表
create table public.monthly_progress (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id),
  client_code text,
  client_name text,
  year integer not null,
  fiscal_month integer,
  industry text,
  consumption_tax text,
  withholding_tax text,
  invoice_registered boolean default false,
  primary_staff text,
  sub_staff text,
  input_staff text,
  window_staff text,
  manager text,
  monthly_contact jsonb default '{}',
  monthly_input jsonb default '{}',
  monthly_material jsonb default '{}',
  monthly_completion jsonb default '{}',
  monthly_report jsonb default '{}',
  ledger_status text,
  report_status text,
  consumption_tax_filed text,
  invoice_status text,
  notes text,
  created_at timestamptz default now(),
  unique(client_code, year)
);
alter table public.monthly_progress enable row level security;
create policy "authenticated can all on monthly_progress" on public.monthly_progress for all using (auth.role() = 'authenticated');

-- 日報
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  user_name text,
  date date not null,
  important_report text,
  performance_activity text,
  total_hours text,
  manager_comment text,
  unread_check text default '未チェック',
  created_at timestamptz default now()
);
alter table public.daily_reports enable row level security;
create policy "authenticated can view all reports" on public.daily_reports for select using (auth.role() = 'authenticated');
create policy "users can insert own reports" on public.daily_reports for insert with check (auth.uid() = user_id);
create policy "users can update own reports" on public.daily_reports for update using (auth.uid() = user_id);

-- 日報明細
create table public.daily_report_details (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.daily_reports(id) on delete cascade,
  sort_order integer default 0,
  start_time text,
  end_time text,
  work_time text,
  task_type text,
  client_code text,
  client_name text,
  task_code text,
  task_name text,
  report_type text,
  report_content text,
  details text,
  subject text
);
alter table public.daily_report_details enable row level security;
create policy "authenticated can all on details" on public.daily_report_details for all using (auth.role() = 'authenticated');

-- スケジュール
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  user_name text,
  client_id uuid references public.clients(id),
  client_name text,
  client_code text,
  title text not null,
  start_datetime timestamptz not null,
  end_datetime timestamptz,
  color text default '白',
  type text default 'スケジュール',
  memo text,
  task_type text,
  priority text,
  no_deadline boolean default false,
  recurring_id integer,
  created_at timestamptz default now()
);
alter table public.schedules enable row level security;
create policy "authenticated can view all schedules" on public.schedules for select using (auth.role() = 'authenticated');
create policy "users can insert own schedules" on public.schedules for insert with check (auth.uid() = user_id);
create policy "users can update own schedules" on public.schedules for update using (auth.uid() = user_id);
create policy "users can delete own schedules" on public.schedules for delete using (auth.uid() = user_id);

-- 新規ユーザー登録時にusersテーブルへ自動挿入するトリガー
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
