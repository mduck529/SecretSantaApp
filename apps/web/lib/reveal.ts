/**
 * Reveal rules (pure, no server imports so they can be unit tested).
 * The exchange date is a plain calendar date; "today" is read in US Eastern time
 * so the button opens on the morning of the exchange for a US family.
 */
export type RevealCheck = { ok: true } | { ok: false; message: string };

export function todayInEastern(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now); // YYYY-MM-DD
}

export function checkReveal(
  g: { status: string; exchange_date: string | null; revealed_at: string | null },
  today: string = todayInEastern(),
): RevealCheck {
  if (g.revealed_at) return { ok: false, message: "Already revealed. Everyone can see who had whom." };
  if (g.status !== "sent") return { ok: false, message: "Send the matches first." };
  if (!g.exchange_date) return { ok: false, message: "Set the exchange date in Settings first." };
  if (today < g.exchange_date) return { ok: false, message: "Reveal opens on the exchange date." };
  return { ok: true };
}
