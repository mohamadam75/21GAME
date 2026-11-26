-- One-time rial conversion + administrator announcements for 21Game.
-- Run once in Supabase SQL Editor after the existing schema and game_engine.sql.
create table if not exists public.system_migrations (migration_key text primary key, applied_at timestamptz not null default now());
do $$
begin
  if not exists (select 1 from public.system_migrations where migration_key='2026-11-27-rial-conversion-v1') then
    update public.profiles set demo_chips=demo_chips*10;
    update public.game_tables set stake=stake*10;
    update public.wallet_requests set amount=amount*10;
    update public.wallet_ledger set amount=amount*10;
    update public.table_public_state set bank_amount=bank_amount*10;
    insert into public.system_migrations(migration_key) values('2026-11-27-rial-conversion-v1');
  end if;
end $$;
create table if not exists public.admin_announcements (
  id bigint generated always as identity primary key,
  message text not null check (char_length(trim(message)) between 1 and 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_announcements enable row level security;
drop policy if exists "announcements visible to signed-in users" on public.admin_announcements;
create policy "announcements visible to signed-in users" on public.admin_announcements for select to authenticated using (true);
drop policy if exists "admins create announcements" on public.admin_announcements;
create policy "admins create announcements" on public.admin_announcements for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
drop policy if exists "admins delete announcements" on public.admin_announcements;
create policy "admins delete announcements" on public.admin_announcements for delete to authenticated using (public.is_admin());
alter table public.wallet_ledger drop constraint if exists wallet_ledger_entry_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_entry_type_check check (entry_type in ('admin_credit','admin_debit','game_stake','game_win','game_loss','refund','adjustment'));
