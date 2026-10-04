"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth";
import { confirmLink, type LinkType } from "@/lib/auth-links";
import { sendEmail } from "@/lib/email/send";
import { mutate, sendQueuedEmails } from "@/lib/mutate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { wallTimeToDate } from "@/lib/time";

const id = (formData: FormData, key = "eventId") => String(formData.get(key) ?? "");

const eventSchema = z.object({
  title: z.string().trim().min(1, "Give the meetup a title.").max(200),
  description: z.string().trim().max(5000),
  startsAt: z.string().transform((v, ctx) => {
    const date = wallTimeToDate(v);
    if (!date) ctx.addIssue({ code: "custom", message: "Pick a date and time." });
    return date?.toISOString() ?? "";
  }),
  location: z.string().trim().min(1, "Where are we meeting?").max(300),
  capacity: z.coerce.number().int().min(1, "At least one seat.").max(500),
});

function parseEvent(formData: FormData) {
  return eventSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    startsAt: formData.get("startsAt"),
    location: formData.get("location"),
    capacity: formData.get("capacity"),
  });
}

// --- Events ------------------------------------------------------------------

export async function createEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseEvent(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: eventId, error } = await supabase.rpc("create_event", {
    p_title: parsed.data.title,
    p_description: parsed.data.description || null,
    p_starts_at: parsed.data.startsAt,
    p_location: parsed.data.location,
    p_capacity: parsed.data.capacity,
  });
  if (error) return { error: error.message };

  await sendQueuedEmails();
  revalidatePath("/", "layout");
  redirect(`/admin/events/${eventId}`);
}

export async function updateEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseEvent(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { title, description, startsAt, location, capacity } = parsed.data;

  return mutate(
    (db) =>
      db
        .from("events")
        .update({ title, description: description || null, starts_at: startsAt, location, capacity })
        .eq("id", id(formData)),
    "Saved.",
  );
}

export async function startVoting(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.rpc("start_voting", { p_event_id: id(formData) }), "Voting is open. Members were emailed.");
}

export async function pickWinner(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate(
    (db) => db.rpc("pick_winner", { p_event_id: id(formData), p_book_id: id(formData, "bookId") }),
    "Winner picked. Reservations are open.",
  );
}

export async function cancelEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.rpc("cancel_event", { p_event_id: id(formData) }), "Event cancelled.");
}

/** Runs the deadline scheduler now (normally done by the cron job every minute). */
export async function runScheduler(): Promise<ActionState> {
  await requireAdmin();
  const { data, error } = await createAdminClient().rpc("process_deadlines");
  if (error) return { error: error.message };
  await sendQueuedEmails();
  revalidatePath("/", "layout");
  return { success: `Scheduler ran: ${JSON.stringify(data)}` };
}

// --- Books (curation) --------------------------------------------------------

export async function addBook(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ title: z.string().trim().min(1, "Enter a title.").max(300), author: z.string().trim().max(200) })
    .safeParse({ title: formData.get("title"), author: formData.get("author") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return mutate((db) =>
    db.from("books").insert({
      event_id: id(formData),
      title: parsed.data.title,
      author: parsed.data.author || null,
    }),
  );
}

export async function setShortlisted(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) =>
    db
      .from("books")
      .update({ shortlisted: formData.get("shortlisted") === "true" })
      .eq("id", id(formData, "bookId")),
  );
}

export async function removeBook(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.from("books").delete().eq("id", id(formData, "bookId")));
}

// --- Members -----------------------------------------------------------------

export async function inviteMember(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ email: z.email("Enter a valid email.").transform((v) => v.toLowerCase()), fullName: z.string().trim().max(100) })
    .safeParse({ email: String(formData.get("email") ?? "").trim(), fullName: formData.get("fullName") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, fullName } = parsed.data;

  const db = createAdminClient();
  let type: LinkType = "invite";
  let result = await db.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: fullName ? { full_name: fullName } : undefined },
  });

  if (result.error) {
    // The account already exists. If they never finished signing up, send a fresh link.
    const { data: existing } = await db.from("profiles").select("onboarded_at").eq("email", email).maybeSingle();
    if (!existing) return { error: result.error.message };
    if (existing.onboarded_at) return { error: "That person is already a member." };
    type = "email";
    result = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) return { error: result.error.message };
  }

  const link = confirmLink(result.data.properties.hashed_token, type, "/auth/set-password");
  const sent = await sendEmail({
    to: email,
    template: "member_invite",
    payload: { link, invited_by: admin.full_name ?? undefined },
  });
  revalidatePath("/admin/members");
  if (sent.error) return { error: `The account was created but the email failed: ${sent.error}` };
  return { success: `Invite sent to ${email}.` };
}

export async function setRole(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = id(formData, "userId");
  const role = formData.get("role") === "admin" ? "admin" : "member";
  if (userId === admin.id) return { error: "You can't change your own role." };

  // Roles are not user-writable via RLS, so this goes through the service role.
  const { error } = await createAdminClient().from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/members");
  return undefined;
}

export async function removeMember(_: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const userId = id(formData, "userId");
  if (userId === admin.id) return { error: "You can't remove yourself." };

  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return undefined;
}
