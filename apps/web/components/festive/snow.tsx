"use client";

import { useEffect, useRef } from "react";
import { usePref } from "./prefs";

/** Gentle falling snow behind the page. Off when the person turns it off or prefers reduced motion. */
export function Snow() {
  const on = usePref("snow");
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!on || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = w < 600 ? 28 : 55;
    const flakes = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random() * 2.6,
      vy: 0.25 + Math.random() * 0.6,
      sway: Math.random() * Math.PI * 2,
    }));
    const color = getComputedStyle(document.documentElement).getPropertyValue("--snow").trim() || "#ffffff";

    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (const f of flakes) {
        f.y += f.vy;
        f.sway += 0.01;
        f.x += Math.sin(f.sway) * 0.3;
        if (f.y > h + 5) {
          f.y = -5;
          f.x = Math.random() * w;
        }
        ctx.globalAlpha = 0.35 + f.r / 6;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      ctx.clearRect(0, 0, w, h);
    };
  }, [on]);

  return <canvas ref={ref} className="snow" aria-hidden="true" hidden={!on} />;
}
