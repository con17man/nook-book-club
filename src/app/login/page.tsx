import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageTitle, buttonStyles, inputStyles } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";
import { signIn } from "../auth/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentProfile()) redirect("/");

  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Members only" title="Welcome back">
        The Nook is invite-only. Ask the club admin for an invite if you&apos;re new.
      </PageTitle>
      <Card>
        <ActionForm action={signIn} className="space-y-4">
          <Field label="Email">
            <input name="email" type="email" required className={inputStyles} autoComplete="email" />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required className={inputStyles} autoComplete="current-password" />
          </Field>
          <div className="flex items-center justify-between">
            <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
            <Link href="/forgot-password" className={buttonStyles.link}>
              Forgot password?
            </Link>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
