import type { DiyIdea, GiftIdeas, RetailIdea } from "@santa/core";
import { shopLinks } from "@/lib/shop-links";

const TIME_LABEL: Record<DiyIdea["time_needed"], string> = {
  under_1_hour: "Under an hour",
  a_few_hours: "A few hours",
  a_weekend: "A weekend",
};

function RetailCard({ idea }: { idea: RetailIdea }) {
  return (
    <li className="idea-card">
      <h4>{idea.title}</h4>
      <p>{idea.reason}</p>
      <p className="muted">
        About ${idea.estimated_price_usd}
        {idea.is_experience ? " · Experience" : ""}
      </p>
      <p className="shop-links">
        {shopLinks(idea.search_keywords, idea.best_shop).map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        ))}
      </p>
    </li>
  );
}

function DiyCard({ idea }: { idea: DiyIdea }) {
  return (
    <li className="idea-card">
      <h4>{idea.title}</h4>
      <p>{idea.reason}</p>
      <p className="muted">
        <span className="badge">{idea.difficulty[0]!.toUpperCase() + idea.difficulty.slice(1)}</span>{" "}
        <span className="badge">{TIME_LABEL[idea.time_needed]}</span> · Materials about ${idea.estimated_cost_usd}
      </p>
      <ul>
        {idea.materials.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      <p>{idea.how_to}</p>
    </li>
  );
}

export function GiftIdeasPanel({ ideas, name, hasAnswers }: { ideas: GiftIdeas | null; name: string; hasAnswers: boolean }) {
  return (
    <div className="ideas">
      <h3>Gift ideas</h3>
      {ideas ? (
        <>
          {!hasAnswers ? <p className="muted">These are safe picks until {name} fills in their questionnaire.</p> : null}
          {ideas.retail.length ? (
            <>
              <h4 className="idea-group">Things to buy</h4>
              <ul className="idea-list">{ideas.retail.map((i) => <RetailCard key={i.title} idea={i} />)}</ul>
            </>
          ) : null}
          {ideas.diy.length ? (
            <>
              <h4 className="idea-group">Things to make</h4>
              <ul className="idea-list">{ideas.diy.map((i) => <DiyCard key={i.title} idea={i} />)}</ul>
            </>
          ) : null}
        </>
      ) : (
        <p className="muted">The elves are busy in the workshop. Gift ideas for {name} are on their way, so check back soon.</p>
      )}
    </div>
  );
}
