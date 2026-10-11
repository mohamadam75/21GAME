-- 21GAME secure server-side game engine (demo chips only)
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- Private cards/v_deck stay in table_private_state; clients cannot read that table directly.

create or replace function public.game_action(p_table_id integer, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t public.game_tables;
  ps public.table_public_state;
  priv public.table_private_state;
  seat_count integer;
  banker uuid;
  active uuid;
  next_uid uuid;
  seat_ids uuid[];
  v_deck jsonb;
  v_hands jsonb;
  gs jsonb;
  card jsonb;
  rank_text text;
  score integer;
  my_hand jsonb;
  my_score integer;
  banker_hand jsonb;
  banker_score integer;
  opponent_hand jsonb;
  opponent_score integer;
  result_text text;
  stake_amount bigint;
  bank_amount bigint;
  phase text;
  i integer;
begin
  if uid is null then raise exception 'login_required'; end if;
  if p_action not in ('start','draw','stand','close','pause','resume') then raise exception 'invalid_action'; end if;

  select * into t from public.game_tables where id=p_table_id for update;
  if not found then raise exception 'table_not_found'; end if;
  if not exists(select 1 from public.table_seats where table_id=p_table_id and user_id=uid) then
    raise exception 'not_seated_at_table';
  end if;

  insert into public.table_public_state(table_id,status,bank_amount,round_no,public_message)
  values(p_table_id,'waiting',0,0,'')
  on conflict (table_id) do nothing;
  select * into ps from public.table_public_state where table_id=p_table_id for update;
  insert into public.table_private_state(table_id,deck,hands,game_state)
  values(p_table_id,'[]'::jsonb,'{}'::jsonb,'{}'::jsonb)
  on conflict (table_id) do nothing;
  select * into priv from public.table_private_state where table_id=p_table_id for update;

  if p_action='start' then
    if ps.status='playing' then raise exception 'game_already_running'; end if;
    if ps.status='settled' and ps.banker_user_id is not null and ps.bank_amount>0 then
      update public.profiles set demo_chips=demo_chips+ps.bank_amount where id=ps.banker_user_id;
      insert into public.wallet_ledger(user_id,amount,entry_type,note,created_by)
        values(ps.banker_user_id,ps.bank_amount,'refund','بازگشت ژتون باقی‌مانده از میز '||p_table_id,uid);
    end if;
    select array_agg(user_id order by seat_no),count(*) into seat_ids,seat_count
      from public.table_seats where table_id=p_table_id;
    if seat_count < 2 then raise exception 'need_two_players'; end if;
    if seat_count > t.capacity then raise exception 'table_full'; end if;

    -- Server-side shuffled v_deck: ranks 6-10, J, Q, K, A; four suits each.
    select jsonb_agg(x.card order by random()) into v_deck
    from (
      select jsonb_build_object(
        'rank',r.rank,
        'suit',s.suit,
        'value',case r.rank when 'A' then 11 when 'K' then 4 when 'Q' then 3 when 'J' then 2 else r.rank::integer end
      ) as card
      from (values ('6'),('7'),('8'),('9'),('10'),('J'),('Q'),('K'),('A')) r(rank)
      cross join (values ('♠'),('♥'),('♦'),('♣')) s(suit)
    ) x;

    -- As-keshi: deal in seat order until a player receives an Ace.
    v_hands := '{}'::jsonb;
    gs := jsonb_build_object('phase','askechi','cursor',0,'round_no',coalesce(ps.round_no,0)+1,'message','آس‌کشی');
    banker := null;
    i := 0;
    while banker is null loop
      if jsonb_array_length(v_deck)=0 then raise exception 'deck_exhausted'; end if;
      active := seat_ids[(i % seat_count)+1];
      card := v_deck->0;
      v_deck := v_deck - 0;
      v_hands := jsonb_set(v_hands,array[active::text],coalesce(v_hands->active::text,'[]'::jsonb) || jsonb_build_array(card),true);
      i := i+1;
      if card->>'rank'='A' then banker := active; end if;
    end loop;

    stake_amount := t.stake;
    if not exists(select 1 from public.profiles where id=banker and demo_chips >= stake_amount*3) then
      raise exception 'banker_needs_three_stakes';
    end if;
    update public.profiles set demo_chips=demo_chips-(stake_amount*3) where id=banker;
    insert into public.wallet_ledger(user_id,amount,entry_type,note,created_by)
      values(banker,-(stake_amount*3),'game_stake','شروع بانکداری میز '||p_table_id,banker);

    -- Remove as-keshi cards before play; only banker role persists.
    v_hands := jsonb_build_object(banker::text,'[]'::jsonb);
    v_deck := (select coalesce(jsonb_agg(value order by ord),'[]'::jsonb)
             from jsonb_array_elements(v_deck) with ordinality as d(value,ord));
    select array_agg(user_id order by seat_no) into seat_ids from public.table_seats where table_id=p_table_id;
    select user_id into next_uid from public.table_seats
      where table_id=p_table_id and seat_no >
        (select seat_no from public.table_seats where table_id=p_table_id and user_id=banker)
      order by seat_no limit 1;
    if next_uid is null then
      select user_id into next_uid from public.table_seats where table_id=p_table_id order by seat_no limit 1;
    end if;
    if next_uid=banker then
      select user_id into next_uid from public.table_seats where table_id=p_table_id and user_id<>banker order by seat_no limit 1;
    end if;
    gs := jsonb_build_object('phase','player_turn','round_no',coalesce(ps.round_no,0)+1,'banker_turn',false,'used_cards',0,'paused_users','[]'::jsonb);
    update public.table_private_state set deck=v_deck,hands=v_hands,game_state=gs,updated_at=now() where table_id=p_table_id;
    update public.table_public_state set status='playing',banker_user_id=banker,active_user_id=next_uid,
      bank_amount=stake_amount*3,round_no=coalesce(ps.round_no,0)+1,public_message='بانکدار انتخاب شد؛ نوبت بازیکن بعد از بانکدار است',updated_at=now()
      where table_id=p_table_id;
  elsif p_action='pause' then
    gs:=coalesce(priv.game_state,'{}'::jsonb);
    if ps.status='playing' and ps.active_user_id=uid and ps.banker_user_id=uid then
      raise exception 'banker_must_finish_turn_before_pause';
    end if;
    gs:=jsonb_set(gs,'{paused_users}',coalesce(gs->'paused_users','[]'::jsonb)||jsonb_build_array(uid),true);
    if ps.status='playing' and ps.active_user_id=uid then
      gs:=jsonb_set(gs,'{phase}','"banker_turn"'::jsonb,true);
      gs:=jsonb_set(gs,'{banker_turn}','true'::jsonb,true);
      update public.table_public_state set active_user_id=ps.banker_user_id,public_message='بازیکن موقتاً خارج شد و دست را بست؛ نوبت بانکدار',updated_at=now() where table_id=p_table_id;
    else
      update public.table_public_state set public_message='بازیکن موقتاً خارج شده؛ صندلی محفوظ است',updated_at=now() where table_id=p_table_id;
    end if;
    update public.table_private_state set game_state=gs,updated_at=now() where table_id=p_table_id;
  elsif p_action='resume' then
    gs:=coalesce(priv.game_state,'{}'::jsonb);
    select coalesce(jsonb_agg(p.value),'[]'::jsonb) into v_deck from jsonb_array_elements(coalesce(gs->'paused_users','[]'::jsonb)) as p(value) where p.value#>>'{}'<>uid::text;
    gs:=jsonb_set(gs,'{paused_users}',coalesce(v_deck,'[]'::jsonb),true);
    update public.table_private_state set game_state=gs,updated_at=now() where table_id=p_table_id;
  else
    if ps.status<>'playing' then raise exception 'game_not_running'; end if;
    if ps.active_user_id<>uid then raise exception 'not_your_turn'; end if;
    v_deck:=priv.deck; v_hands:=priv.hands; gs:=priv.game_state;
    banker:=ps.banker_user_id;
    if p_action='draw' then
      if jsonb_array_length(v_deck)=0 then raise exception 'deck_empty'; end if;
      card:=v_deck->0; v_deck:=v_deck-0;
      v_hands:=jsonb_set(v_hands,array[uid::text],coalesce(v_hands->uid::text,'[]'::jsonb)||jsonb_build_array(card),true);
      select coalesce(sum((x->>'value')::integer),0) into score from jsonb_array_elements(v_hands->uid::text) x;
      if uid=banker and score>21 then
        gs:=jsonb_set(gs,'{phase}','"settled"'::jsonb,true);
        update public.table_public_state set status='settled',active_user_id=null,public_message='بانکدار از ۲۱ عبور کرد؛ دست تمام شد',updated_at=now() where table_id=p_table_id;
      elsif score>21 then
        gs:=jsonb_set(gs,'{phase}','"settled"'::jsonb,true);
        update public.table_public_state set status='settled',active_user_id=null,public_message='بازیکن از ۲۱ عبور کرد؛ این دست باخت',updated_at=now() where table_id=p_table_id;
      elsif score=21 then
        gs:=jsonb_set(gs,'{phase}','"settled"'::jsonb,true);
        if uid=banker then
          update public.table_public_state set status='settled',active_user_id=null,public_message='بانکدار به ۲۱ رسید؛ دست تمام شد',updated_at=now() where table_id=p_table_id;
        else
          update public.profiles set demo_chips=demo_chips+t.stake where id=uid;
          insert into public.wallet_ledger(user_id,amount,entry_type,note,created_by)
            values(uid,t.stake,'game_win','برد با ۲۱ در میز '||p_table_id,banker);
          update public.table_public_state set status='settled',active_user_id=null,public_message='بازیکن به ۲۱ رسید؛ این دست برد',bank_amount=greatest(0,bank_amount-t.stake),updated_at=now() where table_id=p_table_id;
        end if;
      end if;
    elsif p_action='stand' then
      gs:=jsonb_set(gs,'{phase}','"banker_turn"'::jsonb,true);
      gs:=jsonb_set(gs,'{banker_turn}','true'::jsonb,true);
      update public.table_public_state set active_user_id=banker,public_message='بازیکن بسته؛ نوبت بانکدار',updated_at=now() where table_id=p_table_id;
    elsif p_action='close' then
      if uid<>banker then raise exception 'banker_only'; end if;
      my_hand:=coalesce(v_hands->uid::text,'[]'::jsonb);
      select coalesce(sum((x->>'value')::integer),0) into my_score from jsonb_array_elements(my_hand) x;
      opponent_hand:=coalesce(v_hands->coalesce(gs->>'current_opponent',''),'[]'::jsonb);
      select coalesce(sum((x->>'value')::integer),0) into opponent_score from jsonb_array_elements(opponent_hand) x;
      if my_score>21 or (opponent_score<=21 and opponent_score>my_score) then
        result_text:='بازیکن برنده شد';
        if coalesce((gs->>'current_opponent'),'')<>'' and ps.bank_amount>=t.stake then
          update public.profiles set demo_chips=demo_chips+t.stake where id=(gs->>'current_opponent')::uuid;
          insert into public.wallet_ledger(user_id,amount,entry_type,note,created_by)
            values((gs->>'current_opponent')::uuid,t.stake,'game_win','برد در برابر بانکدار در میز '||p_table_id,banker);
          update public.table_public_state set bank_amount=greatest(0,bank_amount-t.stake) where table_id=p_table_id;
        end if;
      else result_text:='بانکدار برنده شد (در تساوی بانکدار برنده است)'; end if;
      gs:=jsonb_set(gs,'{phase}','"settled"'::jsonb,true);
      update public.table_public_state set status='settled',active_user_id=null,public_message=result_text,updated_at=now() where table_id=p_table_id;
    end if;
    update public.table_private_state set deck=v_deck,hands=v_hands,game_state=gs,updated_at=now() where table_id=p_table_id;
  end if;

  select * into ps from public.table_public_state where table_id=p_table_id;
  select * into priv from public.table_private_state where table_id=p_table_id;
  my_hand:=coalesce(priv.hands->uid::text,'[]'::jsonb);
  select coalesce(sum((x->>'value')::integer),0) into my_score from jsonb_array_elements(my_hand) x;
  return jsonb_build_object(
    'table_id',p_table_id,'status',ps.status,'banker_user_id',ps.banker_user_id,
    'active_user_id',ps.active_user_id,'bank_amount',ps.bank_amount,'round_no',ps.round_no,
    'message',ps.public_message,'my_hand',my_hand,'my_score',coalesce(my_score,0),
    'phase',coalesce(priv.game_state->>'phase','waiting'),
    'is_banker',ps.banker_user_id=uid
  );
end;
$$;

create or replace function public.game_my_hand(p_table_id integer)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=auth.uid(); h jsonb; gs jsonb; ps public.table_public_state; total integer;
begin
  if uid is null then raise exception 'login_required'; end if;
  if not exists(select 1 from public.table_seats where table_id=p_table_id and user_id=uid) then raise exception 'not_seated_at_table'; end if;
  select * into ps from public.table_public_state where table_id=p_table_id;
  select hands,game_state into h,gs from public.table_private_state where table_id=p_table_id;
  h:=coalesce(h->uid::text,'[]'::jsonb);
  select coalesce(sum((x->>'value')::integer),0) into total from jsonb_array_elements(h) x;
  return jsonb_build_object('my_hand',h,'my_score',coalesce(total,0),'phase',coalesce(gs->>'phase','waiting'),
    'status',coalesce(ps.status,'waiting'),'banker_user_id',ps.banker_user_id,'active_user_id',ps.active_user_id,
    'bank_amount',ps.bank_amount,'message',ps.public_message,'is_banker',ps.banker_user_id=uid);
end;
$$;

revoke all on function public.game_action(integer,text) from public;
revoke all on function public.game_my_hand(integer) from public;
grant execute on function public.game_action(integer,text) to authenticated;
grant execute on function public.game_my_hand(integer) to authenticated;
