/** Reads the emails the app and Supabase Auth send to the local Mailpit inbox. */
const MAILPIT = (process.env.MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/+$/, "");

export interface Mail {
  id: string;
  to: string[];
  subject: string;
}

export async function listMail(): Promise<Mail[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=500`);
  if (!res.ok) throw new Error(`Mailpit returned ${res.status}`);
  const body = (await res.json()) as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] };
  return body.messages.map((m) => ({ id: m.ID, subject: m.Subject, to: m.To.map((t) => t.Address.toLowerCase()) }));
}

/** Emails to any of `recipients` whose subject matches. */
export async function findMail(recipients: readonly string[], subject: RegExp): Promise<Mail[]> {
  const want = new Set(recipients.map((r) => r.toLowerCase()));
  return (await listMail()).filter((m) => m.to.some((t) => want.has(t)) && subject.test(m.subject));
}

/** Waits until at least `atLeast` matching emails exist, then returns them (newest first). */
export async function waitForMail(recipients: readonly string[], subject: RegExp, atLeast = 1, timeoutMs = 30_000): Promise<Mail[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await findMail(recipients, subject);
    if (found.length >= atLeast) return found;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${atLeast} email(s) to ${recipients.join(", ")} matching ${subject}; found ${found.length}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** The first link in the email that points at the app's sign-in page. */
export async function signInLinkOf(mail: Mail, appOrigin: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${mail.id}`);
  if (!res.ok) throw new Error(`Mailpit returned ${res.status}`);
  const { HTML } = (await res.json()) as { HTML: string };
  const hrefs = [...HTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  const link = hrefs.find((h) => h.includes("/auth/confirm"));
  if (!link) throw new Error(`No sign-in link in "${mail.subject}"`);
  // The link is built from the app's configured URL; follow it on the host the test is using.
  const url = new URL(link);
  return `${appOrigin}${url.pathname}${url.search}`;
}
