# JesDanPay

Cross-border currency exchange between Nigeria and China. This is Milestone 1: auth, KYC
onboarding (individual + business), a USD/NGN wallet foundation, and the base dashboard shell.
Klasha/Busha exchange flows and the admin panel are not built yet (Milestones 2-3).

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Copy `.env.local.example` to `.env.local` and fill in your project's URL, anon key, and
   service role key (Project Settings → API).
4. `npm install`
5. `npm run dev` and open [http://localhost:3000](http://localhost:3000).

Signing up redirects into the KYC selector, then the individual or business verification
wizard, then a status tracker. The dashboard itself is reachable regardless of KYC status —
a banner prompts completion until you're approved (approval is set manually in the `profiles`
table for now; there's no automated verification provider wired in yet).

## Notes

- Klasha/Busha env vars in `.env.local.example` are placeholders for Milestone 2 — no
  integration code exists yet.
- `webhook_events` and `transactions` tables exist in the schema but nothing reads/writes them
  until Milestone 2.
