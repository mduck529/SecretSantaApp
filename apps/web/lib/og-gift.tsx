/** A wrapped present drawn with flexbox divs, for next/og images (icon and link preview). */
export function Gift({ scale }: { scale: number }) {
  const u = (n: number) => n * scale;
  return (
    <div style={{ position: "relative", width: u(120), height: u(122), display: "flex" }}>
      <div style={{ position: "absolute", left: u(18), top: u(30), width: u(48), height: u(30), border: `${u(10)}px solid #e2b04a`, borderRadius: u(30), transform: "rotate(-18deg)" }} />
      <div style={{ position: "absolute", left: u(54), top: u(30), width: u(48), height: u(30), border: `${u(10)}px solid #e2b04a`, borderRadius: u(30), transform: "rotate(18deg)" }} />
      <div style={{ position: "absolute", left: u(8), top: u(64), width: u(104), height: u(58), background: "#a51c30", borderRadius: u(6) }} />
      <div style={{ position: "absolute", left: 0, top: u(50), width: u(120), height: u(22), background: "#c22a40", borderRadius: u(6) }} />
      <div style={{ position: "absolute", left: u(51), top: u(50), width: u(18), height: u(72), background: "#e2b04a" }} />
    </div>
  );
}
