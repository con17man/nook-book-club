import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageTitle } from "@/components/ui";
import { verifyEmailLink } from "../actions";

export const metadata = { title: "Continue" };

export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash, type, next } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Welcome" title={type === "recovery" ? "Reset your password" : "Join the club"} />
      <Card>
        <ActionForm action={verifyEmailLink} className="space-y-4">
          <input type="hidden" name="token_hash" value={String(token_hash ?? "")} />
          <input type="hidden" name="type" value={String(type ?? "")} />
          <input type="hidden" name="next" value={String(next ?? "/")} />
          <p className="text-sm text-muted">Click continue to verify your link and set your password.</p>
          <SubmitButton pendingText="Verifying…">Continue</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
