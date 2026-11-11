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
        console.error(`Email to ${e.to} failed`, err);
        results.push(false);
      }
    }
  } finally {
    transport.close();
  }
  return results;
}
