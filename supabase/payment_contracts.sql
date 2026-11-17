-- 支払調書の契約書（ファイル本体は m.jun@tax-machida.com の Googleドライブ「支払調書_契約書」フォルダ。ここにはファイルIDなどだけを記録する）
-- 契約書は「顧問先＋貸主の氏名＋物件の所在地」で覚え、翌年以降の支払調書にも同じ契約書を表示する
create table if not exists public.payment_report_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  payee_key text not null,          -- 貸主の氏名（空白を除いて比べる）
  property_key text not null,       -- 物件の所在地（空白を除いて比べる）
  payee_name text,                  -- 添付したときの表示用
  property_address text,
  drive_file_id text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by text,
  created_at timestamptz not null default now()
);
create index if not exists payment_report_contracts_client_idx on public.payment_report_contracts(client_id);

-- 見るのはログインしている全員。追加・削除はサーバー（Googleドライブの操作と一緒に行う）だけ
alter table public.payment_report_contracts enable row level security;
drop policy if exists "payment_report_contracts_read" on public.payment_report_contracts;
create policy "payment_report_contracts_read" on public.payment_report_contracts for select to authenticated using (true);

-- Googleドライブへの接続情報（サーバーだけが読む。画面からは読めない：ポリシーなし）
create table if not exists public.google_drive_auth (
  id integer primary key default 1 check (id = 1),
  refresh_token text not null,
  email text,
  connected_by text,
  connected_at timestamptz not null default now()
);
alter table public.google_drive_auth enable row level security;

-- アプリが作ったドライブのフォルダ（root ＝ 支払調書_契約書、client:<顧問先id> ＝ 顧問先ごと）。サーバーだけが使う
create table if not exists public.google_drive_folders (
  key text primary key,
  folder_id text not null,
  created_at timestamptz not null default now()
);
alter table public.google_drive_folders enable row level security;

NOTIFY pgrst, 'reload schema';
