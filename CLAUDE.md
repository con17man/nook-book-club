@AGENTS.md

# Nook Book Club

Invite-only web app for **one** local book club (no multi-tenancy). Monthly meetups: members suggest
books → admin curates a shortlist → members vote → seats are reserved first-come-first-served with a waitlist.

Stack: Next.js 16 (App Router, `src/`, Server Actions) · Tailwind CSS v4 · Supabase (Postgres + Auth) · Resend · zod.

## Commands

```bash
npm run dev         # local dev on :3000
npm run build       # production build (also typechecks)
npm run typecheck   # next typegen + tsc
npm run lint
npm run test:db     # SQL workflow tests on PGlite (in-process Postgres, no Docker needed)
npm run db:push     # apply supabase/migrations to the linked project
npm run db:types    # regenerate src/lib/database.types.ts from the linked project
```

Always run `npm run test:db`, `npm run typecheck` and `npm run lint` after changing SQL or TS.

## Domain workflow (source of truth: `supabase/migrations/*_init_schema.sql`)

`event_status`: `submissions → curation → voting → (runoff → (tiebreak)) → reservations → completed` (or `cancelled`).

| Phase | Who / what | Rules |
|---|---|---|
| submissions | opens when admin creates event | 24h. Optional, 1 book per member (re-submitting replaces it; orphaned books are deleted). Titles de-duplicated per event by normalised `title_key` (lower-case, collapsed whitespace). |
| curation | auto after 24h (scheduler) | Admin shortlists 2–10 books (UI suggests 5–10), may add/remove books, then clicks **Start vote**. |
| voting (round 1) | admin starts | 24h. Optional. Up to 2 votes, max 1 per book (PK on votes). Changeable until close. Ballots private; tallies hidden from members until the round closes (admins see live). |
| runoff (round 2) | auto if top books tie | 24h, 1 vote, only between the tied books. No votes in round 1 ⇒ all shortlisted books go to runoff. |
| tiebreak | auto if runoff ties | Admin picks the winner manually. |
| reservations | auto when a winner exists | Seats = `capacity`. Free seat + empty queue ⇒ `confirmed`, else `waitlisted`. When a seat frees (cancel/decline/expiry/capacity increase) the queue head becomes `invited` with **3h** to accept; on expiry the next person is invited. Re-joining puts you at the back. Closes at `starts_at`. |
| completed | auto 12h after `starts_at` | |

Only one event can be active at a time (partial unique index). Durations (24h/3h) are hard-coded in SQL.

## Architecture

- **All business rules live in Postgres.** Members never write tables directly: every member mutation is a
  `SECURITY DEFINER` RPC in `public` (`submit_book`, `withdraw_submission`, `cast_votes`, `reserve_spot`,
  `accept_invite`, `cancel_reservation`) that checks `auth.uid()`, the phase and the deadline. Admin RPCs:
  `create_event`, `start_voting`, `pick_winner`, `cancel_event`. Admins edit plain columns directly
  (column-level `GRANT`s + RLS via `private.is_admin()`): event details, books during submissions/curation.
- Helpers/triggers live in the unexposed `private` schema. Function `EXECUTE` is revoked from
  `public/anon` and granted explicitly. `process_deadlines()` is `service_role` only.
- **Scheduler:** `GET|POST /api/cron/tick` (Bearer `CRON_SECRET`) calls `process_deadlines()` then flushes emails.
  Run every minute by Supabase pg_cron + pg_net (see README). RPCs also check timestamps, so a late tick
  never lets someone act after a deadline. Admin event page has a "Process deadlines now" button.
- **Emails:** SQL enqueues rows in `public.email_outbox` (service-role only); `src/lib/email/outbox.ts`
  claims rows (optimistic lock on `attempts`) and sends via Resend batch API. Server actions call
  `after(sendQueuedEmails)` so emails go out right after the response. Templates: `src/lib/email/templates.ts`
  (template names must match the strings used in SQL). Without `RESEND_API_KEY`, emails are logged to the console.
  Auth emails (invite, password reset) are sent directly (not via outbox) so tokens are never stored.
- **Auth:** public sign-up disabled. Admin invites by email → `auth.admin.generateLink` → our own link to
  `/auth/confirm` (button press calls `verifyOtp`, so email link-scanners can't burn the token) →
  `/auth/set-password` (name + password; saving a name sets `profiles.onboarded_at` via trigger).
  Profiles are created by trigger on `auth.users`. Roles: `admin | member` in `profiles.role` (not JWT metadata).
  Members can only update their own `full_name`; role changes go through the service-role client.

## Code map

```
src/proxy.ts                    Next 16 "middleware": refreshes session, redirects anon → /login
src/lib/supabase/{server,admin,proxy}.ts   user client (RLS) / service-role client (server-only!) / proxy helper
src/lib/auth.ts                 getCurrentProfile, requireMember, requireAdmin
src/lib/events.ts               loadEvent(): everything the event page needs; STATUS_LABELS
src/lib/mutate.ts               mutate(): run RPC as user → revalidate → after(flush emails)
src/lib/time.ts                 club-timezone formatting + datetime-local ⇄ UTC
src/app/actions.ts              member server actions
src/app/admin/actions.ts        admin server actions (each starts with requireAdmin() when using the service role)
src/components/event/           member event view (phase panels) + VoteForm (client)
src/components/action-form.tsx  ActionForm (useActionState) + SubmitButton
supabase/migrations/            schema (create new files with `npx supabase migration new <name>`)
supabase/tests/                 PGlite harness + node:test workflow tests
```

## Conventions

- Server actions return `ActionState` (`{ error?, success? }`) and are used through `<ActionForm>`.
  Postgres `raise exception` messages are user-facing — write them as friendly sentences.
- Never import `src/lib/supabase/admin.ts` from client code; any action using it must check `requireAdmin()` first.
- Use `getClaims()` (not `getSession()`) to identify the user on the server.
- `src/lib/database.types.ts` mirrors the schema — update it with every migration (or regenerate).
  App aliases (`Profile`, `BookEvent`, …) are in `src/lib/types.ts`.
- Event times are entered/displayed in `NEXT_PUBLIC_CLUB_TIMEZONE`, stored as `timestamptz`.
- `NEXT_PUBLIC_*` values are inlined at build time. Never leave a `.next/` build made with placeholder env
  values: `npm run start` would silently talk to the wrong Supabase. Use `npm run dev` locally; rebuild
  before `npm run start`.
- Keep the MVP simple: one club, two roles, no realtime, no client-side Supabase.

## Not built yet / ideas

Calendar (.ics) invites · reminders before the meetup · configurable phase durations · attendance history ·
admin override of a vote result · rate limiting on password reset · realtime updates.
