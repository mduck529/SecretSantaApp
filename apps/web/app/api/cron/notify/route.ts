import { NextResponse, type NextRequest } from "next/server";
import { deliverProfileUpdates } from "@/lib/group-service";
import { runAutoReminders } from "@/lib/notify-service";
import { serverEnv } from "@/lib/env";

/**
 * Daily job:
 *  - sends "your giftee updated their profile" emails held back by the throttle
 *  - sends automatic questionnaire reminders for groups that turned them on
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await deliverProfileUpdates();
  const reminded = await runAutoReminders();
  return NextResponse.json({ sent, reminded });
}
