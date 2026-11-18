import { QUESTIONNAIRE, wishlistLinks, type Answers, type Question } from "@santa/core";

/** Answers that a Santa must not miss, shown first in a "heads up" note. */
const HEADS_UP = new Set(["please_no", "allergies"]);

function isSize(q: Question) {
  return /size/i.test(q.key);
}

/** Short chip label: "Shirt / top size" → "Shirt / top". */
function sizeLabel(label: string) {
  return label.replace(/\s*sizes?\b/i, "").replace(/\s*\(.*\)$/, "").trim() || label;
}

/**
 * "Santa's file": a giftee's answers, read-only, for their Secret Santa.
 * Sizes become a quick-glance row and the "please no" answers get a heads-up note;
 * everything else is grouped by section. Driven by QUESTIONNAIRE, so new
 * questions appear automatically.
 */
export function AnswersView({ answers, name }: { answers: Answers; name: string }) {
  const all = QUESTIONNAIRE.flatMap((s) => s.questions);
  const sizes = all.filter((q) => isSize(q) && answers[q.key]);
  const headsUp = all.filter((q) => HEADS_UP.has(q.key) && answers[q.key]);
  const links = wishlistLinks(answers);
  const shown = new Set([...sizes, ...headsUp].map((q) => q.key));

  return (
    <div className="file">
      {sizes.length ? (
        <ul className="sizes" aria-label="Sizes">
          {sizes.map((q) => (
            <li key={q.key}>
              <span>{sizeLabel(q.label)}</span> {answers[q.key]}
            </li>
          ))}
        </ul>
      ) : null}

      {headsUp.length ? (
        <div className="heads-up">
          <p className="heads-up-title">Heads up from {name}</p>
          <dl>
            {headsUp.map((q) => (
              <div key={q.key}>
                <dt>{q.label}</dt>
                <dd>{answers[q.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {QUESTIONNAIRE.map((section) => {
        const rows = section.questions.filter((q) => answers[q.key] && !shown.has(q.key));
        if (!rows.length) return null;
        return (
          <section key={section.title} className="file-section">
            <h3>{section.title}</h3>
            <dl>
              {rows.map((q) => (
                <div key={q.key}>
                  <dt>{q.key === "wishlist" ? "Wish list" : q.label}</dt>
                  <dd>
                    {q.key === "wishlist" && links.length ? (
                      <span className="links">
                        {links.map((href) => (
                          <a key={href} className="link-button" href={href} target="_blank" rel="noopener noreferrer nofollow">
                            {prettyLink(href)}
                            <span aria-hidden="true"> ↗</span>
                          </a>
                        ))}
                      </span>
                    ) : (
                      answers[q.key]
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

function prettyLink(href: string) {
  try {
    const u = new URL(href);
    const path = u.pathname.length > 1 ? u.pathname.slice(0, 28) + (u.pathname.length > 28 ? "…" : "") : "";
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return href;
  }
}
