import type { OutgoingEmail } from "./send";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Classic Cozy email: string-light dots, an evergreen header, a cream card and a cranberry button. */
function layout(opts: { preheader: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }) {
  const p = (html: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#2b2320">${html}</p>`;
  const bulbs = ["#a51c30", "#d9a93f", "#1f4d3a"];
  const lights = Array.from({ length: 13 }, (_, i) => `<td align="center" style="padding:0"><span style="display:inline-block;width:10px;height:14px;border-radius:5px 5px 6px 6px;background:${bulbs[i % 3]}"></span></td>`).join("");
  const serif = "Georgia,'Times New Roman',serif";
  return `<!doctype html><html><body style="margin:0;background:#f6eee1;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escape(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6eee1"><tr><td align="center" style="padding:20px 16px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 6px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${lights}</tr></table></td></tr>
<tr><td style="background:#1f4d3a;border-radius:16px 16px 0 0;padding:18px 24px;border-bottom:4px solid #d9a93f">
<p style="margin:0;font-family:${serif};font-style:italic;font-weight:bold;font-size:24px;color:#f6e7c1">Secret Santa</p>
</td></tr>
<tr><td style="background:#fffaf2;border:1px solid #e2d2bb;border-top:0;border-radius:0 0 16px 16px;padding:28px 24px">
<h1 style="margin:0 0 16px;font-family:${serif};font-size:26px;line-height:1.2;color:#a51c30">${opts.heading}</h1>
${opts.paragraphs.map(p).join("\n")}
${opts.button ? `<p style="margin:26px 0"><a href="${escape(opts.button.url)}" style="display:inline-block;background:#a51c30;color:#fff7ea;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 24px;border-radius:999px;border-bottom:4px solid #6e0f1e">${escape(opts.button.label)}</a></p>` : ""}
<p style="margin:0;font-family:${serif};font-style:italic;font-size:15px;color:#6c5e52">${opts.footer ?? "Shh, keep it a secret."}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/**
 * Emails never name the giftee: the reveal happens when the person unwraps the
 * present on their page. These inputs deliberately have no giftee name field.
 */
export interface MatchEmailInput {
  to: string;
  name: string;
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
    ? `Good news: the person you're buying for has already filled out their questionnaire, so you can start getting to know them right away.`
    : `The person you're buying for hasn't filled out their questionnaire yet. We'll email you as soon as they do.`;
  const heading = i.changed ? "Your Secret Santa match has changed" : "Names have been drawn!";
  const intro = i.changed
    ? `Hi ${escape(i.name)}, the ${escape(i.groupName)} matches were updated, so you have someone new to buy for. Please disregard your earlier match. Your new match is wrapped up and waiting on your page.`
    : `Hi ${escape(i.name)}, the names for <strong>${escape(i.groupName)}</strong> have been drawn. Your match is wrapped up and waiting for you. Open your page and unwrap the present to see who you're buying for.`;
  const paragraphs = [
    intro,
    `Budget: <strong>${escape(i.budget)}</strong>.${when}`,
    answersLine,
    `<strong>Your turn:</strong> fill out your own questionnaire so your Secret Santa can get to know you. It takes about 5 minutes.`,
  ];
  return {
    to: i.to,
    subject: i.changed ? `Your Secret Santa match has changed` : `🎁 Your Secret Santa match is ready to unwrap`,
    html: layout({
      preheader: `Names have been drawn for ${i.groupName}. Unwrap your match to see who you're buying for.`,
      heading,
      paragraphs,
      button: { label: i.changed ? "Unwrap my new match" : "Unwrap my match", url: i.link },
    }),
    text: [
      i.changed
        ? `Hi ${i.name}, your Secret Santa match has changed. Open your page to unwrap your new match.`
        : `Hi ${i.name}, names have been drawn for ${i.groupName}! Open your page to unwrap your match.`,
      `Budget: ${i.budget}.${i.exchangeDate ? ` Exchange: ${i.exchangeDate}.` : ""}`,
      i.gifteeHasAnswers
        ? `The person you're buying for has filled out their questionnaire.`
        : `The person you're buying for hasn't filled out their questionnaire yet; we'll email you when they do.`,
      `Please fill out your own questionnaire too, so your Secret Santa can get to know you.`,
      `Open: ${i.link}`,
      `Shh, keep it a secret.`,
    ].join("\n\n"),
  };
}

export function profileUpdatedEmail(i: { to: string; name: string; link: string; newIdeas?: boolean }): OutgoingEmail {
  const ideas = i.newIdeas ? " New gift ideas are ready too." : "";
  return {
    to: i.to,
    subject: `The person you're buying for updated their questionnaire`,
    html: layout({
      preheader: `New hints about the person you're buying for.`,
      heading: "Your giftee shared more about themselves",
      paragraphs: [
        `Hi ${escape(i.name)}, the person you're buying for just updated their questionnaire. Take a look to get to know them a little better (and see what to avoid).${ideas}`,
      ],
      button: { label: "See their answers", url: i.link },
    }),
    text: `Hi ${i.name}, the person you're buying for just updated their questionnaire.${ideas}\n\nSee their answers: ${i.link}\n\nShh, keep it a secret.`,
  };
}

/** Organizer-written text: escaped, with line breaks kept. */
const multiline = (s: string) => escape(s).replace(/\r?\n/g, "<br>");

export function reminderEmail(i: { to: string; name: string; groupName: string; link: string; note?: string }): OutgoingEmail {
  const note = i.note?.trim();
  return {
    to: i.to,
    subject: `Your Secret Santa is waiting to hear what you'd like`,
    html: layout({
      preheader: "Five minutes now saves your Santa a lot of guessing.",
      heading: "Help your Secret Santa out",
      paragraphs: [
        `Hi ${escape(i.name)}, someone in <strong>${escape(i.groupName)}</strong> is shopping for you and would love a few hints.`,
        ...(note ? [`<em>From the organizer:</em><br>${multiline(note)}`] : []),
        `Fill out your questionnaire (likes, sizes, things to avoid). It takes about 5 minutes, and you can come back and change it any time.`,
      ],
      button: { label: "Fill out my questionnaire", url: i.link },
      footer: "You can update your answers as often as you like.",
    }),
    text: [
      `Hi ${i.name}, your Secret Santa in ${i.groupName} would love a few hints.`,
      ...(note ? [`From the organizer:\n${note}`] : []),
      `Fill out your questionnaire: ${i.link}`,
    ].join("\n\n"),
  };
}

/** A message from the organizer to everyone. Never contains match information. */
export function announcementEmail(i: {
  to: string;
  name: string;
  groupName: string;
  subject: string;
  message: string;
  link: string;
}): OutgoingEmail {
  return {
    to: i.to,
    subject: i.subject,
    html: layout({
      preheader: i.message.slice(0, 90),
      heading: escape(i.subject),
      paragraphs: [`Hi ${escape(i.name)},`, multiline(i.message)],
      button: { label: "Open Secret Santa", url: i.link },
      footer: `A message from the organizer of ${escape(i.groupName)}.`,
    }),
    text: `Hi ${i.name},\n\n${i.message}\n\nOpen Secret Santa: ${i.link}\n\nA message from the organizer of ${i.groupName}.`,
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
