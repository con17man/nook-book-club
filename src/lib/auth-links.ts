import "server-only";
import { serverEnv } from "@/lib/env";

/** OTP types our email links use: invite (new member), recovery (reset), email (re-sent invite). */
export const OTP_TYPES = ["invite", "recovery", "email"] as const;
export type LinkType = (typeof OTP_TYPES)[number];

/**
 * Link to our own /auth/confirm page (not Supabase's verify URL), so the token is
 * only consumed when the person clicks "Continue" — email scanners that pre-fetch
 * links can't burn it.
 */
export function confirmLink(hashedToken: string, type: LinkType, next: string) {
  const params = new URLSearchParams({ token_hash: hashedToken, type, next });
  return `${serverEnv.siteUrl}/auth/confirm?${params}`;
}
