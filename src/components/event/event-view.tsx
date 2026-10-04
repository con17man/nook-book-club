import type { ReactNode } from "react";
import { acceptInvite, cancelReservation, reserveSpot, submitBook, withdrawSubmission } from "@/app/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, SectionTitle, inputStyles } from "@/components/ui";
import { STATUS_LABELS, memberName, type BookWithStats, type LoadedEvent } from "@/lib/events";
import { formatDateTime, formatLongDateTime, formatTimeLeft } from "@/lib/time";
import { VoteForm } from "./vote-form";

export function EventView({ data }: { data: LoadedEvent }) {
  const { event } = data;
  return (
    <div className="space-y-6">
      <EventHeader data={data} />
      {event.status === "submissions" && <SubmissionsPanel data={data} />}
      {event.status === "curation" && <CurationPanel data={data} />}
      {(event.status === "voting" || event.status === "runoff") && <VotingPanel data={data} />}
      {event.status === "tiebreak" && (
        <Card>
          <SectionTitle>Still a tie!</SectionTitle>
          <p className="text-muted">The runoff ended in a tie too, so the club admin will pick the winner. Hang tight.</p>
        </Card>
      )}
      {(event.status === "reservations" || event.status === "completed") && <ReservationsPanel data={data} />}
      {data.hasResults && !["voting", "runoff"].includes(event.status) && <ResultsPanel data={data} />}
    </div>
  );
}

function EventHeader({ data: { event, winner, reservations } }: { data: LoadedEvent }) {
  const tone = event.status === "cancelled" ? "danger" : event.status === "completed" ? "neutral" : "accent";
  return (
    <Card className="bg-gradient-to-br from-card to-accent-soft/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{event.title}</h1>
          <p className="mt-2 text-muted">
            {formatLongDateTime(event.starts_at)} · {event.location}
          </p>
        </div>
        <Badge tone={tone}>{STATUS_LABELS[event.status]}</Badge>
      </div>
      {event.description && <p className="mt-4 whitespace-pre-line">{event.description}</p>}
      {winner && (
        <p className="mt-4 rounded-xl bg-card/80 px-4 py-3">
          📖 We&apos;re reading <strong>{winner.title}</strong>
          {winner.author && <> by {winner.author}</>}
        </p>
      )}
      {event.status === "reservations" && (
        <p className="mt-3 text-sm text-muted">
          {reservations.confirmed.length + reservations.invited.length} of {event.capacity} seats taken
          {reservations.waitlist.length > 0 && ` · ${reservations.waitlist.length} on the waitlist`}
        </p>
      )}
    </Card>
  );
}

function BookList({ books, extra }: { books: BookWithStats[]; extra?: (b: BookWithStats) => ReactNode }) {
  if (books.length === 0) return <Empty>No books yet.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {books.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-4 py-3">
          <span>
            <span className="font-medium">{b.title}</span>
            {b.author && <span className="text-muted"> — {b.author}</span>}
          </span>
          {extra?.(b)}
        </li>
      ))}
    </ul>
  );
}

function SubmissionsPanel({ data }: { data: LoadedEvent }) {
  const { event, books, mySubmission, windows, now } = data;
  return (
    <>
      <Card>
        <SectionTitle>Suggest a book</SectionTitle>
        {windows.submissions ? (
          <>
            <p className="mb-4 text-sm text-muted">
              One suggestion per member, optional. Closes {formatTimeLeft(event.submissions_close_at, now)} (
              {formatDateTime(event.submissions_close_at)}).
            </p>
            {mySubmission && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
                <span>
                  Your suggestion: <strong>{mySubmission.title}</strong>
                </span>
                <ActionForm action={withdrawSubmission}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <SubmitButton variant="link" pendingText="Removing…">
                    Withdraw
                  </SubmitButton>
                </ActionForm>
              </div>
            )}
            <ActionForm action={submitBook} className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end">
              <input type="hidden" name="eventId" value={event.id} />
              <Field label="Title">
                <input name="title" required maxLength={300} className={inputStyles} placeholder="The Left Hand of Darkness" />
              </Field>
              <Field label="Author (optional)">
                <input name="author" maxLength={200} className={inputStyles} placeholder="Ursula K. Le Guin" />
              </Field>
              <SubmitButton pendingText="Sending…">{mySubmission ? "Replace" : "Suggest"}</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <p className="text-muted">Submissions are closed. The shortlist is coming soon.</p>
        )}
      </Card>
      <Card>
        <SectionTitle>Suggested so far</SectionTitle>
        <BookList books={books} extra={(b) => b.submitters > 1 && <Badge>{b.submitters} members</Badge>} />
      </Card>
    </>
  );
}

function CurationPanel({ data }: { data: LoadedEvent }) {
  return (
    <Card>
      <SectionTitle>Shortlisting in progress</SectionTitle>
      <p className="mb-4 text-muted">
        Submissions are closed. The club admin is picking the shortlist from {data.books.length} suggestion(s) —
        you&apos;ll get an email when voting opens.
      </p>
      <BookList books={data.books} />
    </Card>
  );
}

function VotingPanel({ data }: { data: LoadedEvent }) {
  const { event, now, windows } = data;
  const isRunoff = event.status === "runoff";
  const open = isRunoff ? windows.runoff : windows.voting;
  const closesAt = (isRunoff ? event.runoff_closes_at : event.voting_closes_at)!;
  const books = isRunoff ? data.runoff : data.shortlist;

  return (
    <Card>
      <SectionTitle>{isRunoff ? "Runoff: break the tie" : "Vote for our next book"}</SectionTitle>
      {open ? (
        <>
          <p className="mb-4 text-sm text-muted">
            {isRunoff
              ? "These books tied. Pick one — the runoff is single-vote."
              : "Pick up to two books, one vote per book. Voting is optional."}{" "}
            You can change your vote until it closes {formatTimeLeft(closesAt, now)} ({formatDateTime(closesAt)}).
          </p>
          <VoteForm
            eventId={event.id}
            books={books}
            maxVotes={isRunoff ? 1 : 2}
            initial={isRunoff ? data.myVotes[2] : data.myVotes[1]}
          />
        </>
      ) : (
        <p className="text-muted">Voting has closed — counting votes…</p>
      )}
    </Card>
  );
}

function ReservationsPanel({ data }: { data: LoadedEvent }) {
  const { event, reservations, windows, now } = data;
  const mine = reservations.mine;
  const queuePos = mine?.status === "waitlisted" ? reservations.waitlist.findIndex((r) => r.id === mine.id) + 1 : 0;
  const seatsFull = reservations.confirmed.length + reservations.invited.length >= event.capacity;
  const hidden = <input type="hidden" name="eventId" value={event.id} />;

  return (
    <>
      {windows.reservations && (
        <Card>
          <SectionTitle>Your seat</SectionTitle>
          {mine?.status === "confirmed" && (
            <ActionForm action={cancelReservation} className="flex flex-wrap items-center justify-between gap-3">
              {hidden}
              <p>
                <Badge tone="success">Confirmed</Badge> <span className="ml-2">You have a seat. See you there!</span>
              </p>
              <SubmitButton variant="danger" pendingText="Cancelling…">
                I can&apos;t make it
              </SubmitButton>
            </ActionForm>
          )}
          {mine?.status === "invited" && (
            <div className="space-y-3">
              <p>
                <Badge tone="accent">Seat offered</Badge>{" "}
                <span className="ml-2">
                  A seat opened up for you! Accept {formatTimeLeft(mine.invite_expires_at!, now)} (by{" "}
                  {formatDateTime(mine.invite_expires_at!)}) or it goes to the next person.
                </span>
              </p>
              <div className="flex gap-3">
                <ActionForm action={acceptInvite}>
                  {hidden}
                  <SubmitButton pendingText="Accepting…">Accept my seat</SubmitButton>
                </ActionForm>
                <ActionForm action={cancelReservation}>
                  {hidden}
                  <SubmitButton variant="secondary" pendingText="Declining…">
                    Decline
                  </SubmitButton>
                </ActionForm>
              </div>
            </div>
          )}
          {mine?.status === "waitlisted" && (
            <ActionForm action={cancelReservation} className="flex flex-wrap items-center justify-between gap-3">
              {hidden}
              <p>
                <Badge>Waitlist #{queuePos}</Badge>
                <span className="ml-2">We&apos;ll email you if a seat frees up. You&apos;ll have 3 hours to accept.</span>
              </p>
              <SubmitButton variant="secondary" pendingText="Leaving…">
                Leave the waitlist
              </SubmitButton>
            </ActionForm>
          )}
          {(!mine || mine.status === "cancelled" || mine.status === "expired") && (
            <ActionForm action={reserveSpot} className="flex flex-wrap items-center justify-between gap-3">
              {hidden}
              <p className="text-muted">
                {seatsFull
                  ? "All seats are taken. Join the waitlist — first come, first served."
                  : `${event.capacity - reservations.confirmed.length - reservations.invited.length} seat(s) left.`}
              </p>
              <SubmitButton pendingText="Reserving…">{seatsFull ? "Join the waitlist" : "Reserve my seat"}</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}
      <Card>
        <SectionTitle>Who&apos;s coming</SectionTitle>
        {reservations.confirmed.length === 0 ? (
          <Empty>No one yet — be the first!</Empty>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {reservations.confirmed.map((r) => (
              <li key={r.id} className="rounded-full bg-paper px-3 py-1 text-sm">
                {memberName(r.member)}
              </li>
            ))}
          </ul>
        )}
        {reservations.waitlist.length > 0 && (
          <>
            <h3 className="mt-6 mb-2 text-sm font-semibold text-muted">Waitlist</h3>
            <ol className="list-inside list-decimal text-sm text-muted">
              {reservations.waitlist.map((r) => (
                <li key={r.id}>{memberName(r.member)}</li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </>
  );
}

function ResultsPanel({ data }: { data: LoadedEvent }) {
  const round1 = [...data.shortlist].sort((a, b) => b.votes[1] - a.votes[1]);
  const round2 = [...data.runoff].sort((a, b) => b.votes[2] - a.votes[2]);
  const hadRunoff = round2.length > 0 && data.event.runoff_closes_at;
  return (
    <Card>
      <SectionTitle>Vote results</SectionTitle>
      <BookList books={round1} extra={(b) => <Badge tone={b.id === data.winner?.id ? "success" : "neutral"}>{b.votes[1]} votes</Badge>} />
      {hadRunoff && (
        <>
          <h3 className="mt-6 mb-2 text-sm font-semibold text-muted">Runoff</h3>
          <BookList books={round2} extra={(b) => <Badge tone={b.id === data.winner?.id ? "success" : "neutral"}>{b.votes[2]} votes</Badge>} />
        </>
      )}
    </Card>
  );
}
