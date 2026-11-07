import "server-only";
import { serverEnv } from "../env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends emails through Resend's batch API (up to 100 per request).
 * Returns one success flag per email, in order. Without RESEND_API_KEY outside
 * production, prints the emails to the server log instead (for local development).
 */
export async function sendEmails(emails: readonly OutgoingEmail[]): Promise<boolean[]> {
  const apiKey = serverEnv.resendApiKey();
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    for (const e of emails) console.info(`[email:dev] to=${e.to} subject="${e.subject}"\n${e.text}\n`);
    return emails.map(() => true);
  }

  const results: boolean[] = [];
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          chunk.map((e) => ({ from: serverEnv.emailFrom(), to: [e.to], subject: e.subject, html: e.html, text: e.text })),
        ),
      });
      if (!res.ok) console.error(`Resend batch failed: ${res.status} ${await res.text()}`);
      results.push(...chunk.map(() => res.ok));
    } catch (err) {
      console.error("Resend batch error", err);
      results.push(...chunk.map(() => false));
    }
  }
  return results;
}
