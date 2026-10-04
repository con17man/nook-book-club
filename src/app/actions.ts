"use server";

import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { mutate } from "@/lib/mutate";

const eventId = (formData: FormData) => String(formData.get("eventId") ?? "");

export async function submitBook(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ title: z.string().trim().min(1, "Enter a title.").max(300), author: z.string().trim().max(200) })
    .safeParse({ title: formData.get("title"), author: formData.get("author") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return mutate(
    (db) =>
      db.rpc("submit_book", {
        p_event_id: eventId(formData),
        p_title: parsed.data.title,
        p_author: parsed.data.author || null,
      }),
    "Thanks! Your suggestion is in.",
  );
}

export async function withdrawSubmission(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.rpc("withdraw_submission", { p_event_id: eventId(formData) }));
}

export async function castVotes(_: ActionState, formData: FormData): Promise<ActionState> {
  const bookIds = formData.getAll("bookIds").map(String);
  return mutate(
    (db) => db.rpc("cast_votes", { p_event_id: eventId(formData), p_book_ids: bookIds }),
    bookIds.length ? "Your vote is saved. You can change it until voting closes." : "Your votes were cleared.",
  );
}

export async function reserveSpot(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.rpc("reserve_spot", { p_event_id: eventId(formData) }));
}

export async function acceptInvite(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.rpc("accept_invite", { p_event_id: eventId(formData) }), "You're in! See you there.");
}

export async function cancelReservation(_: ActionState, formData: FormData): Promise<ActionState> {
  return mutate((db) => db.rpc("cancel_reservation", { p_event_id: eventId(formData) }));
}
