import { NextResponse, type NextRequest } from "next/server";
import { deliverProfileUpdates } from "@/lib/group-service";
import { serverEnv } from "@/lib/env";

/** Daily backstop for "your giftee updated their profile" emails held back by the throttle. */
export async function GET(request: NextRequest) {
  const secret = serverEnv.cronSecret();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await deliverProfileUpdates();
  return NextResponse.json({ sent });
}
