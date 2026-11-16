import "server-only";
import nodemailer from "nodemailer";
import { serverEnv } from "../env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends emails over SMTP (Gmail by default: SMTP_USER is the Gmail address, SMTP_PASS is a
 * Google app password). Emails go out one at a time over a single pooled connection.
 * Returns one success flag per email, in order. Without SMTP_PASS outside production,
 * prints the emails to the server log instead (for local development).
 */
/**
 * A log-safe summary of a failed send: error codes only. Nodemailer's message, `response`,
 * `rejected` and `envelope` fields can all contain the recipient's address.
 */
export function describeSendError(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown error";
  const e = err as { code?: unknown; responseCode?: unknown; command?: unknown };
  const parts = [
    typeof e.code === "string" && /^[A-Z0-9_]{1,40}$/.test(e.code) ? `code ${e.code}` : null,
    typeof e.responseCode === "number" ? `SMTP ${e.responseCode}` : null,
    typeof e.command === "string" && /^[A-Z ]{1,20}$/.test(e.command) ? `during ${e.command}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "unknown error";
}

export async function sendEmails(emails: readonly OutgoingEmail[]): Promise<boolean[]> {
  const smtp = serverEnv.smtp();
  if (!smtp) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP_USER and SMTP_PASS are not set");
    for (const e of emails) console.info(`[email:dev] to=${e.to} subject="${e.subject}"\n${e.text}\n`);
    return emails.map(() => true);
  }
  if (emails.length === 0) return [];

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
    pool: true,
    maxConnections: 1,
  });

  const results: boolean[] = [];
  try {
    for (const e of emails) {
      try {
        await transport.sendMail({ from: serverEnv.emailFrom(), to: e.to, subject: e.subject, html: e.html, text: e.text });
        results.push(true);
      } catch (err) {
        // No address and no raw error: SMTP errors quote the recipient, and after an add or
        // remove who got an email shows whose match changed (security review M-3).
        console.error(`An email failed to send (${describeSendError(err)})`);
        results.push(false);
      }
    }
  } finally {
    transport.close();
  }
  return results;
}
