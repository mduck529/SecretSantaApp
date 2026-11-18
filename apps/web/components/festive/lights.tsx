/**
 * A string of twinkling Christmas lights draped across the top of every page.
 * Pure SVG + CSS, decorative only.
 */
const SWAGS = 4;
const SAG = 16; // px the wire dips in the middle of each swag
const TOP = 4;

export function Lights() {
  const wire = Array.from({ length: SWAGS }, (_, i) => {
    const x0 = i * 100;
    return `M${x0} ${TOP} Q${x0 + 50} ${TOP + 2 * SAG} ${x0 + 100} ${TOP}`;
  }).join(" ");

  const bulbs = Array.from({ length: SWAGS }, (_, i) =>
    [0.25, 0.5, 0.75].map((t) => ({
      left: ((i + t) / SWAGS) * 100,
      top: TOP + 4 * SAG * t * (1 - t),
    }))
  ).flat();

  return (
    <div className="lights" aria-hidden="true">
      <svg viewBox={`0 0 ${SWAGS * 100} 40`} preserveAspectRatio="none">
        <path d={wire} vectorEffect="non-scaling-stroke" />
      </svg>
      {bulbs.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, top: `${b.top}px` }} />
      ))}
    </div>
  );
}
