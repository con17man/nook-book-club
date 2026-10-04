import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

export async function SiteHeader() {
  const profile = await getCurrentProfile();

  return (
    <header className="border-b border-line bg-card/70 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-serif text-xl font-semibold tracking-tight">
          Nook <span className="text-accent">Book Club</span>
        </Link>
        {profile?.onboarded_at && (
          <nav className="flex items-center gap-4 text-sm">
            {profile.role === "admin" && (
              <>
                <Link href="/admin" className="text-muted hover:text-ink">
                  Admin
                </Link>
                <Link href="/admin/members" className="text-muted hover:text-ink">
                  Members
                </Link>
              </>
            )}
            <form action="/auth/signout" method="post">
              <button className="text-muted hover:text-ink" title={profile.email}>
                Sign out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
