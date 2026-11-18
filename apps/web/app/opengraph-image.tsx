import { ImageResponse } from "next/og";
import { Gift } from "@/lib/og-gift";

export const alt = "Secret Santa: draw names, share what you'd love, find the right gift.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BULBS = ["#a51c30", "#d9a93f", "#1f4d3a"];

/** The preview card shown when someone shares or texts the site link. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#f6eee1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 26, left: 40, right: 40, display: "flex", justifyContent: "space-between" }}>
          {Array.from({ length: 18 }, (_, i) => (
            <div key={i} style={{ width: 22, height: 32, borderRadius: 14, background: BULBS[i % 3], marginTop: i % 2 ? 14 : 0 }} />
          ))}
        </div>
        <Gift scale={1.7} />
        <div style={{ marginTop: 34, fontSize: 108, fontStyle: "italic", fontWeight: 700, color: "#a51c30", fontFamily: "serif" }}>Secret Santa</div>
        <div style={{ marginTop: 6, fontSize: 38, color: "#5b4f45" }}>Draw names · Unwrap your match · Share what you&apos;d love</div>
      </div>
    ),
    size
  );
}
