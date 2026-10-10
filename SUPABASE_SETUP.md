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

## 5. Configure allowed URLs
In Supabase > Authentication > URL Configuration, add your GitHub Pages URL to Site URL / Redirect URLs, for example `https://mohamadam75.github.io/21Game/` if that is where the repository is published. Use the actual published URL for your project.

## 6. First admin
After registering the account that should be the site owner, run this in SQL Editor (replace the email):
```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id and u.email = 'YOUR_ADMIN_EMAIL';
```
Do not expose an admin-role selector in the public website.

For a demo test account, you can grant non-cash test chips in SQL Editor after the account exists:
```sql
update public.profiles set demo_chips = 1000000 where username = 'YOUR_USERNAME';
```

## Security notes
- Browser users cannot read `table_private_state`, write wallet ledger entries, approve requests, or modify public game state directly.
- A trusted Supabase Edge Function must implement seating, dealing, card privacy, settlement, and admin approvals. This is required before the game is safe for multiplayer.
- This phase only tracks demo chips and top-up requests. Do not accept real-money deposits or run wagering until legal/regulatory requirements and licensed payment arrangements are verified.


## What is implemented in this first pass
- Email/password sign-up and sign-in UI.
- User profile loaded from Supabase.
- Shared seat list for 10 tables using Supabase Realtime.
- Manual requests for demo-chip top-ups and withdrawals.
- Admin-only request review through a database function.
- Card sound control is inside the table window; card faces are larger and higher contrast.

## What is not live yet
- The actual game engine is still local JavaScript. The new shared table is a synchronized lobby only; cards are not dealt to multiple users yet.
- Secure server-side game actions, private per-player hands, turn locking, balance settlement from game results, voice chat, and real-money payment integration still need their own trusted Edge Functions and testing.
- Do not treat demo chips as money or collect deposits based on this prototype.
