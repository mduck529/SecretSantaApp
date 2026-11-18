import Link from "next/link";
import type { StaticImageData } from "next/image";
import type { Answers, GiftIdeas } from "@santa/core";
import type { FormAction } from "./action-form";
import { GiftIdeasPanel } from "./gift-ideas";
import { AnswersView, Nutshell } from "./questionnaire";
import { QuestionnaireWizard } from "./questionnaire-wizard";
import { Countdown } from "./festive/countdown";
import { FamilyPhoto } from "./festive/family-photo";
import { GiftReveal } from "./festive/gift-reveal";
import { Ornament } from "./festive/ornament";
import { Present } from "./festive/present";
import { FestiveToggles } from "./festive/toggles";

export interface PersonViewProps {
  groupId: string;
  groupName: string;
  myName: string;
  isAdmin: boolean;
  budget: string;
  /** Formatted for display, e.g. "Thursday, December 24". */
  dateLabel: string | null;
  /** YYYY-MM-DD, for the countdown. */
  exchangeDate: string | null;
  photo: { image: StaticImageData; caption: string } | null;
  /** Null until the organizer presses Send. */
  giftee: { id: string; name: string; answers: Answers | null; ideas: GiftIdeas | null } | null;
  /** Everyone's matches, once the organizer reveals them after the exchange. */
  revealed: { id: string; giver: string; receiver: string }[] | null;
  mine: { answers: Answers; complete: boolean };
  saveAction: FormAction;
}

/** Each person's own page: their match (unwrapped the first time) and their questionnaire. */
export function PersonView(p: PersonViewProps) {
  const first = p.myName.split(" ")[0];
  const gifteeName = p.giftee?.name ?? "";
  const hasAnswers = Boolean(p.giftee?.answers && Object.keys(p.giftee.answers).length > 0);

  return (
    <main className="page">
      <header className="topbar">
        <div className="hello">
          <Ornament name={p.myName} size="lg" />
          <div>
            <p className="eyebrow">{p.groupName}</p>
            <h1 className="greeting">Hi {first}</h1>
          </div>
        </div>
        {p.isAdmin ? (
          <Link className="button small-button" href={`/g/${p.groupId}/admin`}>
            Organizer tools
          </Link>
        ) : null}
      </header>

      <FamilyPhoto photo={p.photo} />

      {p.exchangeDate && p.dateLabel ? <Countdown date={p.exchangeDate} label={p.dateLabel} /> : null}

      <section id="match" aria-label="Your match">
        {p.giftee ? (
          <GiftReveal storageKey={`santa:unwrapped:${p.groupId}:${p.giftee.id}`} gifteeName={p.giftee.name}>
            <div className="card match">
              <span className="ribbon-corner" aria-hidden="true" />
              <p className="eyebrow">You&apos;re buying for</p>
              <h2 className="giftee">{p.giftee.name}</h2>
              <p className="meta">
                Budget <strong>{p.budget}</strong>
                {p.dateLabel ? (
                  <>
                    {" · "}Exchange <strong>{p.dateLabel}</strong>
                  </>
                ) : null}
              </p>
              <Nutshell name={gifteeName} summary={p.giftee.ideas?.nutshell ?? null} hasAnswers={hasAnswers} />
              {hasAnswers ? (
                <AnswersView answers={p.giftee.answers!} name={gifteeName} />
              ) : (
                <div className="empty-note">
                  <Present size="sm" />
                  <p>
                    {gifteeName} hasn&apos;t filled out their questionnaire yet. We&apos;ll email you as soon as they do.
                  </p>
                </div>
              )}
<GiftIdeasPanel ideas={p.giftee.ideas} name={gifteeName} hasAnswers={hasAnswers} />
            </div>
          </GiftReveal>
        ) : (
          <div className="card waiting">
            <Present size="sm" />
            <div>
              <h2>Your match is on its way</h2>
              <p className="muted">
                You&apos;ll get an email when names are drawn. In the meantime, fill out your questionnaire below so your
                Secret Santa knows what you&apos;d love.
              </p>
            </div>
          </div>
        )}
      </section>

      {p.revealed ? (
        <section id="reveal" className="card">
          <p className="eyebrow">The big reveal</p>
          <h2>Who had whom</h2>
          <ul className="who-had-whom">
            {p.revealed.map((r) => (
              <li key={r.id}>
                <strong>{r.giver}</strong>
                <span className="arrow" aria-label="had">
                  →
                </span>
                <span className="to">{r.receiver}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="questionnaire" className="card">
        <p className="eyebrow">For your Secret Santa</p>
        <h2>Your questionnaire</h2>
        <p className="muted">
          Help your Secret Santa get to know you, so they can find a gift that really fits. Only they can see your answers.{" "}
          {p.mine.complete ? "You can update it anytime." : "It takes about 5 minutes."}
        </p>
        <QuestionnaireWizard groupId={p.groupId} answers={p.mine.answers} complete={p.mine.complete} action={p.saveAction} />
      </section>

      <footer className="footer">
        <FestiveToggles />
        <form action="/auth/signout" method="post">
          <button type="submit" className="link">
            Sign out
          </button>
        </form>
      </footer>
    </main>
  );
}
