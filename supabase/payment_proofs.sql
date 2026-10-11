-- 21GAME private card-transfer proof uploads.
-- Run after schema.sql. Uploaded receipts remain private; only uploader and admins can view them.
alter table public.wallet_requests add column if not exists proof_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "users upload own payment proofs" on storage.objects;
create policy "users upload own payment proofs" on storage.objects
for insert to authenticated
with check (bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "users and admins view payment proofs" on storage.objects;
create policy "users and admins view payment proofs" on storage.objects
for select to authenticated
using (bucket_id='payment-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

drop policy if exists "users delete own payment proofs" on storage.objects;
create policy "users delete own payment proofs" on storage.objects
for delete to authenticated
using (bucket_id='payment-proofs' and (storage.foldername(name))[1]=auth.uid()::text);
