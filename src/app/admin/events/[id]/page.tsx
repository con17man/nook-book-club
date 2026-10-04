import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EventFields } from "@/components/event-form";
import { Badge, Card, Empty, Field, PageTitle, SectionTitle, buttonStyles, inputStyles } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { STATUS_LABELS, memberName, type LoadedEvent } from "@/lib/events";
import { loadEvent } from "@/lib/events";
import { formatDateTime, formatTimeLeft } from "@/lib/time";
import {
  addBook,
  cancelEvent,
  pickWinner,
  removeBook,
  runScheduler,
  setShortlisted,
  startVoting,
  updateEvent,
} from "../../actions";

export default async function AdminEventPage({ params }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const profile = await requireAdmin();
  const data = await loadEvent(id, profile.id).catch(() => null);
  if (!data) notFound();
  const { event } = data;
  const finished = event.status === "completed" || event.status === "cancelled";

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Manage meetup" title={event.title}>
        <span className="flex flex-wrap items-center gap-3">
          <Badge tone="accent">{STATUS_LABELS[event.status]}</Badge>
          <NextDeadline data={data} />
          <Link href={event.status === "completed" || event.status === "cancelled" ? `/events/${event.id}` : "/"} className={buttonStyles.link}>
            Member view →
          </Link>
        </span>
      </PageTitle>

      {(event.status === "submissions" || event.status === "curation") && <CurationSection data={data} />}
      {(event.status === "voting" || event.status === "runoff") && <LiveTally data={data} />}
      {event.status === "tiebreak" && <TiebreakSection data={data} />}
      {(event.status === "reservations" || event.status === "completed") && <SeatsSection data={data} />}

      {!finished && (
        <Card>
          <SectionTitle>Details</SectionTitle>
          <ActionForm action={updateEvent}>
            <EventFields event={event} submitLabel="Save details" />
          </ActionForm>
        </Card>
      )}

      {!finished && (
        <Card className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-sm">
            <SectionTitle>Scheduler</SectionTitle>
            <p className="text-sm text-muted">
              Deadlines are processed automatically every minute. Use this if you just want to nudge things along
              (e.g. in development).
            </p>
            <ActionForm action={runScheduler} className="mt-3">
              <SubmitButton variant="secondary" pendingText="Running…">
                Process deadlines now
              </SubmitButton>
            </ActionForm>
          </div>
          <div className="max-w-sm">
            <SectionTitle>Danger zone</SectionTitle>
            <ActionForm action={cancelEvent}>
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton variant="danger" pendingText="Cancelling…">
                Cancel this meetup
              </SubmitButton>
            </ActionForm>
          </div>
        </Card>
      )}
    </div>
  );
}

function NextDeadline({ data: { event, now } }: { data: LoadedEvent }) {
  const deadline =
    event.status === "submissions"
      ? ["Suggestions close", event.submissions_close_at]
      : event.status === "voting"
        ? ["Voting closes", event.voting_closes_at]
        : event.status === "runoff"
          ? ["Runoff closes", event.runoff_closes_at]
          : null;
  if (!deadline?.[1]) return <span className="text-sm">Meetup {formatDateTime(event.starts_at)}</span>;
  return (
    <span className="text-sm">
      {deadline[0]} {formatTimeLeft(deadline[1], now)} ({formatDateTime(deadline[1])})
    </span>
  );
}

function CurationSection({ data }: { data: LoadedEvent }) {
  const { event, books, shortlist, windows } = data;
  const canStart = !windows.submissions && shortlist.length >= 2 && shortlist.length <= 10;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Shortlist ({shortlist.length}/10)</SectionTitle>
        <ActionForm action={startVoting}>
          <input type="hidden" name="eventId" value={event.id} />
          <SubmitButton disabled={!canStart} pendingText="Opening…">
            Start 24h vote
          </SubmitButton>
        </ActionForm>
      </div>
      <p className="mb-4 text-sm text-muted">
        {windows.submissions
          ? `Members can still suggest books until ${formatDateTime(event.submissions_close_at)}. You can start shortlisting already.`
          : "Pick 5–10 books (minimum 2) for the vote."}
      </p>

      {books.length === 0 ? (
        <Empty>No suggestions yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {books.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-medium">{b.title}</span>
                {b.author && <span className="text-muted"> — {b.author}</span>}
                {b.submitters > 0 && <span className="ml-2 text-xs text-muted">({b.submitters} suggested)</span>}
              </span>
              <span className="flex items-center gap-2">
                <ActionForm action={setShortlisted}>
                  <input type="hidden" name="bookId" value={b.id} />
                  <input type="hidden" name="shortlisted" value={String(!b.shortlisted)} />
                  <SubmitButton variant={b.shortlisted ? "primary" : "secondary"} pendingText="…">
                    {b.shortlisted ? "✓ Shortlisted" : "Shortlist"}
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={removeBook}>
                  <input type="hidden" name="bookId" value={b.id} />
                  <SubmitButton variant="link" pendingText="…" className="text-danger">
                    Remove
                  </SubmitButton>
                </ActionForm>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ActionForm action={addBook} className="mt-6 grid gap-3 border-t border-line pt-6 sm:grid-cols-[2fr_1.5fr_auto] sm:items-end">
        <input type="hidden" name="eventId" value={event.id} />
        <Field label="Add a book yourself">
          <input name="title" required maxLength={300} className={inputStyles} placeholder="Title" />
        </Field>
        <Field label="Author">
          <input name="author" maxLength={200} className={inputStyles} placeholder="Optional" />
        </Field>
        <SubmitButton variant="secondary">Add</SubmitButton>
      </ActionForm>
    </Card>
  );
}

function LiveTally({ data }: { data: LoadedEvent }) {
  const round = data.event.status === "runoff" ? 2 : 1;
  const books = [...(round === 2 ? data.runoff : data.shortlist)].sort((a, b) => b.votes[round] - a.votes[round]);
  return (
    <Card>
      <SectionTitle>Live tally {round === 2 && "(runoff)"}</SectionTitle>
      <p className="mb-4 text-sm text-muted">Only admins see this while voting is open.</p>
      <ul className="divide-y divide-line">
        {books.map((b) => (
          <li key={b.id} className="flex items-center justify-between py-3">
            <span className="font-medium">{b.title}</span>
            <Badge>{b.votes[round]} votes</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TiebreakSection({ data }: { data: LoadedEvent }) {
  return (
    <Card>
      <SectionTitle>The runoff tied — pick the winner</SectionTitle>
      <ul className="space-y-2">
        {data.runoff.map((b) => (
          <li key={b.id}>
            <ActionForm action={pickWinner} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <input type="hidden" name="eventId" value={data.event.id} />
              <input type="hidden" name="bookId" value={b.id} />
              <span>
                <span className="font-medium">{b.title}</span>
                <span className="ml-2 text-sm text-muted">{b.votes[2]} runoff votes</span>
              </span>
              <SubmitButton pendingText="Picking…">Pick this one</SubmitButton>
            </ActionForm>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SeatsSection({ data: { event, reservations, winner, now } }: { data: LoadedEvent }) {
  return (
    <Card>
      <SectionTitle>
        Seats ({reservations.confirmed.length}/{event.capacity})
      </SectionTitle>
      {winner && (
        <p className="mb-4 text-sm text-muted">
          Reading: <strong className="text-ink">{winner.title}</strong>
        </p>
      )}
      <ul className="divide-y divide-line text-sm">
        {reservations.confirmed.map((r) => (
          <li key={r.id} className="flex justify-between py-2">
            <span>{memberName(r.member)}</span>
            <Badge tone="success">Confirmed</Badge>
          </li>
        ))}
        {reservations.invited.map((r) => (
          <li key={r.id} className="flex justify-between py-2">
            <span>{memberName(r.member)}</span>
            <Badge tone="accent">Invited · expires {formatTimeLeft(r.invite_expires_at!, now)}</Badge>
          </li>
        ))}
        {reservations.waitlist.map((r, i) => (
          <li key={r.id} className="flex justify-between py-2">
            <span>{memberName(r.member)}</span>
            <Badge>Waitlist #{i + 1}</Badge>
          </li>
        ))}
      </ul>
      {reservations.confirmed.length + reservations.invited.length + reservations.waitlist.length === 0 && (
        <Empty>No reservations yet.</Empty>
      )}
    </Card>
  );
}
