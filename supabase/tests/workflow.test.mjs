// End-to-end tests of the book club workflow at the database level.
// Run with: npm run test:db
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createDb, createUser, as, asService } from "./harness.mjs";

const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => {
    assert.match(err.message, pattern);
    return true;
  });
}

/** Push every deadline of the event into the past and run the scheduler. */
async function expireDeadlines(db, eventId, column) {
  await db.query(`update public.events set ${column} = now() - interval '1 second' where id = $1`, [eventId]);
  const { rows } = await asService(db, `select public.process_deadlines() as result`);
  return rows[0].result;
}

async function eventStatus(db, eventId) {
  const { rows } = await db.query(`select status from public.events where id = $1`, [eventId]);
  return rows[0].status;
}

async function setup() {
  const db = await createDb();
  const admin = await createUser(db, "admin@example.com", { role: "admin" });
  const members = [];
  for (let i = 1; i <= 4; i++) members.push(await createUser(db, `m${i}@example.com`));
  return { db, admin, members };
}

async function createEvent(db, admin, capacity = 20) {
  const { rows } = await as(
    db,
    admin,
    `select public.create_event('October meetup', null, $1, 'The Nook Café', $2) as id`,
    [inDays(10), capacity],
  );
  return rows[0].id;
}

/** Event in voting state with books [A, B, C] shortlisted. */
async function eventInVoting(db, admin, members) {
  const eventId = await createEvent(db, admin);
  const titles = ["Book A", "Book B", "Book C"];
  for (let i = 0; i < titles.length; i++) {
    await as(db, members[i], `select public.submit_book($1, $2, 'Author')`, [eventId, titles[i]]);
  }
  await expireDeadlines(db, eventId, "submissions_close_at");
  await as(db, admin, `update public.books set shortlisted = true where event_id = $1`, [eventId]);
  await as(db, admin, `select public.start_voting($1)`, [eventId]);
  const { rows } = await db.query(`select id, title from public.books where event_id = $1 order by title`, [eventId]);
  return { eventId, books: Object.fromEntries(rows.map((r) => [r.title.slice(-1), r.id])) };
}

describe("events", () => {
  test("only admins create events and only one can be active", async () => {
    const { db, admin, members } = await setup();
    await rejects(as(db, members[0], `select public.create_event('x', null, $1, 'y', 10)`, [inDays(10)]), /Only the club admin/);
    await createEvent(db, admin);
    await rejects(createEvent(db, admin), /already an active event/);
    const { rows } = await db.query(`select count(*)::int as n from public.email_outbox where template = 'event_created'`);
    assert.equal(rows[0].n, 5, "every onboarded member is notified");
  });

  test("anon users see nothing", async () => {
    const { db, admin } = await setup();
    await createEvent(db, admin);
    await rejects(as(db, null, `select * from public.events`), /permission denied/);
  });

  test("members cannot promote themselves", async () => {
    const { db, members } = await setup();
    await rejects(as(db, members[0], `update public.profiles set role = 'admin' where id = $1`, [members[0]]), /permission denied/);
  });

  test("members cannot run the scheduler", async () => {
    const { db, members } = await setup();
    await rejects(as(db, members[0], `select public.process_deadlines()`), /permission denied/);
  });
});

describe("submissions", () => {
  let db, admin, members, eventId;
  before(async () => {
    ({ db, admin, members } = await setup());
    eventId = await createEvent(db, admin);
  });

  test("duplicate titles collapse into a single book", async () => {
    await as(db, members[0], `select public.submit_book($1, 'The  Hobbit', 'Tolkien')`, [eventId]);
    await as(db, members[1], `select public.submit_book($1, 'the hobbit', null)`, [eventId]);
    const { rows } = await db.query(`select title from public.books where event_id = $1`, [eventId]);
    assert.deepEqual(rows.map((r) => r.title), ["The  Hobbit"]);
  });

  test("re-submitting replaces the member's book and cleans up orphans", async () => {
    await as(db, members[2], `select public.submit_book($1, 'Dune', null)`, [eventId]);
    await as(db, members[2], `select public.submit_book($1, 'Emma', null)`, [eventId]);
    const { rows } = await db.query(`select title from public.books where event_id = $1 order by title`, [eventId]);
    assert.deepEqual(rows.map((r) => r.title), ["Emma", "The  Hobbit"]);
  });

  test("members cannot insert books directly", async () => {
    await rejects(as(db, members[0], `insert into public.books (event_id, title) values ($1, 'Sneaky')`, [eventId]), /row-level security/);
  });

  test("submissions close after the deadline", async () => {
    const result = await expireDeadlines(db, eventId, "submissions_close_at");
    assert.equal(result.closed_submissions, 1);
    assert.equal(await eventStatus(db, eventId), "curation");
    await rejects(as(db, members[3], `select public.submit_book($1, 'Late', null)`, [eventId]), /closed/);
  });

  test("curation: only admins shortlist, and the vote needs 2-10 books", async () => {
    await as(db, members[0], `update public.books set shortlisted = true where event_id = $1`, [eventId]);
    const { rows } = await db.query(`select count(*)::int as n from public.books where shortlisted`);
    assert.equal(rows[0].n, 0, "member update silently matches no rows under RLS");

    await as(db, admin, `update public.books set shortlisted = true where event_id = $1 and title = 'Emma'`, [eventId]);
    await rejects(as(db, admin, `select public.start_voting($1)`, [eventId]), /between 2 and 10/);

    await as(db, admin, `insert into public.books (event_id, title, author) values ($1, 'Admin Pick', 'Someone')`, [eventId]);
    await as(db, admin, `update public.books set shortlisted = true where event_id = $1`, [eventId]);
    await as(db, admin, `select public.start_voting($1)`, [eventId]);
    assert.equal(await eventStatus(db, eventId), "voting");
  });
});

describe("voting", () => {
  test("ballot rules: max 2 distinct shortlisted books, changeable, private", async () => {
    const { db, admin, members } = await setup();
    const { eventId, books } = await eventInVoting(db, admin, members);
    const vote = (who, ids) => as(db, who, `select public.cast_votes($1, $2)`, [eventId, ids]);

    await rejects(vote(members[0], [books.A, books.A]), /only vote once per book/);
    await rejects(vote(members[0], [books.A, books.B, books.C]), /at most 2/);
    await vote(members[0], [books.A, books.B]);
    await vote(members[0], [books.C]); // change of mind
    const mine = await as(db, members[0], `select book_id from public.votes`);
    assert.deepEqual(mine.rows.map((r) => r.book_id), [books.C]);

    const theirs = await as(db, members[1], `select * from public.votes`);
    assert.equal(theirs.rows.length, 0, "other members' ballots are hidden");
    const results = await as(db, members[1], `select * from public.get_vote_results($1)`, [eventId]);
    assert.equal(results.rows.length, 0, "tallies are hidden while the round is open");
    const adminResults = await as(db, admin, `select * from public.get_vote_results($1)`, [eventId]);
    assert.equal(adminResults.rows.length, 1, "admins can watch live tallies");
  });

  test("a clear winner opens reservations", async () => {
    const { db, admin, members } = await setup();
    const { eventId, books } = await eventInVoting(db, admin, members);
    await as(db, members[0], `select public.cast_votes($1, $2)`, [eventId, [books.A, books.B]]);
    await as(db, members[1], `select public.cast_votes($1, $2)`, [eventId, [books.A]]);
    await expireDeadlines(db, eventId, "voting_closes_at");
    const { rows } = await db.query(`select status, winning_book_id from public.events where id = $1`, [eventId]);
    assert.deepEqual(rows[0], { status: "reservations", winning_book_id: books.A });
    await rejects(as(db, members[2], `select public.cast_votes($1, $2)`, [eventId, [books.B]]), /closed/);
  });

  test("a tie triggers a single-vote runoff between the tied books", async () => {
    const { db, admin, members } = await setup();
    const { eventId, books } = await eventInVoting(db, admin, members);
    await as(db, members[0], `select public.cast_votes($1, $2)`, [eventId, [books.A, books.B]]);
    await expireDeadlines(db, eventId, "voting_closes_at");
    assert.equal(await eventStatus(db, eventId), "runoff");

    const runoff = await db.query(`select id from public.books where event_id = $1 and in_runoff order by title`, [eventId]);
    assert.deepEqual(runoff.rows.map((r) => r.id), [books.A, books.B]);

    await rejects(as(db, members[0], `select public.cast_votes($1, $2)`, [eventId, [books.A, books.B]]), /at most 1/);
    await rejects(as(db, members[0], `select public.cast_votes($1, $2)`, [eventId, [books.C]]), /not on the ballot/);
    await as(db, members[0], `select public.cast_votes($1, $2)`, [eventId, [books.B]]);
    await expireDeadlines(db, eventId, "runoff_closes_at");
    const { rows } = await db.query(`select status, winning_book_id from public.events where id = $1`, [eventId]);
    assert.deepEqual(rows[0], { status: "reservations", winning_book_id: books.B });
  });

  test("a tied runoff goes to the admin", async () => {
    const { db, admin, members } = await setup();
    const { eventId, books } = await eventInVoting(db, admin, members);
    await expireDeadlines(db, eventId, "voting_closes_at"); // nobody voted: all tie
    await expireDeadlines(db, eventId, "runoff_closes_at");
    assert.equal(await eventStatus(db, eventId), "tiebreak");
    await rejects(as(db, members[0], `select public.pick_winner($1, $2)`, [eventId, books.A]), /Only the club admin/);
    await as(db, admin, `select public.pick_winner($1, $2)`, [eventId, books.C]);
    assert.equal(await eventStatus(db, eventId), "reservations");
  });
});

describe("reservations", () => {
  async function reservationsEvent(capacity) {
    const { db, admin, members } = await setup();
    const { eventId, books } = await eventInVoting(db, admin, members);
    await as(db, members[0], `select public.cast_votes($1, $2)`, [eventId, [books.A]]);
    await expireDeadlines(db, eventId, "voting_closes_at");
    await db.query(`update public.events set capacity = $2 where id = $1`, [eventId, capacity]);
    const reserve = (who) => as(db, who, `select public.reserve_spot($1) as status`, [eventId]).then((r) => r.rows[0].status);
    const statuses = async () => {
      const { rows } = await db.query(
        `select p.email, r.status from public.reservations r join public.profiles p on p.id = r.user_id
         where r.event_id = $1 order by p.email`,
        [eventId],
      );
      return Object.fromEntries(rows.map((r) => [r.email.split("@")[0], r.status]));
    };
    return { db, admin, members, eventId, reserve, statuses };
  }

  test("first come first served, then a queue", async () => {
    const { members, reserve } = await reservationsEvent(2);
    assert.equal(await reserve(members[0]), "confirmed");
    assert.equal(await reserve(members[1]), "confirmed");
    assert.equal(await reserve(members[2]), "waitlisted");
    assert.equal(await reserve(members[2]), "waitlisted", "reserving twice is a no-op");
  });

  test("a dropout invites the next in line, who can accept", async () => {
    const { db, members, eventId, reserve, statuses } = await reservationsEvent(1);
    await reserve(members[0]);
    await reserve(members[1]);
    await reserve(members[2]);
    await as(db, members[0], `select public.cancel_reservation($1)`, [eventId]);
    assert.deepEqual(await statuses(), { m1: "cancelled", m2: "invited", m3: "waitlisted" });

    const { rows } = await db.query(`select to_email from public.email_outbox where template = 'spot_invite'`);
    assert.deepEqual(rows.map((r) => r.to_email), ["m2@example.com"]);

    await rejects(as(db, members[2], `select public.accept_invite($1)`, [eventId]), /no longer valid/);
    await as(db, members[1], `select public.accept_invite($1)`, [eventId]);
    assert.deepEqual(await statuses(), { m1: "cancelled", m2: "confirmed", m3: "waitlisted" });
  });

  test("an expired invite passes to the next in line; re-joining goes to the back", async () => {
    const { db, members, eventId, reserve, statuses } = await reservationsEvent(1);
    await reserve(members[0]);
    await reserve(members[1]);
    await reserve(members[2]);
    await as(db, members[0], `select public.cancel_reservation($1)`, [eventId]);
    await db.query(`update public.reservations set invite_expires_at = now() - interval '1 second' where status = 'invited'`);
    const result = (await asService(db, `select public.process_deadlines() as r`)).rows[0].r;
    assert.equal(result.expired_invites, 1);
    assert.deepEqual(await statuses(), { m1: "cancelled", m2: "expired", m3: "invited" });

    assert.equal(await reserve(members[0]), "waitlisted", "seat is held for the invitee");
  });

  test("raising capacity invites people from the queue", async () => {
    const { db, admin, members, eventId, reserve, statuses } = await reservationsEvent(1);
    await reserve(members[0]);
    await reserve(members[1]);
    await as(db, admin, `update public.events set capacity = 2 where id = $1`, [eventId]);
    assert.deepEqual(await statuses(), { m1: "confirmed", m2: "invited" });
  });
});
