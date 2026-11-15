import { NextResponse, type NextRequest } from "next/server";
import { deliverProfileUpdates, retryChangedMatchEmails } from "@/lib/group-service";
import { serverEnv } from "@/lib/env";

// Retries email people one at a time; give it room.
export const maxDuration = 60;

/**
 * Daily backstop: "your giftee updated their profile" emails held back by the throttle, and
 * "your match has changed" emails that failed after an add or remove (retried match-blind,
 * so the response carries counts only).
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Run both even if one fails, then report the failure so the cron run shows as failed.
  const [updates, retries] = [
    await deliverProfileUpdates().then((n) => ({ ok: true as const, n }), (err: unknown) => ({ ok: false as const, err })),
    await retryChangedMatchEmails().then((r) => ({ ok: true as const, r }), (err: unknown) => ({ ok: false as const, err })),
  ];
  if (!updates.ok || !retries.ok) {
    if (!updates.ok) console.error("deliverProfileUpdates", updates.err);
    if (!retries.ok) console.error("retryChangedMatchEmails", retries.err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
  return NextResponse.json({ sent: updates.n, retried: retries.r });
}
