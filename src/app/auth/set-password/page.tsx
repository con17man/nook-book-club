import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageTitle, inputStyles } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";
import { setPassword } from "../actions";

export const metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow={profile.onboarded_at ? "Account" : "Welcome"} title="Set your password">
        Signed in as {profile.email}
      </PageTitle>
      <Card>
        <ActionForm action={setPassword} className="space-y-4">
          <Field label="Your name">
            <input name="fullName" required maxLength={100} defaultValue={profile.full_name ?? ""} className={inputStyles} autoComplete="name" />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <input name="password" type="password" required minLength={8} className={inputStyles} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <input name="confirm" type="password" required minLength={8} className={inputStyles} autoComplete="new-password" />
          </Field>
          <SubmitButton>Save and continue</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
