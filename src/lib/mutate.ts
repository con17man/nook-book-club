import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ActionState } from "@/lib/action-state";
import { flushOutbox } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Runs a mutation as the signed-in user, revalidates the UI and sends any emails
 * the database queued (after the response, so the user doesn't wait).
 */
export async function mutate(
  run: (supabase: Client) => PromiseLike<{ error: { message: string } | null }>,
  success?: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await run(supabase);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  after(sendQueuedEmails);
  return success ? { success } : undefined;
}

export async function sendQueuedEmails() {
  try {
    await flushOutbox();
  } catch (error) {
    console.error("[email] outbox flush failed", error);
  }
}
