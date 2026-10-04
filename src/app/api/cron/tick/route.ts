import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { flushOutbox } from "@/lib/email/outbox";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Advances time-based phases (submission/vote deadlines, invite expiry) and sends
 * queued emails. Call every minute with `Authorization: Bearer $CRON_SECRET`
 * (Supabase pg_cron + pg_net, Vercel Cron, or any external pinger — see README).
 */
async function tick(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: deadlines, error } = await createAdminClient().rpc("process_deadlines");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const emails = await flushOutbox();
  return NextResponse.json({ deadlines, emails });
}

export const GET = tick;
export const POST = tick;
