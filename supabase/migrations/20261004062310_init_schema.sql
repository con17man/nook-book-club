-- =============================================================================
-- Nook Book Club — initial schema
--
-- Write model: members never write tables directly. Every member mutation goes
-- through a SECURITY DEFINER RPC in `public` that validates the workflow rules
-- (deadlines, vote limits, capacity) and uses auth.uid() for identity.
-- Admins may edit a few plain columns directly (column grants + RLS).
-- Time-based transitions run in public.process_deadlines() (service_role only),
-- which is called by the /api/cron/tick route.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'member');

create type public.event_status as enum (
  'submissions',   -- members submit books (24h)
  'curation',      -- admin picks the shortlist
  'voting',        -- round 1: up to 2 votes per member (24h)
  'runoff',        -- round 2 between tied books: 1 vote per member (24h)
  'tiebreak',      -- runoff tied again: admin picks the winner
  'reservations',  -- winner chosen, members reserve seats
  'completed',
  'cancelled'
);

create type public.reservation_status as enum (
  'confirmed',   -- holds a seat
  'waitlisted',  -- in the queue
  'invited',     -- offered a freed seat, must accept before invite_expires_at
  'cancelled',   -- member dropped out / declined
  'expired'      -- did not accept the invite in time
);

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text check (full_name is null or char_length(trim(full_name)) between 1 and 100),
  role public.user_role not null default 'member',
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  starts_at timestamptz not null,
  location text not null check (char_length(trim(location)) between 1 and 300),
  capacity int not null check (capacity between 1 and 500),
  status public.event_status not null default 'submissions',
  submissions_close_at timestamptz not null default (now() + interval '24 hours'),
  voting_closes_at timestamptz,
  runoff_closes_at timestamptz,
  winning_book_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Only one event can be in flight at a time.
create unique index events_one_active_idx on public.events ((true))
  where status not in ('completed', 'cancelled');
create index events_created_by_idx on public.events (created_by);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 300),
  author text check (author is null or char_length(trim(author)) between 1 and 200),
  -- Normalised title used for de-duplication ("The  Hobbit" == "the hobbit").
  title_key text generated always as (lower(regexp_replace(trim(title), '\s+', ' ', 'g'))) stored,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  shortlisted boolean not null default false,
  in_runoff boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, title_key)
);
create index books_added_by_idx on public.books (added_by);

alter table public.events
  add constraint events_winning_book_id_fkey
  foreign key (winning_book_id) references public.books (id) on delete set null;
create index events_winning_book_id_idx on public.events (winning_book_id);

-- One submission per member per event. Several members may point at the same book.
create table public.submissions (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index submissions_user_id_idx on public.submissions (user_id);
create index submissions_book_id_idx on public.submissions (book_id);

-- The primary key guarantees a member can't put two votes on the same book.
create table public.votes (
  event_id uuid not null references public.events (id) on delete cascade,
  round smallint not null check (round in (1, 2)),
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, round, user_id, book_id)
);
create index votes_user_id_idx on public.votes (user_id);
create index votes_book_id_idx on public.votes (book_id);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.reservation_status not null,
  -- Queue order (first come, first served). Reset when a member re-joins.
  queued_at timestamptz not null default now(),
  invite_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index reservations_user_id_idx on public.reservations (user_id);
create index reservations_queue_idx on public.reservations (event_id, status, queued_at);

-- Transactional outbox: SQL enqueues, the app (src/lib/email/outbox.ts) sends via Resend.
create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index email_outbox_pending_idx on public.email_outbox (created_at) where sent_at is null;

-- -----------------------------------------------------------------------------
-- Privileges: start from nothing, grant only what is needed.
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.events, public.books, public.submissions,
  public.votes, public.reservations, public.email_outbox from anon, authenticated;

grant select on public.profiles, public.events, public.books, public.submissions,
  public.votes, public.reservations to authenticated;

grant update (full_name) on public.profiles to authenticated;
grant update (title, description, starts_at, location, capacity) on public.events to authenticated;
grant insert (event_id, title, author) on public.books to authenticated;
grant update (title, author, shortlisted) on public.books to authenticated;
grant delete on public.books to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.books enable row level security;
alter table public.submissions enable row level security;
alter table public.votes enable row level security;
alter table public.reservations enable row level security;
alter table public.email_outbox enable row level security;

-- -----------------------------------------------------------------------------
-- Private helpers
-- -----------------------------------------------------------------------------
create function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

create function private.require_member()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'You must be signed in as a club member.';
  end if;
  return uid;
end;
$$;

create function private.require_admin()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
begin
  if not private.is_admin() then
    raise exception 'Only the club admin can do this.';
  end if;
  return uid;
end;
$$;

create function private.enqueue_email(p_to text, p_template text, p_payload jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.email_outbox (to_email, template, payload) values (p_to, p_template, p_payload);
$$;

create function private.enqueue_members(p_template text, p_payload jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.email_outbox (to_email, template, payload)
  select email, p_template, p_payload from public.profiles where onboarded_at is not null;
$$;

create function private.enqueue_admins(p_template text, p_payload jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.email_outbox (to_email, template, payload)
  select email, p_template, p_payload from public.profiles where role = 'admin';
$$;

create function private.event_payload(p_event_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'event_title', e.title,
    'starts_at', e.starts_at,
    'location', e.location,
    'capacity', e.capacity,
    'book_title', b.title,
    'book_author', b.author
  )
  from public.events e
  left join public.books b on b.id = e.winning_book_id
  where e.id = p_event_id;
$$;

-- Offer freed seats to the head of the waitlist, one invite per free seat.
create function private.fill_open_spots(p_event_id uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
  taken int;
  next_id uuid;
  invited int := 0;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found or ev.status <> 'reservations' or ev.starts_at <= now() then
    return 0;
  end if;

  loop
    select count(*) into taken
    from public.reservations
    where event_id = p_event_id and status in ('confirmed', 'invited');
    exit when taken >= ev.capacity;

    select id into next_id
    from public.reservations
    where event_id = p_event_id and status = 'waitlisted'
    order by queued_at, id
    limit 1
    for update;
    exit when not found;

    update public.reservations
    set status = 'invited', invite_expires_at = now() + interval '3 hours', updated_at = now()
    where id = next_id;

    perform private.enqueue_email(
      p.email,
      'spot_invite',
      private.event_payload(p_event_id) || jsonb_build_object('expires_at', now() + interval '3 hours')
    )
    from public.reservations r join public.profiles p on p.id = r.user_id
    where r.id = next_id;

    invited := invited + 1;
  end loop;

  return invited;
end;
$$;

create function private.open_reservations(p_event_id uuid, p_book_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.events
  set status = 'reservations', winning_book_id = p_book_id
  where id = p_event_id;

  perform private.enqueue_members('reservations_open', private.event_payload(p_event_id));
end;
$$;

-- Tally the open round and move the event forward.
create function private.close_round(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
  v_round smallint;
  top_ids uuid[];
begin
  select * into ev from public.events where id = p_event_id for update;
  if ev.status = 'voting' then
    v_round := 1;
  elsif ev.status = 'runoff' then
    v_round := 2;
  else
    return;
  end if;

  with eligible as (
    select b.id
    from public.books b
    where b.event_id = p_event_id
      and (case when v_round = 1 then b.shortlisted else b.in_runoff end)
  ), tally as (
    select e.id, count(v.book_id) as n
    from eligible e
    left join public.votes v
      on v.book_id = e.id and v.event_id = p_event_id and v.round = v_round
    group by e.id
  )
  select array_agg(id) into top_ids
  from tally
  where n = (select max(n) from tally);

  if top_ids is null then
    update public.events set status = 'tiebreak' where id = p_event_id;
    perform private.enqueue_admins('tiebreak_needed', private.event_payload(p_event_id));
  elsif cardinality(top_ids) = 1 then
    perform private.open_reservations(p_event_id, top_ids[1]);
  elsif v_round = 1 then
    update public.books set in_runoff = (id = any (top_ids)) where event_id = p_event_id;
    update public.events
    set status = 'runoff', runoff_closes_at = now() + interval '24 hours'
    where id = p_event_id;
    perform private.enqueue_members(
      'runoff_open',
      private.event_payload(p_event_id) || jsonb_build_object(
        'closes_at', now() + interval '24 hours',
        'books', (select jsonb_agg(title order by title) from public.books where id = any (top_ids))
      )
    );
  else
    update public.books set in_runoff = (id = any (top_ids)) where event_id = p_event_id;
    update public.events set status = 'tiebreak' where id = p_event_id;
    perform private.enqueue_admins('tiebreak_needed', private.event_payload(p_event_id));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- A member counts as onboarded once they have saved their name (set-password page).
create function private.profiles_set_onboarded()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.onboarded_at is null and new.full_name is not null and new.full_name is distinct from '' then
    new.onboarded_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_set_onboarded
  before update on public.profiles
  for each row execute function private.profiles_set_onboarded();

-- Raising capacity during reservations should invite people from the waitlist.
create function private.events_capacity_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.fill_open_spots(new.id);
  return null;
end;
$$;

create trigger events_capacity_changed
  after update of capacity on public.events
  for each row
  when (new.capacity > old.capacity and new.status = 'reservations')
  execute function private.events_capacity_changed();

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------
create policy "Members can view profiles" on public.profiles
  for select to authenticated using (true);

create policy "Members can update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Members can view events" on public.events
  for select to authenticated using (true);

create policy "Admins can update events" on public.events
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Members can view books" on public.books
  for select to authenticated using (true);

create policy "Admins can add books before voting" on public.books
  for insert to authenticated
  with check (
    (select private.is_admin())
    and exists (select 1 from public.events e where e.id = event_id and e.status in ('submissions', 'curation'))
  );

create policy "Admins can edit books before voting" on public.books
  for update to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.events e where e.id = event_id and e.status in ('submissions', 'curation'))
  )
  with check (
    (select private.is_admin())
    and exists (select 1 from public.events e where e.id = event_id and e.status in ('submissions', 'curation'))
  );

create policy "Admins can remove books before voting" on public.books
  for delete to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.events e where e.id = event_id and e.status in ('submissions', 'curation'))
  );

create policy "Members can view submissions" on public.submissions
  for select to authenticated using (true);

-- Ballots stay private; tallies are exposed through get_vote_results().
create policy "Members can view their own votes" on public.votes
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "Members can view reservations" on public.reservations
  for select to authenticated using (true);

-- email_outbox: RLS enabled with no policies => service_role only.

-- -----------------------------------------------------------------------------
-- Member RPCs
-- -----------------------------------------------------------------------------
create function public.submit_book(p_event_id uuid, p_title text, p_author text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  ev public.events;
  v_book_id uuid;
  old_book_id uuid;
begin
  select * into ev from public.events where id = p_event_id for share;
  if not found or ev.status <> 'submissions' or now() >= ev.submissions_close_at then
    raise exception 'Book submissions are closed for this event.';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Please enter a book title.';
  end if;

  -- Same normalised title => same book row (title_key is generated from title).
  insert into public.books (event_id, title, author, added_by)
  values (p_event_id, trim(p_title), nullif(trim(p_author), ''), uid)
  on conflict (event_id, title_key)
  do update set author = coalesce(public.books.author, excluded.author)
  returning id into v_book_id;

  select book_id into old_book_id
  from public.submissions
  where event_id = p_event_id and user_id = uid;

  insert into public.submissions (event_id, user_id, book_id)
  values (p_event_id, uid, v_book_id)
  on conflict (event_id, user_id)
  do update set book_id = excluded.book_id, created_at = now();

  if old_book_id is not null and old_book_id <> v_book_id
     and not exists (select 1 from public.submissions where book_id = old_book_id) then
    delete from public.books where id = old_book_id;
  end if;

  return v_book_id;
end;
$$;

create function public.withdraw_submission(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  ev public.events;
  old_book_id uuid;
begin
  select * into ev from public.events where id = p_event_id for share;
  if not found or ev.status <> 'submissions' or now() >= ev.submissions_close_at then
    raise exception 'Book submissions are closed for this event.';
  end if;

  delete from public.submissions
  where event_id = p_event_id and user_id = uid
  returning book_id into old_book_id;

  if old_book_id is not null
     and not exists (select 1 from public.submissions where book_id = old_book_id) then
    delete from public.books where id = old_book_id;
  end if;
end;
$$;

-- Replaces the caller's ballot for the open round. An empty array clears it.
create function public.cast_votes(p_event_id uuid, p_book_ids uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  ev public.events;
  v_round smallint;
  max_votes int;
  ids uuid[] := coalesce(p_book_ids, '{}');
begin
  select * into ev from public.events where id = p_event_id for share;
  if found and ev.status = 'voting' and now() < ev.voting_closes_at then
    v_round := 1; max_votes := 2;
  elsif found and ev.status = 'runoff' and now() < ev.runoff_closes_at then
    v_round := 2; max_votes := 1;
  else
    raise exception 'Voting is closed for this event.';
  end if;

  if cardinality(ids) <> (select count(distinct x) from unnest(ids) as x) then
    raise exception 'You can only vote once per book.';
  end if;
  if cardinality(ids) > max_votes then
    raise exception 'You can vote for at most % book(s) in this round.', max_votes;
  end if;
  if exists (
    select 1 from unnest(ids) as x
    where not exists (
      select 1 from public.books b
      where b.id = x and b.event_id = p_event_id
        and (case when v_round = 1 then b.shortlisted else b.in_runoff end)
    )
  ) then
    raise exception 'That book is not on the ballot.';
  end if;

  delete from public.votes where event_id = p_event_id and round = v_round and user_id = uid;
  insert into public.votes (event_id, round, user_id, book_id)
  select p_event_id, v_round, uid, x from unnest(ids) as x;
end;
$$;

-- Tallies. Members only see closed rounds; admins can watch live.
create function public.get_vote_results(p_event_id uuid)
returns table (round smallint, book_id uuid, votes bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  ev public.events;
  is_admin boolean;
begin
  perform private.require_member();
  is_admin := private.is_admin();
  select * into ev from public.events where id = p_event_id;
  if not found then
    return;
  end if;

  return query
  select v.round, v.book_id, count(*)::bigint
  from public.votes v
  where v.event_id = p_event_id
    and (
      is_admin
      or (v.round = 1 and ev.status not in ('voting'))
      or (v.round = 2 and ev.status not in ('voting', 'runoff'))
    )
  group by v.round, v.book_id;
end;
$$;

create function public.reserve_spot(p_event_id uuid)
returns public.reservation_status
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
  ev public.events;
  existing public.reservations;
  taken int;
  queue_len int;
  new_status public.reservation_status;
begin
  select * into ev from public.events where id = p_event_id for update;
  if not found or ev.status <> 'reservations' or ev.starts_at <= now() then
    raise exception 'Reservations are not open for this event.';
  end if;

  select * into existing from public.reservations where event_id = p_event_id and user_id = uid;
  if found and existing.status in ('confirmed', 'waitlisted', 'invited') then
    return existing.status;
  end if;

  select count(*) filter (where status in ('confirmed', 'invited')),
         count(*) filter (where status = 'waitlisted')
  into taken, queue_len
  from public.reservations
  where event_id = p_event_id;

  new_status := case when taken < ev.capacity and queue_len = 0 then 'confirmed' else 'waitlisted' end;

  insert into public.reservations (event_id, user_id, status, queued_at, invite_expires_at, updated_at)
  values (p_event_id, uid, new_status, now(), null, now())
  on conflict (event_id, user_id)
  do update set status = excluded.status, queued_at = now(), invite_expires_at = null, updated_at = now();

  perform private.fill_open_spots(p_event_id);

  select status into new_status from public.reservations where event_id = p_event_id and user_id = uid;
  return new_status;
end;
$$;

-- Accept a seat offered from the waitlist.
create function public.accept_invite(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
begin
  perform 1 from public.events where id = p_event_id for update;

  update public.reservations
  set status = 'confirmed', invite_expires_at = null, updated_at = now()
  where event_id = p_event_id and user_id = uid
    and status = 'invited' and invite_expires_at > now();

  if not found then
    raise exception 'This invite is no longer valid.';
  end if;
end;
$$;

-- Leave the event (drop a seat, leave the queue, or decline an invite).
create function public.cancel_reservation(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_member();
begin
  perform 1 from public.events where id = p_event_id for update;

  update public.reservations
  set status = 'cancelled', invite_expires_at = null, updated_at = now()
  where event_id = p_event_id and user_id = uid
    and status in ('confirmed', 'waitlisted', 'invited');

  if not found then
    raise exception 'You do not have an active reservation for this event.';
  end if;

  perform private.fill_open_spots(p_event_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin RPCs
-- -----------------------------------------------------------------------------
create function public.create_event(
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_location text,
  p_capacity int
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := private.require_admin();
  new_id uuid;
begin
  if p_starts_at <= now() + interval '3 days' then
    raise exception 'The meeting must be at least 3 days away to leave time for submissions and voting.';
  end if;
  if exists (select 1 from public.events where status not in ('completed', 'cancelled')) then
    raise exception 'There is already an active event. Complete or cancel it first.';
  end if;

  insert into public.events (title, description, starts_at, location, capacity, created_by)
  values (trim(p_title), nullif(trim(p_description), ''), p_starts_at, trim(p_location), p_capacity, uid)
  returning id into new_id;

  perform private.enqueue_members(
    'event_created',
    private.event_payload(new_id) || jsonb_build_object('closes_at', now() + interval '24 hours')
  );
  return new_id;
end;
$$;

create function public.start_voting(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
  n int;
begin
  perform private.require_admin();
  select * into ev from public.events where id = p_event_id for update;
  if not found or not (
    ev.status = 'curation' or (ev.status = 'submissions' and now() >= ev.submissions_close_at)
  ) then
    raise exception 'Voting can only start after the submission window has closed.';
  end if;

  select count(*) into n from public.books where event_id = p_event_id and shortlisted;
  if n < 2 or n > 10 then
    raise exception 'Shortlist between 2 and 10 books before starting the vote (currently %).', n;
  end if;

  update public.events
  set status = 'voting', voting_closes_at = now() + interval '24 hours'
  where id = p_event_id;

  perform private.enqueue_members(
    'voting_open',
    private.event_payload(p_event_id) || jsonb_build_object('closes_at', now() + interval '24 hours')
  );
end;
$$;

create function public.pick_winner(p_event_id uuid, p_book_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  ev public.events;
begin
  perform private.require_admin();
  select * into ev from public.events where id = p_event_id for update;
  if not found or ev.status <> 'tiebreak' then
    raise exception 'The winner can only be picked manually after a tied runoff.';
  end if;
  if not exists (select 1 from public.books where id = p_book_id and event_id = p_event_id and in_runoff) then
    raise exception 'Pick one of the tied books.';
  end if;

  perform private.open_reservations(p_event_id, p_book_id);
end;
$$;

create function public.cancel_event(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();

  update public.events
  set status = 'cancelled'
  where id = p_event_id and status not in ('completed', 'cancelled');

  if not found then
    raise exception 'This event cannot be cancelled.';
  end if;

  perform private.enqueue_members('event_cancelled', private.event_payload(p_event_id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Scheduler entry point (service_role only) — see src/app/api/cron/tick/route.ts
-- -----------------------------------------------------------------------------
create function public.process_deadlines()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  ev record;
  res record;
  n_submissions int := 0;
  n_rounds int := 0;
  n_expired int := 0;
  n_completed int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('nook.process_deadlines')) then
    return jsonb_build_object('skipped', true);
  end if;

  for ev in
    select id from public.events
    where status = 'submissions' and submissions_close_at <= now()
    for update
  loop
    update public.events set status = 'curation' where id = ev.id;
    perform private.enqueue_admins(
      'curation_ready',
      private.event_payload(ev.id)
        || jsonb_build_object('book_count', (select count(*) from public.books where event_id = ev.id))
    );
    n_submissions := n_submissions + 1;
  end loop;

  for ev in
    select id from public.events
    where (status = 'voting' and voting_closes_at <= now())
       or (status = 'runoff' and runoff_closes_at <= now())
    for update
  loop
    perform private.close_round(ev.id);
    n_rounds := n_rounds + 1;
  end loop;

  for res in
    select r.id, r.event_id, p.email
    from public.reservations r
    join public.profiles p on p.id = r.user_id
    where r.status = 'invited' and r.invite_expires_at <= now()
    for update of r
  loop
    update public.reservations
    set status = 'expired', invite_expires_at = null, updated_at = now()
    where id = res.id;
    perform private.enqueue_email(res.email, 'invite_expired', private.event_payload(res.event_id));
    n_expired := n_expired + 1;
  end loop;

  for ev in select id from public.events where status = 'reservations' loop
    perform private.fill_open_spots(ev.id);
  end loop;

  update public.events
  set status = 'completed'
  where status = 'reservations' and starts_at + interval '12 hours' <= now();
  get diagnostics n_completed = row_count;

  return jsonb_build_object(
    'closed_submissions', n_submissions,
    'closed_rounds', n_rounds,
    'expired_invites', n_expired,
    'completed_events', n_completed
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  public.submit_book(uuid, text, text),
  public.withdraw_submission(uuid),
  public.cast_votes(uuid, uuid[]),
  public.get_vote_results(uuid),
  public.reserve_spot(uuid),
  public.accept_invite(uuid),
  public.cancel_reservation(uuid),
  public.create_event(text, text, timestamptz, text, int),
  public.start_voting(uuid),
  public.pick_winner(uuid, uuid),
  public.cancel_event(uuid),
  public.process_deadlines()
from public, anon, authenticated;

grant execute on function
  public.submit_book(uuid, text, text),
  public.withdraw_submission(uuid),
  public.cast_votes(uuid, uuid[]),
  public.get_vote_results(uuid),
  public.reserve_spot(uuid),
  public.accept_invite(uuid),
  public.cancel_reservation(uuid),
  public.create_event(text, text, timestamptz, text, int),
  public.start_voting(uuid),
  public.pick_winner(uuid, uuid),
  public.cancel_event(uuid)
to authenticated;

grant execute on function public.process_deadlines() to service_role;
