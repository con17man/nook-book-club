import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmails } from "./send";
import type { EmailPayload } from "./templates";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 100; // Resend batch limit

/**
 * Sends pending rows from public.email_outbox (written by SQL functions).
 * Rows are claimed with an optimistic lock on `attempts`, so concurrent
 * flushes (cron + an action's after()) don't double-send.
 */
export async function flushOutbox() {
  const db = createAdminClient();
  const { data: pending, error } = await db
    .from("email_outbox")
    .select("*")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("id")
    .limit(BATCH_SIZE);
  if (error) throw error;

  const claimed = [];
  for (const row of pending ?? []) {
    const { data } = await db
      .from("email_outbox")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .is("sent_at", null)
      .select("id")
      .maybeSingle();
    if (data) claimed.push(row);
  }
  if (claimed.length === 0) return { sent: 0 };

  const ids = claimed.map((r) => r.id);
  const result = await sendEmails(
    claimed.map((r) => ({ to: r.to_email, template: r.template, payload: r.payload as EmailPayload })),
  );

  if (result.error) {
    await db.from("email_outbox").update({ last_error: result.error }).in("id", ids);
    return { sent: 0, error: result.error };
  }
  await db.from("email_outbox").update({ sent_at: new Date().toISOString(), last_error: null }).in("id", ids);
  return { sent: claimed.length };
}
