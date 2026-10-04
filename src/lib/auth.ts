import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The signed-in member's profile, or null. Deduplicated per request. */
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return profile;
});

/** Use in pages: signed in and onboarded (has set a name + password). */
export async function requireMember() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) redirect("/auth/set-password");
  return profile;
}

export async function requireAdmin() {
  const profile = await requireMember();
  if (profile.role !== "admin") notFound();
  return profile;
}
