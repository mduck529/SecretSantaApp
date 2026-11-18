import { ImageResponse } from "next/og";
import { Gift } from "@/lib/og-gift";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: a wrapped present on evergreen. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#1f4d3a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Gift scale={1} />
      </div>
    ),
    size
  );
}
