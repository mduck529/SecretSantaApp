import { BOTH, NEITHER, QUESTIONNAIRE, THIS_OR_THAT, squishyFavorite, type Answers, type Question } from "@santa/core";

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
        if (section.questions.some((q) => q.kind === "this_or_that")) {
          return <ThisOrThatAnswers key={section.title} title={section.title} answers={answers} />;
        }
        const rows = section.questions.filter((q) => answers[q.key] && !shown.has(q.key));
        if (!rows.length) return null;
        return (
          <section key={section.title} className="file-section">
            <h3>{section.title}</h3>
            <dl>
              {rows.map((q) => (
                <div key={q.key}>
                  <dt>{q.label}</dt>
                  <dd>{answers[q.key]}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Their exact this-or-that answers: both options of each pair, with what they picked
 * highlighted ("Both!" highlights both, "Neither" neither).
 */
function ThisOrThatAnswers({ title, answers }: { title: string; answers: Answers }) {
  const answered = THIS_OR_THAT.filter((q) => answers[q.key]);
  const squishy = squishyFavorite(answers); // nothing for "Not into squishies" or blank
  if (!answered.length && !squishy) return null;
  return (
    <section className="file-section">
      <h3>{title}</h3>
      <ul className="tot-answers">
        {answered.map((q) => {
          const v = answers[q.key]!;
          const chosen = (label: string) => v === BOTH || v === label;
          return (
            <li key={q.key} aria-label={`${q.label} ${v}`}>
              {q.options.map((o, i) => (
                <span key={o.label} className="tot-answer-side">
                  {i === 1 ? <span className="tot-answer-or" aria-hidden="true">or</span> : null}
                  <span className={chosen(o.label) ? "tot-answer picked" : "tot-answer"} aria-hidden="true">
                    {o.emoji} {o.label}
                  </span>
                </span>
              ))}
              {v === BOTH || v === NEITHER ? <span className="tot-answer-note" aria-hidden="true">{v}</span> : null}
            </li>
          );
        })}
      </ul>
      {squishy ? (
        <div className="squishy-fav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={squishy.image} alt="" width={72} height={72} loading="lazy" />
          <span>
            <span className="squishy-fav-label">Favorite squishy</span>
            <span className="squishy-fav-name">{squishy.label}</span>
            <span className="squishy-fav-blurb">{squishy.blurb}</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * "Aunt Sue in a nutshell": a short summary Claude writes from their answers, together with the
 * gift ideas. Until it's ready, a placeholder shows once they've answered something.
 */
export function Nutshell({ name, summary, hasAnswers }: { name: string; summary: string | null; hasAnswers: boolean }) {
  if (!summary && !hasAnswers) return null;
  return (
    <div className="nutshell">
      <p className="nutshell-title">{name} in a nutshell</p>
      {summary ? (
        <p className="nutshell-text">{summary}</p>
      ) : (
        <p className="muted small">The elves are still getting to know {name}. Check back soon for a little summary.</p>
      )}
    </div>
  );
}
