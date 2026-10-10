# 21Game Supabase setup

## Current phase
This adds the secure database foundation and login UI. It does not yet make the game engine server-authoritative or enable real-money payments.

## 1. Create Supabase project
Create a project at https://supabase.com/ and open SQL Editor.

## 2. Run schema
Copy all of `supabase/schema.sql` into SQL Editor and run it.

## 3. Configure browser client
Open `supabase-config.js` and replace:
- `YOUR_SUPABASE_PROJECT_URL`
- `YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY`

Use only the anon/publishable key in the browser. Never expose the service_role key.

## 4. Enable email auth
In Supabase > Authentication > Providers, enable Email. For a first test, email confirmation can be enabled or disabled in the project's auth settings.

## 5. First admin
After registering the account that should be the site owner, run this in SQL Editor (replace the email):
```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and u.email = 'YOUR_ADMIN_EMAIL';
```
Do not expose an admin-role selector in the public website.

## Security notes
- Browser users cannot read `table_private_state`, write wallet ledger entries, approve requests, or modify public game state directly.
- A trusted Supabase Edge Function must implement seating, dealing, card privacy, settlement, and admin approvals. This is required before the game is safe for multiplayer.
- This phase only tracks demo chips and top-up requests. Do not accept real-money deposits or run wagering until legal/regulatory requirements and licensed payment arrangements are verified.
