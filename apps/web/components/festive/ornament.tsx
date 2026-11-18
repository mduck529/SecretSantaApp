const TONES = ["berry", "pine", "gold"] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + (last ?? "")).toUpperCase();
}

/** A person's initials on a Christmas-ornament bauble. The color is stable per name. */
export function Ornament({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tone = TONES[h % TONES.length];
  return (
    <span className={`ornament ornament-${tone} ornament-${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
