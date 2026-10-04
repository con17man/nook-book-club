import { SubmitButton } from "@/components/action-form";
import { Field, inputStyles } from "@/components/ui";
import type { BookEvent } from "@/lib/types";
import { CLUB_TIMEZONE } from "@/lib/env";
import { dateToWallTime } from "@/lib/time";

/** Shared fields for creating and editing an event. Render inside an <ActionForm>. */
export function EventFields({ event, submitLabel }: { event?: BookEvent; submitLabel: string }) {
  return (
    <div className="space-y-4">
      {event && <input type="hidden" name="eventId" value={event.id} />}
      <Field label="Title">
        <input name="title" required maxLength={200} defaultValue={event?.title} className={inputStyles} placeholder="October meetup" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date & time" hint={`Club time (${CLUB_TIMEZONE})`}>
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={event ? dateToWallTime(event.starts_at) : undefined}
            className={inputStyles}
          />
        </Field>
        <Field label="Seats" hint="Depends on the venue (usually 20–30).">
          <input name="capacity" type="number" min={1} max={500} required defaultValue={event?.capacity ?? 25} className={inputStyles} />
        </Field>
      </div>
      <Field label="Location">
        <input name="location" required maxLength={300} defaultValue={event?.location} className={inputStyles} placeholder="The Nook Café, 12 Main St" />
      </Field>
      <Field label="Notes (optional)">
        <textarea name="description" rows={3} maxLength={5000} defaultValue={event?.description ?? ""} className={inputStyles} />
      </Field>
      <SubmitButton>{submitLabel}</SubmitButton>
    </div>
  );
}
