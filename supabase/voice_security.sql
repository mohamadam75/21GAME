-- Private Supabase Realtime signaling for 21Game voice rooms.
-- Run once in Supabase SQL Editor after schema.sql.
-- Each signed-in user can join/send only in the voice channel for a table they currently occupy.

drop policy if exists "21game table members receive voice broadcasts" on realtime.messages;
create policy "21game table members receive voice broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and exists (
    select 1
    from public.table_seats s
    where s.user_id = (select auth.uid())
      and (select realtime.topic()) = 'voice-table-' || s.table_id::text
  )
);

drop policy if exists "21game table members send voice broadcasts" on realtime.messages;
create policy "21game table members send voice broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and exists (
    select 1
    from public.table_seats s
    where s.user_id = (select auth.uid())
      and (select realtime.topic()) = 'voice-table-' || s.table_id::text
  )
);
