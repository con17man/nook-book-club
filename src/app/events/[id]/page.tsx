import { notFound } from "next/navigation";
import { EventView } from "@/components/event/event-view";
import { requireMember } from "@/lib/auth";
import { loadEvent } from "@/lib/events";

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const profile = await requireMember();
  const data = await loadEvent(id, profile.id).catch(() => null);
  if (!data) notFound();
  return <EventView data={data} />;
}
