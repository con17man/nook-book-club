// Centralised env access. Server-only values must never be imported by client components.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

// Getters keep the literal `process.env.NEXT_PUBLIC_*` reads (so Next can inline them)
// while deferring the check until first use.
export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
};

export const serverEnv = {
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
  get siteUrl() {
    return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get cronSecret() {
    return required("CRON_SECRET", process.env.CRON_SECRET);
  },
  /** When unset, emails are logged to the console instead of sent (handy in dev). */
  get resendApiKey() {
    return process.env.RESEND_API_KEY;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "Nook Book Club <onboarding@resend.dev>";
  },
};

/** IANA timezone the club meets in. Used to read/display event times. */
export const CLUB_TIMEZONE = process.env.NEXT_PUBLIC_CLUB_TIMEZONE ?? "UTC";
