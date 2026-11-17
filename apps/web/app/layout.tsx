import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Nunito } from "next/font/google";
import { Lights } from "@/components/festive/lights";
import { Snow } from "@/components/festive/snow";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"], axes: ["opsz"] });
const body = Nunito({ subsets: ["latin"], variable: "--font-body" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Secret Santa",
  description: "Draw names, share what you'd love, and find the right gift.",
  appleWebApp: { title: "Secret Santa", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6eee1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1a2d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`}>
      <body>
        <Snow />
        <Lights />
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
