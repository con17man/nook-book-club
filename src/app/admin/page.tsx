import Link from "next/link";
import { Badge, Card, Empty, PageTitle, SectionTitle, buttonStyles } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { STATUS_LABELS } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: events } = await supabase.from("events").select("*").order("starts_at", { ascending: false }).limit(50);
  const active = events?.find((e) => !["completed", "cancelled"].includes(e.status));

  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Admin" title="Club meetups" />
      {active ? (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent uppercase">Current meetup</p>
            <p className="font-serif text-xl font-semibold">{active.title}</p>
            <p className="text-sm text-muted">{formatDateTime(active.starts_at)}</p>
          </div>
          <Link href={`/admin/events/${active.id}`} className={buttonStyles.primary}>
            Manage
          </Link>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted">No meetup in progress.</p>
          <Link href="/admin/events/new" className={buttonStyles.primary}>
            Plan the next meetup
          </Link>
        </Card>
      )}

      <section>
        <SectionTitle>All meetups</SectionTitle>
        {!events?.length ? (
          <Empty>No meetups yet.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/events/${e.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-paper">
                  <span>
                    <span className="font-medium">{e.title}</span>
                    <span className="ml-2 text-sm text-muted">{formatDateTime(e.starts_at)}</span>
                  </span>
                  <Badge>{STATUS_LABELS[e.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
