-- 21GAME admin and profile settings. Run after schema.sql and game_engine.sql.
create or replace function public.user_update_profile(p_username text, p_display_name text default null)
returns public.profiles
language plpgsql security definer set search_path=public
as $$
declare uid uuid := auth.uid(); result public.profiles; uname text := lower(trim(coalesce(p_username,'')));
begin
  if uid is null then raise exception 'login_required'; end if;
  if uname !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_username'; end if;
  if p_display_name is not null and char_length(trim(p_display_name)) > 40 then raise exception 'display_name_too_long'; end if;
  update public.profiles set username=uname, display_name=coalesce(nullif(trim(p_display_name),''),uname)
    where id=uid returning * into result;
  return result;
exception when unique_violation then raise exception 'username_taken';
end;
$$;

create or replace function public.admin_adjust_user_chips(p_user_id uuid,p_amount bigint,p_note text default '')
returns public.profiles
language plpgsql security definer set search_path=public
as $$
declare result public.profiles; next_balance bigint;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_amount=0 or abs(p_amount)>1000000000000 then raise exception 'invalid_amount'; end if;
  select demo_chips+p_amount into next_balance from public.profiles where id=p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if next_balance<0 then raise exception 'insufficient_demo_chips'; end if;
  update public.profiles set demo_chips=next_balance where id=p_user_id returning * into result;
  insert into public.wallet_ledger(user_id,amount,entry_type,note,created_by)
  values(p_user_id,p_amount,case when p_amount>0 then 'admin_credit' else 'admin_debit' end,
    coalesce(nullif(trim(p_note),''),'اصلاح موجودی توسط مدیر'),auth.uid());
  return result;
end;
$$;

create or replace function public.admin_update_table(p_table_id integer,p_stake bigint,p_capacity integer,p_status text default 'waiting')
returns public.game_tables
language plpgsql security definer set search_path=public
as $$
declare result public.game_tables;
begin
  if not public.is_admin() then raise exception 'admin_only'; end if;
  if p_stake<1 or p_stake>1000000000000 then raise exception 'invalid_stake'; end if;
  if p_capacity<2 or p_capacity>6 then raise exception 'invalid_capacity'; end if;
  if p_status not in ('waiting','maintenance') then raise exception 'invalid_table_status'; end if;
  if exists(select 1 from public.table_public_state where table_id=p_table_id and status='playing') then
    raise exception 'table_game_running';
  end if;
  update public.game_tables set stake=p_stake,capacity=p_capacity,status=p_status
    where id=p_table_id returning * into result;
  if not found then raise exception 'table_not_found'; end if;
  return result;
end;
$$;

revoke all on function public.user_update_profile(text,text) from public;
revoke all on function public.admin_adjust_user_chips(uuid,bigint,text) from public;
revoke all on function public.admin_update_table(integer,bigint,integer,text) from public;
grant execute on function public.user_update_profile(text,text) to authenticated;
grant execute on function public.admin_adjust_user_chips(uuid,bigint,text) to authenticated;
grant execute on function public.admin_update_table(integer,bigint,integer,text) to authenticated;
