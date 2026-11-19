import type { OutgoingEmail } from "./send";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Matches the web app's palette (app/globals.css) with a little extra holiday trim.
const c = {
  page: "#f3ece2",
  card: "#ffffff",
  border: "#eadfd2",
  text: "#1f2a24",
  muted: "#5f6661",
  red: "#b3261e",
  redDark: "#8c1d17",
  green: "#1e6b3a",
  gold: "#d9a441",
  cream: "#fdf6ec",
  okBg: "#e5f3e9",
  noteBg: "#fff4e0",
  noteText: "#7a4b00",
};

const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const serif = "Georgia,'Times New Roman',Times,serif";

/** Overrides for clients that honour prefers-color-scheme (Apple Mail, iOS, some Outlook). */
const darkCss = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media (prefers-color-scheme:dark){
  .bg{background:#141819!important}
  .card{background:#1d2324!important;border-color:#2f3739!important}
  .tx{color:#ece8e1!important}
  .mu{color:#a3a9a6!important}
  .hl{color:#f2867f!important}
  .tag{background:#262d2e!important;border-color:#5a3b37!important}
  .ok{background:#18301f!important;color:#8fd6a6!important}
  .note{background:#3a2b12!important;color:#f3c87a!important}
  .rule{border-color:#3a4446!important}
  .gr{color:#8fd6a6!important}
}
@media only screen and (max-width:480px){
  .pad{padding-left:20px!important;padding-right:20px!important}
  .big{font-size:34px!important}
  .col{display:block!important;width:100%!important;border-left:0!important;padding-left:0!important;padding-top:12px!important}
}`;

const para = (html: string) =>
  `<p class="tx" style="margin:0 0 16px;font-family:${sans};font-size:16px;line-height:1.6;color:${c.text}">${html}</p>`;

/** "Bulletproof" table button: renders as a real button in every client, including Outlook. */
const button = (label: string, url: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 4px">
<tr><td align="center" bgcolor="${c.red}" style="border-radius:999px;background:${c.red};box-shadow:0 2px 0 ${c.redDark}">
<a href="${escape(url)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${sans};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px">${escape(label)}&nbsp;&rarr;</a>
</td></tr></table>`;

/** A soft callout box. `tone` picks the colours. */
const callout = (html: string, tone: "ok" | "note" | "plain") => {
  const style = {
    ok: { cls: "ok", bg: c.okBg, fg: c.green },
    note: { cls: "note", bg: c.noteBg, fg: c.noteText },
    plain: { cls: "tag tx", bg: c.cream, fg: c.text },
  }[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">
<tr><td class="${style.cls}" style="background:${style.bg};border-radius:10px;padding:14px 16px;font-family:${sans};font-size:15px;line-height:1.55;color:${style.fg}">${html}</td></tr></table>`;
};

/** The dashed "gift tag" card that holds the most important fact in the email. */
const giftTag = (opts: { label: string; title: string; details?: { label: string; value: string }[] }) => {
  const details = opts.details?.length
    ? `<tr><td style="padding:0 20px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${opts.details
        .map(
          (d, i) => `<td class="col rule" valign="top" align="${opts.details!.length === 1 ? "center" : "left"}" width="${Math.floor(100 / opts.details!.length)}%" style="${i ? `border-left:1px solid ${c.border};padding-left:16px;` : ""}">
<div class="mu" style="font-family:${sans};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${c.muted}">${d.label}</div>
<div class="tx" style="font-family:${sans};font-size:17px;font-weight:600;color:${c.text};padding-top:4px">${d.value}</div></td>`,
        )
        .join("")}</tr></table></td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px">
<tr><td class="tag" style="background:${c.cream};border:2px dashed #e3b9a6;border-radius:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:20px 20px ${details ? "16px" : "22px"}">
<div class="mu" style="font-family:${sans};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${c.muted}">${opts.label}</div>
<div class="hl big" style="font-family:${serif};font-size:40px;line-height:1.15;font-weight:700;color:${c.red};padding-top:6px">${opts.title}</div>
</td></tr>
${details}
</table></td></tr></table>`;
};

const steps = (items: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${items
    .map(
      (html, i) => `<tr><td valign="top" width="36" style="padding:0 0 12px">
<div style="width:26px;height:26px;border-radius:13px;background:${c.green};color:#ffffff;font-family:${sans};font-size:14px;font-weight:700;line-height:26px;text-align:center">${i + 1}</div></td>
<td class="tx" valign="top" style="padding:3px 0 12px;font-family:${sans};font-size:15px;line-height:1.55;color:${c.text}">${html}</td></tr>`,
    )
    .join("")}</table>`;

function layout(opts: {
  preheader: string;
  /** Big emoji at the top of the red header band. */
  icon: string;
  /** Small caps line above the heading, e.g. the group name. Already escaped. */
  eyebrow: string;
  heading: string;
  body: string;
  button: { label: string; url: string };
  footer?: string;
}) {
  // Invisible filler stops inbox previews from pulling body text after the preheader.
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(opts.preheader)}</title>
<style>${darkCss}</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${c.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(opts.preheader)}${filler}</div>
<table class="bg" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page}">
<tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

<tr><td align="center" bgcolor="${c.red}" style="background:${c.red};border-radius:16px 16px 0 0;padding:28px 24px 24px">
<div style="font-size:44px;line-height:1">${opts.icon}</div>
<div style="font-family:${sans};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffd9d4;padding-top:12px">${opts.eyebrow}</div>
<div style="font-family:${serif};font-size:20px;color:#ffffff;padding-top:2px">&#10052;&nbsp; Secret Santa &nbsp;&#10052;</div>
</td></tr>
<tr><td style="font-size:0;line-height:0;height:6px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td height="6" bgcolor="${c.green}" style="background:${c.green};height:6px;font-size:0">&nbsp;</td>
<td height="6" bgcolor="${c.gold}" style="background:${c.gold};height:6px;font-size:0" width="34%">&nbsp;</td>
<td height="6" bgcolor="${c.green}" style="background:${c.green};height:6px;font-size:0">&nbsp;</td>
</tr></table></td></tr>

<tr><td class="card pad" bgcolor="${c.card}" style="background:${c.card};border:1px solid ${c.border};border-top:0;border-radius:0 0 16px 16px;padding:32px 36px 28px">
<h1 class="tx" style="margin:0 0 18px;font-family:${serif};font-size:28px;line-height:1.25;font-weight:700;color:${c.text}">${opts.heading}</h1>
${opts.body}
${button(opts.button.label, opts.button.url)}
<p class="mu" style="margin:14px 0 0;font-family:${sans};font-size:12px;line-height:1.5;color:${c.muted};text-align:center">This button signs you in automatically. No password needed.</p>
</td></tr>

<tr><td align="center" style="padding:22px 24px 0">
<p class="mu" style="margin:0;font-family:${sans};font-size:14px;line-height:1.5;color:${c.muted}">${opts.footer ?? "&#129323;&nbsp; Shh, keep it a secret."}</p>
<p class="mu" style="margin:6px 0 0;font-family:${sans};font-size:12px;line-height:1.5;color:${c.muted}">Sent by Secret Santa on behalf of your group organizer.</p>
</td></tr>

</table></td></tr></table>
</body></html>`;
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
  const giftee = escape(i.giftee);
  const heading = i.changed ? "Your match has changed" : `Hi ${escape(i.name)}, the names are drawn!`;
  const intro = i.changed
    ? callout(
        `<strong>Heads up, ${escape(i.name)}:</strong> the matches for <strong>${escape(i.groupName)}</strong> were updated. Please forget your earlier match. Here's who you're buying for now.`,
        "note",
      )
    : para(`Everyone in <strong>${escape(i.groupName)}</strong> has been matched, and you've got someone to shop for. Remember: only you know who it is.`);
  const details = [{ label: "Budget", value: escape(i.budget) }];
  if (i.exchangeDate) details.push({ label: "Gift exchange", value: escape(i.exchangeDate) });
  const answers = i.gifteeHasAnswers
    ? callout(`&#10004;&#65039;&nbsp; <strong>${giftee} has already filled out their questionnaire</strong>, so you can see what they'd love (and what to skip).`, "ok")
    : callout(`&#9203;&nbsp; ${giftee} hasn't filled out their questionnaire yet. We'll email you as soon as they do.`, "plain");
  const body = [
    intro,
    giftTag({ label: i.changed ? "You're now buying for" : "You're buying for", title: giftee, details }),
    answers,
    `<h2 class="gr" style="margin:24px 0 12px;font-family:${sans};font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${c.green}">What to do next</h2>`,
    steps([
      `<strong>Your turn:</strong> fill out your own questionnaire so your Secret Santa knows what you'd like. It takes about 5 minutes.`,
      i.gifteeHasAnswers ? `Check out ${giftee}'s answers for gift ideas.` : `Watch your inbox for ${giftee}'s gift hints.`,
      `Shop, wrap, and keep a straight face until the big day.`,
    ]),
  ].join("\n");
  return {
    to: i.to,
    subject: i.changed ? `Your Secret Santa match has changed` : `🎁 You're ${i.giftee}'s Secret Santa`,
    html: layout({
      preheader: i.changed ? `You're now buying for ${i.giftee}. Budget ${i.budget}.` : `You're buying for ${i.giftee}. Budget ${i.budget}.`,
      icon: i.changed ? "&#128260;" : "&#127873;",
      eyebrow: escape(i.groupName),
      heading,
      body,
      button: { label: "See your match", url: i.link },
    }),
    text: [
      i.changed
        ? `Hi ${i.name}, the ${i.groupName} matches were updated. Please forget your earlier match.\n\nYou're now buying for: ${i.giftee}`
        : `Hi ${i.name}, the names for ${i.groupName} have been drawn!\n\nYou're buying for: ${i.giftee}`,
      `Budget: ${i.budget}${i.exchangeDate ? `\nGift exchange: ${i.exchangeDate}` : ""}`,
      i.gifteeHasAnswers
        ? `${i.giftee} has filled out their questionnaire, so you can see what they'd love.`
        : `${i.giftee} hasn't filled out their questionnaire yet; we'll email you when they do.`,
      `Your turn: please fill out your own questionnaire so your Secret Santa knows what you'd like. It takes about 5 minutes.`,
      `See your match: ${i.link}`,
      `Shh, keep it a secret.`,
    ].join("\n\n"),
  };
}

export function profileUpdatedEmail(i: { to: string; name: string; giftee: string; link: string; groupName?: string }): OutgoingEmail {
  const giftee = escape(i.giftee);
  return {
    to: i.to,
    subject: `${i.giftee} updated their Secret Santa questionnaire`,
    html: layout({
      preheader: `See what ${i.giftee} would love.`,
      icon: "&#128221;",
      eyebrow: i.groupName ? escape(i.groupName) : "Gift hints",
      heading: `New gift hints from ${giftee}`,
      body: [
        para(`Hi ${escape(i.name)}, good news for your shopping list:`),
        giftTag({ label: "Just updated their questionnaire", title: giftee }),
        para(`Take a look at what they'd love, their sizes, and anything they'd rather you avoid.`),
      ].join("\n"),
      button: { label: `See ${i.giftee}'s answers`, url: i.link },
      footer: `&#129323;&nbsp; Shh, ${giftee} doesn't know it's you.`,
    }),
    text: `Hi ${i.name}, ${i.giftee} just updated their Secret Santa questionnaire.\n\nSee their answers: ${i.link}\n\nShh, keep it a secret.`,
  };
}

export function reminderEmail(i: { to: string; name: string; groupName: string; link: string }): OutgoingEmail {
  return {
    to: i.to,
    subject: `Your Secret Santa is waiting to hear what you'd like`,
    html: layout({
      preheader: "Five minutes now saves your Santa a lot of guessing.",
      icon: "&#127877;",
      eyebrow: escape(i.groupName),
      heading: "Help your Secret Santa out",
      body: [
        para(`Hi ${escape(i.name)}, someone in <strong>${escape(i.groupName)}</strong> is shopping for you and would love a few hints.`),
        callout(
          `<strong>Your questionnaire covers:</strong><br>&#127873;&nbsp; Things you like<br>&#128085;&nbsp; Sizes and favorite colors<br>&#128683;&nbsp; Anything to avoid`,
          "plain",
        ),
        para(`It takes about 5 minutes, and you can come back and change it any time.`),
      ].join("\n"),
      button: { label: "Fill out my questionnaire", url: i.link },
      footer: "You can update your answers as often as you like.",
    }),
    text: `Hi ${i.name}, your Secret Santa in ${i.groupName} would love a few hints.\n\nFill out your questionnaire (about 5 minutes): ${i.link}`,
  };
}
