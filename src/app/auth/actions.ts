"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { sendEmail } from "@/lib/email/send";
import { confirmLink, OTP_TYPES } from "@/lib/auth-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  if (error) return { error: "Wrong email or password." };
  redirect("/");
}

export async function requestPasswordReset(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { error: "Enter a valid email address." };

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: email.data });
  // Same answer whether or not the account exists.
  if (!error && data.properties) {
    const link = confirmLink(data.properties.hashed_token, "recovery", "/auth/set-password");
    await sendEmail({ to: email.data, template: "password_reset", payload: { link } });
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
  redirect(safeNext(formData.get("next")));
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
  redirect("/");
}
