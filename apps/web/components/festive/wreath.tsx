/** A wreath that fills with holly as people finish their questionnaires. */
export function Wreath({ done, total }: { done: number; total: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  return (
    <div className="wreath" role="img" aria-label={`${done} of ${total} questionnaires done`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="wreath-track" cx="50" cy="50" r={r} />
        <circle
          className="wreath-fill"
          cx="50"
          cy="50"
          r={r}
          strokeDasharray={`${c * share} ${c}`}
          transform="rotate(-90 50 50)"
        />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const lit = i / 12 < share;
          return <circle key={i} className={lit ? "berry lit" : "berry"} cx={50 + r * Math.cos(a)} cy={50 + r * Math.sin(a)} r="3.4" />;
        })}
        <path className="wreath-bow" d="M50 88 l-11 -7 v12 z M50 88 l11 -7 v12 z" />
      </svg>
      <span className="wreath-n">
        {done}
        <small>/{total}</small>
      </span>
    </div>
  );
}
