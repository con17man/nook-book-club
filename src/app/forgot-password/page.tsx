import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageTitle, buttonStyles, inputStyles } from "@/components/ui";
import { requestPasswordReset } from "../auth/actions";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Account" title="Reset your password">
        We&apos;ll email you a link to choose a new one.
      </PageTitle>
      <Card>
        <ActionForm action={requestPasswordReset} className="space-y-4">
          <Field label="Email">
            <input name="email" type="email" required className={inputStyles} autoComplete="email" />
          </Field>
          <div className="flex items-center justify-between">
            <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
            <Link href="/login" className={buttonStyles.link}>
              Back to sign in
            </Link>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
