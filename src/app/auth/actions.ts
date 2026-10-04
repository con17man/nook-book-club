"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { sendEmail } from "@/lib/email/send";
import { confirmLink, OTP_TYPES } from "@/lib/auth-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** The header (root layout) depends on who is signed in, so re-render it after auth changes. */
function refreshLayoutAndRedirect(path: string): never {
  revalidatePath("/", "layout");
  redirect(path);
}

/** Keep redirects on our own site. */
function safeNext(next: FormDataEntryValue | null) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error?.code === "invalid_credentials") return { error: "Wrong email or password." };
  if (error) {
    console.error("[auth] sign-in failed", error);
    return { error: "We couldn't sign you in right now. Please try again." };
  }
  refreshLayoutAndRedirect("/");
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Enter a valid email address." };

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: email.data });
  // Same answer whether or not the account exists.
  if (!error && data.properties) {
    const link = confirmLink(data.properties.hashed_token, "recovery", "/auth/set-password");
    const sent = await sendEmail({ to: email.data, template: "password_reset", payload: { link } });
    if (sent.error) console.error("[auth] password reset email failed", sent.error);
  }
  return { success: "If that email belongs to a member, a reset link is on its way." };
}

/** Exchanges the one-time token from an email link for a session. */
export async function verifyEmailLink(_: ActionState, formData: FormData): Promise<ActionState> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  if (typeof tokenHash !== "string" || !OTP_TYPES.includes(type as (typeof OTP_TYPES)[number])) {
    return { error: "This link is invalid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  if (error) return { error: "This link has expired or was already used. Ask the club admin for a new one." };
  refreshLayoutAndRedirect(safeNext(formData.get("next")));
}

export async function setPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      fullName: z.string().trim().min(1, "Tell us your name.").max(100),
      password: z.string().min(8, "Use at least 8 characters."),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: "Passwords don't match." })
    .safeParse({
      fullName: formData.get("fullName"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { error: pwError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (pwError) return { error: pwError.message };

  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", userId);
  if (error) return { error: error.message };
  refreshLayoutAndRedirect("/");
}
