import Link from "next/link";
import { EventView } from "@/components/event/event-view";
import { Card, Empty, PageTitle, SectionTitle } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { getActiveEvent, listPastEvents, loadEvent } from "@/lib/events";
import { formatDateTime } from "@/lib/time";

export default async function HomePage() {
  const profile = await requireMember();
  const [active, past] = await Promise.all([getActiveEvent(), listPastEvents()]);
  const data = active ? await loadEvent(active.id, profile.id) : null;

  return (
    <div className="space-y-10">
      {data ? (
        <EventView data={data} />
      ) : (
        <>
          <PageTitle eyebrow={`Hi ${profile.full_name ?? "there"}`} title="No meetup planned yet">
            You&apos;ll get an email as soon as the next one is announced.
          </PageTitle>
          {profile.role === "admin" && (
            <Card>
              <Link href="/admin/events/new" className="font-medium text-accent hover:underline">
                Plan the next meetup →
              </Link>
            </Card>
          )}
        </>
      )}

      <section>
        <SectionTitle>Past meetups</SectionTitle>
        {past.length === 0 ? (
          <Empty>Our story starts with the next meetup.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {past.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="block rounded-xl border border-line bg-card p-4 hover:bg-accent-soft/40">
                  <p className="text-xs text-muted">{formatDateTime(e.starts_at)}</p>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted">
                    {e.status === "cancelled" ? "Cancelled" : (e.winning_book?.title ?? "—")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
