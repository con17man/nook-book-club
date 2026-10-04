import { ActionForm } from "@/components/action-form";
import { EventFields } from "@/components/event-form";
import { Card, PageTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createEvent } from "../../actions";

export const metadata = { title: "New meetup" };

export default async function NewEventPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle eyebrow="Admin" title="Plan a meetup">
        Creating it opens book suggestions for 24 hours and emails every member.
      </PageTitle>
      <Card>
        <ActionForm action={createEvent}>
          <EventFields submitLabel="Create and open suggestions" />
        </ActionForm>
      </Card>
    </div>
  );
}
