"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { QUESTIONNAIRE, type Answers, type Question } from "@santa/core";
import type { FormAction } from "./action-form";
import { burst } from "./festive/effects";

type Intent = "next" | "finish" | "stay";

/**
 * The questionnaire, one section per screen. Every "Save & continue" saves all
 * answers so far (partial saves are fine). Built from QUESTIONNAIRE, so new or
 * changed questions show up without layout changes.
 */
export function QuestionnaireWizard({
  groupId,
  answers,
  complete,
  action,
}: {
  groupId: string;
  answers: Answers;
  complete: boolean;
  action: FormAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const intent = useRef<Intent>("stay");
  const root = useRef<HTMLDivElement>(null);
  const total = QUESTIONNAIRE.length;

  useEffect(() => {
    if (!state?.ok) return;
    if (intent.current === "next") {
      setStep((s) => Math.min(s + 1, total - 1));
      root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (intent.current === "finish") {
      setFinished(true);
      root.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => burst(root.current), 200);
    }
    intent.current = "stay";
  }, [state, total]);

  const go = (i: number) => {
    setFinished(false);
    setStep(i);
  };
  const last = step === total - 1;
  const nowComplete = state?.complete ?? complete;

  return (
    <div className="wizard" ref={root}>
      <ol className="wizard-steps" aria-label="Questionnaire sections">
        {QUESTIONNAIRE.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => go(i)}
              aria-current={!finished && i === step ? "step" : undefined}
              className={finished || i < step ? "done" : undefined}
            >
              <span className="wizard-dot">{finished || i < step ? "✓" : i + 1}</span>
              <span className="wizard-name">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="cane" aria-hidden="true">
        <i style={{ width: `${finished ? 100 : ((step + 1) / (total + 1)) * 100}%` }} />
      </div>

      {/* Submitted by hand (not via the form's action prop) so React doesn't reset
          the fields to their initial values after every save. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        <input type="hidden" name="group_id" value={groupId} />
        {QUESTIONNAIRE.map((section, i) => (
          <fieldset key={section.title} hidden={finished || i !== step}>
            <legend>
              <span className="eyebrow">
                Part {i + 1} of {total}
              </span>
              {section.title}
            </legend>
            {section.questions.map((q) => (
              <Field key={q.key} q={q} value={answers[q.key] ?? ""} />
            ))}
          </fieldset>
        ))}

        {finished ? (
          <div className="wizard-done">
            <p className="hand">All wrapped up!</p>
            <p>
              {nowComplete
                ? "Your Secret Santa will get a heads-up that your answers are ready. You can come back and change them anytime."
                : "Saved. When you get a minute, fill in the starred questions so your Santa has the basics."}
            </p>
            <button type="button" onClick={() => go(0)}>
              Look over my answers
            </button>
          </div>
        ) : (
          <div className="wizard-nav">
            <button type="button" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0} className="ghost">
              Back
            </button>
            <button
              type="submit"
              className="primary"
              disabled={pending}
              aria-busy={pending}
              onClick={() => (intent.current = last ? "finish" : "next")}
            >
              {pending ? "Saving…" : last ? "Wrap it up" : "Save & continue"}
            </button>
          </div>
        )}
        {state && !state.ok ? (
          <p role="status" className="notice error">
            {state.message}
          </p>
        ) : state?.ok && !finished ? (
          <p role="status" className="saved">
            Saved ✓
          </p>
        ) : null}
      </form>
    </div>
  );
}

function Label({ q }: { q: Question }) {
  return (
    <span className="q-label">
      {q.label}
      {q.required ? (
        <span className="req" aria-label="required">
          {" "}
          *
        </span>
      ) : null}
      {q.hint ? <small>{q.hint}</small> : null}
    </span>
  );
}

function Field({ q, value }: { q: Question; value: string }) {
  if (q.kind === "choice") return <Choice q={q} value={value} />;
  if (q.kind === "long_text") {
    return (
      <label>
        <Label q={q} />
        <textarea name={q.key} defaultValue={value} maxLength={q.maxLength} rows={3} />
      </label>
    );
  }
  return (
    <label>
      <Label q={q} />
      <input name={q.key} defaultValue={value} maxLength={q.maxLength} />
    </label>
  );
}

/** A choice question as tappable chips (radio buttons underneath). */
function Choice({ q, value }: { q: Extract<Question, { kind: "choice" }>; value: string }) {
  const [picked, setPicked] = useState(value);
  return (
    <div className="choice" role="radiogroup" aria-labelledby={`q-${q.key}`}>
      <span id={`q-${q.key}`}>
        <Label q={q} />
      </span>
      <input type="hidden" name={q.key} value={picked} />
      <div className="chips">
        {q.options.map((o) => (
          <label key={o} className="chip-option">
            <input type="radio" name={`${q.key}__pick`} value={o} checked={picked === o} onChange={() => setPicked(o)} />
            <span>{o}</span>
          </label>
        ))}
        {picked ? (
          <button type="button" className="link small" onClick={() => setPicked("")}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
