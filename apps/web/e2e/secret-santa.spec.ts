import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { findMail, signInLinkOf, waitForMail } from "./mailpit";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321").replace(/\/+$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const ORGANIZER_EMAIL = (process.env.E2E_ORGANIZER_EMAIL ?? "organizer@example.com").toLowerCase();

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Sending the matches marks every giftee as "just notified", and the app emails a Santa about a
 * giftee's questionnaire at most once per 30 minutes (the rest waits for the daily sweep). So
 * that the update email can be tested without waiting, pretend the match emails went out an hour
 * ago. Test setup only: this touches the notification timestamps and nothing about who has whom.
 */
async function pretendMatchEmailsWentOutAnHourAgo(): Promise<void> {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_notifications?notified_at=not.is.null`, {
    method: "PATCH",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    // last_edit_at too: otherwise every row looks "edited since the last email" and all Santas are told.
    body: JSON.stringify({ notified_at: anHourAgo, last_edit_at: anHourAgo }),
  });
  expect(res.ok, `backdating notifications returned ${res.status}`).toBe(true);
}

// A fresh set of addresses per run, so earlier runs' emails in the same inbox never count.
const RUN = Date.now().toString(36);
const people = ["Ann", "Ben", "Cara", "Dan", "Eve"].map((name) => ({ name, email: `${name.toLowerCase()}-${RUN}@example.com` }));
const [, ben, cara] = people as [(typeof people)[0], (typeof people)[0], (typeof people)[0]];
const everyone = [ORGANIZER_EMAIL, ...people.map((p) => p.email)];

/** The Supabase access token in the browser's session cookie (the cookie may be split in chunks). */
async function accessToken(context: BrowserContext): Promise<string> {
  const chunks = (await context.cookies())
    .filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(chunks.length, "a Supabase session cookie").toBeGreaterThan(0);
  let value = decodeURIComponent(chunks.map((c) => c.value).join(""));
  if (value.startsWith("base64-")) value = Buffer.from(value.slice(7), "base64url").toString("utf8");
  return (JSON.parse(value) as { access_token: string }).access_token;
}

/** Everything the organizer's own login can read from the assignments table over the REST API. */
async function assignmentsVisibleTo(context: BrowserContext): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assignments?select=*`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${await accessToken(context)}` },
  });
  expect(res.ok, `assignments REST call returned ${res.status}`).toBe(true);
  return (await res.json()) as unknown[];
}

/**
 * Who a member is actually buying for, read with the service role. Test-only: emails no longer
 * name the giftee (people unwrap their match on their page), so this is how the test checks the
 * page shows the right person.
 */
async function actualGifteeOf(groupId: string, email: string): Promise<string> {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const [members, pairs] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/memberships?group_id=eq.${groupId}&select=id,display_name,email`, { headers }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/assignments?group_id=eq.${groupId}&select=giver_id,receiver_id`, { headers }).then((r) => r.json()),
  ]) as [{ id: string; display_name: string; email: string }[], { giver_id: string; receiver_id: string }[]];
  const giver = members.find((m) => m.email.toLowerCase() === email.toLowerCase())!;
  const receiverId = pairs.find((p) => p.giver_id === giver.id)!.receiver_id;
  return members.find((m) => m.id === receiverId)!.display_name;
}

const personRow = (page: Page, name: string) =>
  page.locator("li.person").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) });

test("organizer runs a draw and the family uses it, without anyone seeing who has whom", async ({ page, browser, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const phone = { ...devices["Pixel 7"], baseURL: origin };

  // Everything the organizer's browser receives for the organizer page and its server actions.
  // The route handler reads each body before the page can navigate away (reading afterwards fails),
  // then passes the response on unchanged.
  const captured: { method: string; path: string; status: number; body: string }[] = [];
  const captureAdminResponses = async (groupId: string) => {
    await page.route(new RegExp(`/g/${groupId}/admin`), async (route) => {
      const response = await route.fetch();
      captured.push({ method: route.request().method(), path: new URL(route.request().url()).pathname, status: response.status(), body: await response.text() });
      await route.fulfill({ response });
    });
  };

  // --- Organizer signs in with an emailed link -------------------------------------------------
  await page.goto("/login");
  await page.getByLabel("Email").fill(ORGANIZER_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Check .* for a sign-in link/)).toBeVisible();
  const [signIn] = await waitForMail([ORGANIZER_EMAIL], /sign-in link/i);
  await page.goto(await signInLinkOf(signIn!, origin));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/home$/);

  // --- Creates the group -----------------------------------------------------------------------
  await page.getByRole("link", { name: "Start a new group" }).click();
  await page.getByLabel("Group name").fill(`E2E family ${RUN}`);
  await page.getByLabel(/Your name/).fill("Olive");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page).toHaveURL(/\/g\/[0-9a-f-]{36}\/admin$/);
  const groupId = new URL(page.url()).pathname.split("/")[2]!;
  await captureAdminResponses(groupId);
  await page.reload(); // so the first admin page view is captured too

  // --- Adds five people and one couple rule ----------------------------------------------------
  const addForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add person" }) });
  for (const p of people) {
    await addForm.getByLabel("Name").fill(p.name);
    await addForm.getByLabel("Email").fill(p.email);
    await addForm.getByRole("button", { name: "Add person" }).click();
    await expect(addForm.getByRole("status")).toContainText(`Added ${p.name}`);
  }
  await expect(page.locator("li.person")).toHaveCount(6);

  const annRow = personRow(page, "Ann");
  await annRow.getByLabel("Someone Ann can't draw").selectOption({ label: "Ben" });
  await annRow.getByRole("button", { name: "Add", exact: true }).click();
  await expect(annRow.locator(".chip")).toContainText("Ben");

  // --- Match and Send --------------------------------------------------------------------------
  await page.getByRole("button", { name: "Match everyone" }).click();
  await expect(page.locator("strong", { hasText: "6 people matched" })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Send to everyone" }).click();
  await expect(page.getByText("Sent ✓").first()).toBeVisible();

  // Each person got exactly one match email. It doesn't say who they have: they unwrap that on their page.
  const matchSubject = /Your Secret Santa match is ready to unwrap/;
  const matchMails = await waitForMail(everyone, matchSubject, everyone.length);
  expect(matchMails).toHaveLength(everyone.length);
  for (const mail of matchMails) expect(mail.subject).not.toMatch(/Ann|Ben|Cara|Dan|Eve/);

  // --- A member opens their email link and sees their giftee -----------------------------------
  const benContext = await browser.newContext(phone);
  const benPage = await benContext.newPage();
  await benPage.goto(await signInLinkOf(matchMails.find((m) => m.to.includes(ben.email))!, origin));
  await benPage.getByRole("button", { name: "Continue" }).click();
  await expect(benPage).toHaveURL(new RegExp(`/g/${groupId}`));
  // The match is wrapped until Ben unwraps the present. (Exact text: the unwrap hint itself
  // says "Tap the present to see who you're buying for".)
  const buyingFor = benPage.getByText("You're buying for", { exact: true });
  await expect(buyingFor).toHaveCount(0);
  await expect(benPage.locator(".giftee")).toHaveCount(0);
  await benPage.getByRole("button", { name: /Unwrap the present/ }).click();
  await expect(buyingFor).toBeVisible();
  const benGiftee = (await benPage.locator(".giftee").innerText()).trim();
  expect(benGiftee).toBe(await actualGifteeOf(groupId, ben.email));
  expect(benGiftee).not.toBe("Ann"); // his "can't draw" rule
  expect(benGiftee).not.toBe("Ben");

  // --- Saves the questionnaire; their Santa is told ---------------------------------------------
  await pretendMatchEmailsWentOutAnHourAgo();
  // Jump to the "Get to know you" part of the questionnaire; every save tells their Santa.
  await benPage.locator(".wizard-steps").getByRole("button", { name: /Get to know you/ }).click();
  await benPage.getByLabel(/free afternoon/).fill("Fishing and woodworking");
  await benPage.getByLabel(/always make you happy/).fill("Dark roast coffee");
  await benPage.getByRole("button", { name: "Save & continue" }).click();
  // The squishy bracket has its own status line ("Match 1 of 5"), so pick the save message.
  await expect(benPage.locator(".wizard").getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  // Exactly one Santa is told (Ben's), and the email doesn't name Ben.
  const updatedSubject = /The person you're buying for updated their questionnaire/;
  const updates = await waitForMail(everyone, updatedSubject);
  expect(await findMail(everyone, updatedSubject)).toHaveLength(1);
  expect(updates[0]!.to).not.toContain(ben.email);
  expect(updates[0]!.subject).not.toContain("Ben");

  // --- Organizer resends one email -------------------------------------------------------------
  const caraBefore = (await findMail([cara.email], matchSubject)).length;
  const caraRow = personRow(page, "Cara");
  await caraRow.getByText("Edit, remind, or remove").click();
  await caraRow.getByRole("button", { name: "Resend match email" }).click();
  await expect(caraRow.getByRole("status")).toContainText("Sent to Cara");
  await waitForMail([cara.email], matchSubject, caraBefore + 1);
  expect(await findMail([cara.email], matchSubject)).toHaveLength(caraBefore + 1);
  // ...and nobody else was emailed by it.
  expect((await findMail(everyone, matchSubject)).length).toBe(everyone.length + 1);

  // --- Privacy: the organizer cannot read anyone's match ---------------------------------------
  // The organizer takes part too, so exactly their own row is visible. If the assignments policy
  // were loosened, this would return every row.
  expect(await findMail(everyone, /match has changed/i)).toHaveLength(0);
  expect(await assignmentsVisibleTo(page.context()), "organizer can read only their own match row").toHaveLength(1);

  // --- Organizer removes Ann: exactly one "match changed" email --------------------------------
  // Ann's Santa simply takes over Ann's giftee. That is always allowed (Ben, the only person
  // Ann has a rule with, can be neither of them), so one person is told and nobody else.
  const annRow2 = personRow(page, "Ann");
  await annRow2.getByText("Edit, remind, or remove").click();
  page.once("dialog", (d) => void d.accept());
  await annRow2.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("li.person")).toHaveCount(5);
  await waitForMail(everyone, /match has changed/i);
  expect(await findMail(everyone, /match has changed/i)).toHaveLength(1);
  expect(await assignmentsVisibleTo(page.context()), "still only the organizer's own row").toHaveLength(1);

  // --- Privacy: nothing the organizer's browser received names a pairing -----------------------
  await page.waitForLoadState("networkidle");
  const summary = captured.map((c) => `${c.method} ${c.status} ${c.body.length} bytes`).join("; ");
  const bodies = captured.map((c) => c.body);
  const posts = captured.filter((c) => c.method === "POST");
  // Every organizer action (5 adds, a rule, Match, Send, Resend, Remove) must have been captured,
  // or the checks below would pass for the wrong reason.
  expect(posts.length, `captured organizer server-action responses: ${summary}`).toBeGreaterThanOrEqual(10);
  for (const body of bodies) {
    expect(body).not.toMatch(/giver_id|receiver_id|assignments/i);
    expect(body).not.toMatch(/You.{1,8}re buying for|'s Secret Santa|&#x27;s Secret Santa/i);
  }

  await benContext.close();
});
