import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageTitle, SectionTitle, inputStyles } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inviteMember, removeMember, setRole } from "../actions";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: members } = await supabase.from("profiles").select("*").order("created_at");

  return (
    <div className="space-y-6">
      <PageTitle eyebrow="Admin" title="Members">
        The club is invite-only. New members get an email link to set up their account.
      </PageTitle>

      <Card>
        <SectionTitle>Invite someone</SectionTitle>
        <ActionForm action={inviteMember} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
          <Field label="Email">
            <input name="email" type="email" required className={inputStyles} placeholder="reader@example.com" />
          </Field>
          <Field label="Name (optional)">
            <input name="fullName" maxLength={100} className={inputStyles} />
          </Field>
          <SubmitButton pendingText="Sending…">Send invite</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <SectionTitle>Everyone ({members?.length ?? 0})</SectionTitle>
        <ul className="divide-y divide-line">
          {members?.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-medium">{m.full_name ?? "—"}</span>
                <span className="ml-2 text-sm text-muted">{m.email}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {m.role === "admin" && <Badge tone="accent">Admin</Badge>}
                {!m.onboarded_at && <Badge>Invite pending</Badge>}
                {m.id !== me.id && (
                  <>
                    {!m.onboarded_at && (
                      <ActionForm action={inviteMember}>
                        <input type="hidden" name="email" value={m.email} />
                        <SubmitButton variant="link" pendingText="Sending…">
                          Resend invite
                        </SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm action={setRole}>
                      <input type="hidden" name="userId" value={m.id} />
                      <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                      <SubmitButton variant="link" pendingText="…">
                        {m.role === "admin" ? "Make member" : "Make admin"}
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={removeMember}>
                      <input type="hidden" name="userId" value={m.id} />
                      <SubmitButton variant="link" pendingText="Removing…" className="text-danger">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
