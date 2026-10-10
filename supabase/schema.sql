-- 21Game Supabase foundation
-- Run in Supabase SQL Editor. Real-money payments are intentionally not enabled here.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  display_name text not null default 'بازیکن',
  role text not null default 'player' check (role in ('player','admin')),
  demo_chips bigint not null default 0 check (demo_chips >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.game_tables (
  id integer primary key,
  stake bigint not null check (stake > 0),
  capacity integer not null default 6 check (capacity between 2 and 6),
  status text not null default 'waiting' check (status in ('waiting','playing','maintenance')),
  created_at timestamptz not null default now()
);

insert into public.game_tables(id,stake,capacity) values
 (1,20000,6),(2,30000,6),(3,40000,6),(4,50000,6),(5,50000,6),
 (6,60000,6),(7,70000,6),(8,80000,6),(9,90000,6),(10,100000,6)
on conflict (id) do update set stake=excluded.stake, capacity=excluded.capacity;

create table if not exists public.table_seats (
  table_id integer not null references public.game_tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat_no integer not null check (seat_no between 1 and 6),
  joined_at timestamptz not null default now(),
  primary key (table_id,user_id),
  unique (table_id,seat_no)
);

-- Public state contains only safe information. Never put private hands or deck order here.
create table if not exists public.table_public_state (
  table_id integer primary key references public.game_tables(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','playing','settled')),
  banker_user_id uuid references public.profiles(id) on delete set null,
  active_user_id uuid references public.profiles(id) on delete set null,
  bank_amount bigint not null default 0 check (bank_amount >= 0),
  round_no integer not null default 0,
  public_message text not null default '',
  updated_at timestamptz not null default now()
);

-- Server-only game state. RLS denies all direct client access; use trusted Edge Functions.
create table if not exists public.table_private_state (
  table_id integer primary key references public.game_tables(id) on delete cascade,
  deck jsonb not null default '[]'::jsonb,
  hands jsonb not null default '{}'::jsonb,
  game_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('chip_topup','withdrawal')),
  amount bigint not null check (amount > 0),
  method text not null check (method in ('card_transfer','voucher','manual')),
  reference text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount <> 0),
  entry_type text not null check (entry_type in ('admin_credit','admin_debit','game_stake','game_win','refund','adjustment')),
  reference_id uuid,
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.table_chat (
  id bigint generated always as identity primary key,
  table_id integer not null references public.game_tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.game_tables enable row level security;
alter table public.table_seats enable row level security;
alter table public.table_public_state enable row level security;
alter table public.table_private_state enable row level security;
alter table public.wallet_requests enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.table_chat enable row level security;

-- Helper avoids recursive RLS checks on profiles.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "profiles read signed-in profiles" on public.profiles;
create policy "profiles read signed-in profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "profile update self limited" on public.profiles;
-- Profile role and chip balances are server/admin managed; clients cannot update them directly.

drop policy if exists "tables visible" on public.game_tables;
create policy "tables visible" on public.game_tables for select to authenticated using (true);

drop policy if exists "seats visible" on public.table_seats;
create policy "seats visible" on public.table_seats for select to authenticated using (true);
drop policy if exists "users can sit themselves" on public.table_seats;
create policy "users can sit themselves" on public.table_seats for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users can leave their seat" on public.table_seats;
create policy "users can leave their seat" on public.table_seats for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "public table state visible" on public.table_public_state;
create policy "public table state visible" on public.table_public_state for select to authenticated using (true);
drop policy if exists "chat visible" on public.table_chat;
create policy "chat visible" on public.table_chat for select to authenticated using (true);
drop policy if exists "users can send own chat" on public.table_chat;
create policy "users can send own chat" on public.table_chat for insert to authenticated with check (user_id = auth.uid() and exists(select 1 from public.table_seats s where s.table_id = table_chat.table_id and s.user_id = auth.uid()));

drop policy if exists "user reads own wallet requests" on public.wallet_requests;
create policy "user reads own wallet requests" on public.wallet_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "user creates own wallet request" on public.wallet_requests;
create policy "user creates own wallet request" on public.wallet_requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null);
drop policy if exists "user reads own ledger" on public.wallet_ledger;
create policy "user reads own ledger" on public.wallet_ledger for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- No client-side policies for private game state, ledger writes, request reviews, or table state writes.
-- Trusted Edge Functions must perform these actions after validating the caller and game rules.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  base_name text;
begin
  base_name := coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1), 'player');
  base_name := regexp_replace(lower(base_name), '[^a-z0-9_]', '', 'g');
  if char_length(base_name) < 3 then base_name := 'player_' || substr(new.id::text,1,6); end if;
  insert into public.profiles(id,username,display_name)
  values(new.id, left(base_name,24), coalesce(nullif(new.raw_user_meta_data->>'display_name',''), left(base_name,24)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_21game on auth.users;
create trigger on_auth_user_created_21game after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Secure admin review of manual chip requests. These are demo chips only, not cash payments.
create or replace function public.admin_review_wallet_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default ''
)
returns public.wallet_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.wallet_requests;
  current_chips bigint;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;

  select * into req
  from public.wallet_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'request_not_found'; end if;
  if req.status <> 'pending' then raise exception 'request_already_reviewed'; end if;

  if p_approve then
    select demo_chips into current_chips from public.profiles where id = req.user_id for update;
    if req.request_type = 'withdrawal' and current_chips < req.amount then
      raise exception 'insufficient_demo_chips';
    end if;

    if req.request_type = 'chip_topup' then
      update public.profiles set demo_chips = demo_chips + req.amount where id = req.user_id;
      insert into public.wallet_ledger(user_id, amount, entry_type, reference_id, note, created_by)
      values(req.user_id, req.amount, 'admin_credit', req.id, coalesce(p_note,'تأیید شارژ ژتون آزمایشی'), auth.uid());
    else
      update public.profiles set demo_chips = demo_chips - req.amount where id = req.user_id;
      insert into public.wallet_ledger(user_id, amount, entry_type, reference_id, note, created_by)
      values(req.user_id, -req.amount, 'admin_debit', req.id, coalesce(p_note,'تأیید درخواست برداشت ژتون آزمایشی'), auth.uid());
    end if;
  end if;

  update public.wallet_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      admin_note = coalesce(p_note,''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id
  returning * into req;

  return req;
end;
$$;

revoke all on function public.admin_review_wallet_request(uuid,boolean,text) from public;
grant execute on function public.admin_review_wallet_request(uuid,boolean,text) to authenticated;

-- Realtime: safe public tables only. Do NOT publish table_private_state or wallet_ledger.
do $$
begin
  alter publication supabase_realtime add table public.table_seats;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.table_public_state;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.table_chat;
exception when duplicate_object then null;
end $$;
