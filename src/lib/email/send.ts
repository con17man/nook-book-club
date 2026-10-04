import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
import { renderEmail, type EmailPayload } from "./templates";

export type OutgoingEmail = { to: string; template: string; payload: EmailPayload };

let client: Resend | null = null;
function resend() {
  const key = serverEnv.resendApiKey;
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

/** Sends up to 100 emails in one Resend batch call. Logs instead when RESEND_API_KEY is unset. */
export async function sendEmails(emails: OutgoingEmail[]): Promise<{ error?: string }> {
  if (emails.length === 0) return {};
  const messages = emails.map(({ to, template, payload }) => ({
    from: serverEnv.emailFrom,
    to,
    ...renderEmail(template, payload),
  }));

  const api = resend();
  if (!api) {
    for (const m of messages) console.info(`[email:dev] to=${m.to} subject="${m.subject}"\n${m.text}\n`);
    return {};
  }

  const { error } = await api.batch.send(messages);
  return error ? { error: error.message } : {};
}

export async function sendEmail(email: OutgoingEmail) {
  return sendEmails([email]);
}
