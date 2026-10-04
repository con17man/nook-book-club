# Nook Book Club

An invite-only app for our local book club. Each month:

1. **The admin creates a meetup** (date, time, location, number of seats).
2. **Members suggest a book** — optional, one each, 24 hours. Duplicate titles merge into one entry.
3. **The admin curates** a shortlist of 5–10 books and starts the vote.
4. **Members vote** — optional, up to two books (one vote per book), 24 hours, changeable until it closes.
   A tie triggers a 24-hour single-vote **runoff** between the tied books; if that ties too, the admin picks.
5. **Members reserve a seat** — first come, first served. When seats run out there's a **waitlist**.
   If someone drops out, the next person in line gets an email and has **3 hours** to accept before it
   passes to the next.

Built with Next.js 16 (App Router) · Tailwind CSS · Supabase · Resend. See [`CLAUDE.md`](./CLAUDE.md)
for the architecture.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Link and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" (the club is invite-only;
   invites still work because they use the admin API).
4. **Authentication → URL Configuration**: set Site URL to your app URL and add
   `<your app URL>/auth/confirm` to the redirect allow-list.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase URL + publishable/secret keys, `SITE_URL`, `NEXT_PUBLIC_CLUB_TIMEZONE`, `CRON_SECRET`
(`openssl rand -hex 32`) and, for real emails, `RESEND_API_KEY` + `EMAIL_FROM` (a sender on a domain verified
in Resend). Without `RESEND_API_KEY`, emails are printed to the terminal — handy in development.

### 3. The first admin

Nobody can invite you before an admin exists, so bootstrap yourself once:

1. Supabase dashboard → **Authentication → Users → Add user → Create new user** (your email + a password,
   tick "Auto confirm").
2. **SQL editor**:
   ```sql
   update public.profiles set role = 'admin', full_name = 'Your Name' where email = 'you@example.com';
   ```

Then sign in at `/login` and invite everyone else from **Members**.

### 4. Run it

```bash
npm install
npm run dev
```

### 5. Scheduler (deadlines + emails)

`/api/cron/tick` closes submission/vote windows, tallies votes, expires seat invites and sends queued emails.
It should be called every minute. With Supabase **pg_cron** + **pg_net** (enable both under Database → Extensions),
run this once in the SQL editor:

```sql
select vault.create_secret('https://your-app.example.com', 'nook_app_url');
select vault.create_secret('<your CRON_SECRET>', 'nook_cron_secret');

select cron.schedule('nook-tick', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nook_app_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nook_cron_secret')
    )
  );
$$);
```

Locally you can hit it by hand, or use the **Process deadlines now** button on the admin event page:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

## Tests

```bash
npm run test:db   # whole workflow against the real migrations, in-process Postgres (PGlite) — no Docker
npm run typecheck
npm run lint
```
