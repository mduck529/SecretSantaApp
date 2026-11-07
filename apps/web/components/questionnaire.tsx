import { QUESTIONNAIRE, wishlistLinks, type Answers, type Question } from "@santa/core";

function Field({ q, value }: { q: Question; value: string }) {
  const label = (
    <span>
      {q.label}
      {q.required ? <span className="req" aria-label="required"> *</span> : null}
      {q.hint ? <small>{q.hint}</small> : null}
    </span>
  );
  if (q.kind === "choice") {
    return (
      <label>
        {label}
        <select name={q.key} defaultValue={value}>
          <option value="">—</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (q.kind === "long_text") {
    return (
      <label>
        {label}
        <textarea name={q.key} defaultValue={value} maxLength={q.maxLength} rows={3} />
      </label>
    );
  }
  return (
    <label>
      {label}
      <input name={q.key} defaultValue={value} maxLength={q.maxLength} />
    </label>
  );
}

/** The editable questionnaire fields (wrap in a form). */
export function QuestionnaireFields({ answers }: { answers: Answers }) {
  return (
    <>
      {QUESTIONNAIRE.map((section) => (
        <fieldset key={section.title}>
          <legend>{section.title}</legend>
          {section.questions.map((q) => (
            <Field key={q.key} q={q} value={answers[q.key] ?? ""} />
          ))}
        </fieldset>
      ))}
    </>
  );
}

/** Read-only view of someone's answers, for their Secret Santa. */
export function AnswersView({ answers }: { answers: Answers }) {
  const links = wishlistLinks(answers);
  return (
    <div className="answers">
      {QUESTIONNAIRE.map((section) => {
        const rows = section.questions.filter((q) => answers[q.key] && q.key !== "wishlist");
        if (!rows.length && !(section.questions.some((q) => q.key === "wishlist") && answers.wishlist)) return null;
        return (
          <section key={section.title}>
            <h3>{section.title}</h3>
            <dl>
              {rows.map((q) => (
                <div key={q.key}>
                  <dt>{q.label}</dt>
                  <dd>{answers[q.key]}</dd>
                </div>
              ))}
              {section.questions.some((q) => q.key === "wishlist") && answers.wishlist ? (
                <div>
                  <dt>Wish list</dt>
                  <dd>
                    {links.length ? (
                      <ul>
                        {links.map((href) => (
                          <li key={href}>
                            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                              {prettyLink(href)}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      answers.wishlist
                    )}
                  </dd>
                </div>
              ) : null}
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
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`;
  } catch {
    return href;
  }
}
