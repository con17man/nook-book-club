import "server-only";
import type { Book, BookEvent, EventStatus, Reservation } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

export const STATUS_LABELS: Record<EventStatus, string> = {
  submissions: "Suggest a book",
  curation: "Shortlisting",
  voting: "Voting",
  runoff: "Runoff vote",
  tiebreak: "Picking the winner",
  reservations: "Seats open",
  completed: "Done",
  cancelled: "Cancelled",
};

export const ACTIVE_STATUSES: EventStatus[] = ["submissions", "curation", "voting", "runoff", "tiebreak", "reservations"];

/** The event currently in flight (at most one), or null. */
export async function getActiveEvent() {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").in("status", ACTIVE_STATUSES).maybeSingle();
  return data;
}

export async function listPastEvents() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, status, winning_book:books!events_winning_book_id_fkey(title, author)")
    .in("status", ["completed", "cancelled"])
    .order("starts_at", { ascending: false })
    .limit(24);
  return data ?? [];
}

export type BookWithStats = Book & { submitters: number; votes: { 1: number; 2: number } };
export type ReservationWithMember = Reservation & { member: { full_name: string | null; email: string } | null };

/** Everything the event page needs, from the signed-in member's point of view. */
export async function loadEvent(eventId: string, userId: string) {
  const supabase = await createClient();
  const [event, books, submissions, myVotes, results, reservations] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).maybeSingle(),
    supabase.from("books").select("*").eq("event_id", eventId).order("created_at"),
    supabase.from("submissions").select("user_id, book_id").eq("event_id", eventId),
    supabase.from("votes").select("round, book_id").eq("event_id", eventId).eq("user_id", userId),
    supabase.rpc("get_vote_results", { p_event_id: eventId }),
    supabase
      .from("reservations")
      .select("*, member:profiles!reservations_user_id_fkey(full_name, email)")
      .eq("event_id", eventId)
      .order("queued_at"),
  ]);
  const ev = event.data;
  if (!ev) return null;

  const tally = (round: 1 | 2, bookId: string) =>
    (results.data ?? []).find((r) => r.round === round && r.book_id === bookId)?.votes ?? 0;

  const allBooks: BookWithStats[] = (books.data ?? []).map((b) => ({
    ...b,
    submitters: (submissions.data ?? []).filter((s) => s.book_id === b.id).length,
    votes: { 1: Number(tally(1, b.id)), 2: Number(tally(2, b.id)) },
  }));

  const allReservations = (reservations.data ?? []) as ReservationWithMember[];
  const now = Date.now();

  return {
    event: ev,
    now,
    books: allBooks,
    shortlist: allBooks.filter((b) => b.shortlisted),
    runoff: allBooks.filter((b) => b.in_runoff),
    winner: allBooks.find((b) => b.id === ev.winning_book_id) ?? null,
    submissionCount: submissions.data?.length ?? 0,
    mySubmission: allBooks.find((b) => b.id === submissions.data?.find((s) => s.user_id === userId)?.book_id) ?? null,
    myVotes: {
      1: (myVotes.data ?? []).filter((v) => v.round === 1).map((v) => v.book_id),
      2: (myVotes.data ?? []).filter((v) => v.round === 2).map((v) => v.book_id),
    },
    hasResults: (results.data ?? []).length > 0,
    reservations: {
      confirmed: allReservations.filter((r) => r.status === "confirmed"),
      invited: allReservations.filter((r) => r.status === "invited"),
      waitlist: allReservations.filter((r) => r.status === "waitlisted"),
      mine: allReservations.find((r) => r.user_id === userId) ?? null,
    },
    windows: windows(ev, now),
  };
}

export type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

/** Whether each time-boxed window is open right now (the DB enforces the same rules). */
function windows(event: BookEvent, now: number) {
  const before = (iso: string | null) => !!iso && now < new Date(iso).getTime();
  return {
    submissions: event.status === "submissions" && before(event.submissions_close_at),
    voting: event.status === "voting" && before(event.voting_closes_at),
    runoff: event.status === "runoff" && before(event.runoff_closes_at),
    reservations: event.status === "reservations" && before(event.starts_at),
  };
}

export function memberName(member: { full_name: string | null; email: string } | null) {
  return member?.full_name || member?.email.split("@")[0] || "Former member";
}
