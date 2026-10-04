import { serverEnv } from "@/lib/env";
import { formatDateTime, formatLongDateTime } from "@/lib/time";

export type EmailContent = { subject: string; text: string; html: string };

/** Payload written by SQL (private.event_payload + extras) or by server actions. */
export type EmailPayload = {
  event_id?: string;
  event_title?: string;
  starts_at?: string;
  location?: string;
  capacity?: number;
  book_title?: string | null;
  book_author?: string | null;
  closes_at?: string;
  expires_at?: string;
  book_count?: number;
  books?: string[];
  link?: string;
  invited_by?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(lines: string[], cta?: { label: string; url: string }): Pick<EmailContent, "text" | "html"> {
  const text = [...lines, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n");
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:Georgia,serif;color:#2b2118">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eadfce;border-radius:12px;padding:28px">
    <p style="margin:0 0 20px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#9a6b3f">Nook Book Club</p>
    ${lines.map((l) => (l ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${escapeHtml(l)}</p>` : "")).join("\n    ")}
    ${
      cta
        ? `<p style="margin:24px 0 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#7c4a24;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px">${escapeHtml(cta.label)}</a></p>`
        : ""
    }
  </div>
</body></html>`;
  return { text, html };
}

const book = (p: EmailPayload) => (p.book_author ? `“${p.book_title}” by ${p.book_author}` : `“${p.book_title}”`);
const when = (iso?: string) => (iso ? formatLongDateTime(iso) : "");
const until = (iso?: string) => (iso ? formatDateTime(iso) : "soon");

export function renderEmail(template: string, p: EmailPayload): EmailContent {
  const home = serverEnv.siteUrl;
  const admin = p.event_id ? `${home}/admin/events/${p.event_id}` : `${home}/admin`;

  switch (template) {
    case "member_invite":
      return {
        subject: "You're invited to the Nook Book Club",
        ...layout(
          [
            `${p.invited_by ?? "The club admin"} has invited you to join the Nook Book Club.`,
            "Click below to set up your account. The link can only be used once.",
          ],
          { label: "Join the club", url: p.link! },
        ),
      };
    case "password_reset":
      return {
        subject: "Reset your Nook Book Club password",
        ...layout(["Someone asked to reset your password. If that wasn't you, ignore this email."], {
          label: "Choose a new password",
          url: p.link!,
        }),
      };
    case "event_created":
      return {
        subject: `New meetup: ${p.event_title} — suggest a book`,
        ...layout(
          [
            `We're meeting on ${when(p.starts_at)} at ${p.location}.`,
            `Suggest one book until ${until(p.closes_at)}. It's optional — skip it if nothing comes to mind.`,
          ],
          { label: "Suggest a book", url: home },
        ),
      };
    case "curation_ready":
      return {
        subject: `Submissions closed for ${p.event_title}`,
        ...layout([`Members suggested ${p.book_count ?? 0} book(s). Time to pick the shortlist and start the vote.`], {
          label: "Curate the shortlist",
          url: admin,
        }),
      };
    case "voting_open":
      return {
        subject: `Vote for the next book — ${p.event_title}`,
        ...layout(
          [
            "The shortlist is ready! You can vote for up to two books (one vote per book).",
            `Voting closes ${until(p.closes_at)}. You can change your votes until then.`,
          ],
          { label: "Vote now", url: home },
        ),
      };
    case "runoff_open":
      return {
        subject: `It's a tie! Runoff vote — ${p.event_title}`,
        ...layout(
          [
            `We have a tie between: ${(p.books ?? []).join(", ")}.`,
            `Pick one book in the runoff before ${until(p.closes_at)}.`,
          ],
          { label: "Vote in the runoff", url: home },
        ),
      };
    case "tiebreak_needed":
      return {
        subject: `Runoff tied — pick the winner for ${p.event_title}`,
        ...layout(["The runoff ended in another tie. Please pick the winning book."], {
          label: "Pick the winner",
          url: admin,
        }),
      };
    case "reservations_open":
      return {
        subject: `We're reading ${p.book_title} — reserve your seat`,
        ...layout(
          [
            `The winner is ${book(p)}.`,
            `We meet on ${when(p.starts_at)} at ${p.location}. There are ${p.capacity} seats — first come, first served.`,
          ],
          { label: "Reserve my seat", url: home },
        ),
      };
    case "spot_invite":
      return {
        subject: `A seat opened up for ${p.event_title}`,
        ...layout(
          [
            `Good news — a seat freed up and you're next in line for ${p.event_title} (${book(p)}).`,
            `Accept before ${until(p.expires_at)} or it goes to the next person in the queue.`,
          ],
          { label: "Accept my seat", url: home },
        ),
      };
    case "invite_expired":
      return {
        subject: `Your seat offer for ${p.event_title} expired`,
        ...layout(
          [
            "The seat offer expired and was passed to the next person in line.",
            "You can join the waitlist again if you'd still like to come.",
          ],
          { label: "Open the club", url: home },
        ),
      };
    case "event_cancelled":
      return {
        subject: `Cancelled: ${p.event_title}`,
        ...layout([`${p.event_title} has been cancelled. Sorry about that — see you next time!`]),
      };
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}
