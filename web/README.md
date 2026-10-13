# Execd web admin (Next.js)

Admin console on top of the same Supabase project as the desktop app.

- `/` — public landing page + pricing (reads active rows from `plans`)
- `/login` — Supabase email/password sign-in
- `/dashboard/*` — for organization owners/managers: overview, members, tasks, invitations
- `/admin/*` — superadmin only: all organizations (assign plans) and pricing plan management

## Setup

1. Apply `supabase/migrations/0003_platform_admin_and_plans.sql` (SQL editor or `supabase db push`).
2. Make yourself a superadmin (SQL editor):
   `insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';`
3. `cd web && cp .env.example .env.local` and fill in the Supabase URL + publishable key.
4. `npm install && npm run dev` → http://localhost:3000

All access goes through the signed-in user's session and Row Level Security — the service-role
key is never used here.
