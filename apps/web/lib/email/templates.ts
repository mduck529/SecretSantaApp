import type { OutgoingEmail } from "./send";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(opts: { preheader: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }) {
  const p = (html: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2a24">${html}</p>`;
  return `<!doctype html><html><body style="margin:0;background:#fbf8f3;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escape(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #eadfd2">
<tr><td style="padding:28px 24px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#b3261e">${opts.heading}</h1>
${opts.paragraphs.map(p).join("\n")}
${opts.button ? `<p style="margin:24px 0"><a href="${escape(opts.button.url)}" style="display:inline-block;background:#b3261e;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 20px;border-radius:8px">${escape(opts.button.label)}</a></p>` : ""}
<p style="margin:0;font-size:13px;color:#6b6b6b">${opts.footer ?? "Shh, keep it a secret."}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export interface MatchEmailInput {
  to: string;
  name: string;
  giftee: string;
  groupName: string;
  budget: string;
  exchangeDate: string | null;
  gifteeHasAnswers: boolean;
  link: string;
  /** True when this replaces an earlier match (re-match or someone joined/left). */
  changed?: boolean;
}

export function matchEmail(i: MatchEmailInput): OutgoingEmail {
  const when = i.exchangeDate ? ` We exchange gifts on <strong>${escape(i.exchangeDate)}</strong>.` : "";
  const answersLine = i.gifteeHasAnswers
    ? `${escape(i.giftee)} has already filled out their questionnaire, so you can see what they'd love.`
    : `${escape(i.giftee)} hasn't filled out their questionnaire yet. We'll email you as soon as they do.`;
  const heading = i.changed ? "Your Secret Santa match has changed" : `You're ${escape(i.giftee)}'s Secret Santa!`;
  const intro = i.changed
    ? `Hi ${escape(i.name)}, the ${escape(i.groupName)} matches were updated. You're now buying for <strong>${escape(i.giftee)}</strong>. Please disregard your earlier match.`
    : `Hi ${escape(i.name)}, the names for <strong>${escape(i.groupName)}</strong> have been drawn. You're buying for <strong>${escape(i.giftee)}</strong>.`;
  const paragraphs = [
    intro,
    `Budget: <strong>${escape(i.budget)}</strong>.${when}`,
    answersLine,
    `<strong>Your turn:</strong> fill out your own questionnaire so your Secret Santa knows what you'd like. It takes about 5 minutes.`,
  ];
  return {
    to: i.to,
    subject: i.changed ? `Your Secret Santa match has changed` : `🎁 You're ${i.giftee}'s Secret Santa`,
    html: layout({
      preheader: `You're buying for ${i.giftee}. Budget ${i.budget}.`,
      heading,
      paragraphs,
      button: { label: "See your match & fill out your questionnaire", url: i.link },
    }),
    text: [
      i.changed ? `Your match has changed. You're now buying for ${i.giftee}.` : `You're ${i.giftee}'s Secret Santa!`,
      `Budget: ${i.budget}.${i.exchangeDate ? ` Exchange: ${i.exchangeDate}.` : ""}`,
      i.gifteeHasAnswers ? `${i.giftee} has filled out their questionnaire.` : `${i.giftee} hasn't filled out their questionnaire yet; we'll email you when they do.`,
      `Please fill out your own questionnaire too.`,
      `Open: ${i.link}`,
      `Shh, keep it a secret.`,
    ].join("\n\n"),
  };
}

export function profileUpdatedEmail(i: { to: string; name: string; giftee: string; link: string }): OutgoingEmail {
  return {
    to: i.to,
    subject: `${i.giftee} updated their Secret Santa questionnaire`,
    html: layout({
      preheader: `See what ${i.giftee} would love.`,
      heading: `${escape(i.giftee)} shared some gift hints`,
      paragraphs: [`Hi ${escape(i.name)}, ${escape(i.giftee)} just updated their questionnaire. Take a look at what they'd love (and what to avoid).`],
      button: { label: `See ${i.giftee}'s answers`, url: i.link },
    }),
    text: `Hi ${i.name}, ${i.giftee} just updated their questionnaire.\n\nSee their answers: ${i.link}\n\nShh, keep it a secret.`,
  };
}

export function reminderEmail(i: { to: string; name: string; groupName: string; link: string }): OutgoingEmail {
  return {
    to: i.to,
    subject: `Your Secret Santa is waiting to hear what you'd like`,
    html: layout({
      preheader: "Five minutes now saves your Santa a lot of guessing.",
      heading: "Help your Secret Santa out",
      paragraphs: [
        `Hi ${escape(i.name)}, someone in <strong>${escape(i.groupName)}</strong> is shopping for you and would love a few hints.`,
        `Fill out your questionnaire (likes, sizes, things to avoid). It takes about 5 minutes, and you can come back and change it any time.`,
      ],
      button: { label: "Fill out my questionnaire", url: i.link },
      footer: "You can update your answers as often as you like.",
    }),
    text: `Hi ${i.name}, your Secret Santa in ${i.groupName} would love a few hints.\n\nFill out your questionnaire: ${i.link}`,
  };
}

/** "a•••@example.com": enough to recognize your own address, not enough to harvest it. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** Sent to someone's OLD address when the organizer changes their email after matching. No sign-in link. */
export function emailChangedNotice(i: { to: string; name: string; groupName: string; newEmail: string }): OutgoingEmail {
  const masked = maskEmail(i.newEmail);
  return {
    to: i.to,
    subject: `Your Secret Santa email address was changed`,
    html: layout({
      preheader: `Your ${i.groupName} emails now go to ${masked}.`,
      heading: "Your email address was changed",
      paragraphs: [
        `Hi ${escape(i.name)}, the organizer of <strong>${escape(i.groupName)}</strong> changed your email address to <strong>${escape(masked)}</strong>. Your Secret Santa emails will go there from now on.`,
        `If you asked for this, there's nothing to do. If you didn't, please let the organizer know.`,
      ],
      footer: "This address won't get any more Secret Santa emails for this group.",
    }),
    text: `Hi ${i.name}, the organizer of ${i.groupName} changed your email address to ${masked}. Your Secret Santa emails will go there from now on.\n\nIf you didn't ask for this, please let the organizer know.`,
  };
}
