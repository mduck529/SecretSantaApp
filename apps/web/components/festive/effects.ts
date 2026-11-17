"use client";

import { readPref } from "./prefs";

/* ------------------------------------------------------------------ */
/* Confetti                                                            */
/* ------------------------------------------------------------------ */

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; c: string; life: number };

let canvas: HTMLCanvasElement | null = null;
let pieces: Piece[] = [];
let running = false;
const LIFE = 170;

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas!.width = window.innerWidth * dpr;
    canvas!.height = window.innerHeight * dpr;
    canvas!.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener("resize", size);
  return canvas;
}

function tick() {
  const ctx = canvas!.getContext("2d")!;
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  for (const p of pieces) {
    p.vy += 0.28;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, 1 - p.life / LIFE);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
    ctx.restore();
  }
  pieces = pieces.filter((p) => p.life < LIFE && p.y < h + 40);
  if (pieces.length) requestAnimationFrame(tick);
  else {
    running = false;
    ctx.clearRect(0, 0, w, h);
  }
}

/** A burst of confetti from the middle of an element, in the theme's colors. */
export function burst(from: Element | null, amount = 150) {
  if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ensureCanvas();
  const r = from.getBoundingClientRect();
  const cs = getComputedStyle(document.documentElement);
  const colors = ["--berry", "--pine", "--gold", "--gold-soft"].map((v) => cs.getPropertyValue(v).trim()).concat("#ffffff");
  const ox = r.left + r.width / 2;
  const oy = r.top + Math.min(r.height * 0.45, window.innerHeight * 0.5);
  for (let i = 0; i < amount; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = 5 + Math.random() * 9;
    pieces.push({
      x: ox,
      y: oy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.4,
      c: colors[i % colors.length]!,
      life: 0,
    });
  }
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

/* ------------------------------------------------------------------ */
/* Sound: sleigh bells and "Jingle Bells" on a glockenspiel, synthesized */
/* ------------------------------------------------------------------ */

let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (!readPref("sound")) return null;
  if (!ac) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    noise = ac.createBuffer(1, ac.sampleRate * 0.25, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

function out(ctx: AudioContext, level: number) {
  const g = ctx.createGain();
  g.gain.value = level;
  g.connect(ctx.destination);
  return g;
}

function bell(ctx: AudioContext, t: number, f: number, vel: number, dest: AudioNode) {
  for (const [ratio, amp, decay] of [
    [1, 1, 1.3],
    [2.76, 0.4, 0.55],
    [5.4, 0.18, 0.3],
    [8.9, 0.07, 0.18],
  ] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f * ratio;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  }
}

function shake(ctx: AudioContext, t: number, vel: number, dest: AudioNode) {
  for (let k = 0; k < 3; k++) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 6500 + k * 1400;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    const tt = t + k * 0.018;
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.linearRampToValueAtTime(0.5 * vel, tt + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.11);
    s.connect(bp).connect(g).connect(dest);
    s.start(tt);
    s.stop(tt + 0.14);
  }
}

/** A quick shake of sleigh bells (e.g. when the present wiggles). */
export function sleighBells() {
  const ctx = audio();
  if (!ctx) return;
  const dest = out(ctx, 0.35);
  const t = ctx.currentTime + 0.02;
  shake(ctx, t, 1, dest);
  shake(ctx, t + 0.14, 0.7, dest);
  shake(ctx, t + 0.28, 0.9, dest);
}

/** The opening of "Jingle Bells" with sleigh bells, about three seconds. */
export function jingle() {
  const ctx = audio();
  if (!ctx) return;
  const dest = out(ctx, 0.22);
  const E = 1318.5, G = 1568, C = 1046.5, D = 1174.7;
  const beat = 0.19;
  const tune: [number, number][] = [[E, 1], [E, 1], [E, 2], [E, 1], [E, 1], [E, 2], [E, 1], [G, 1], [C, 1.5], [D, 0.5], [E, 4]];
  const t0 = ctx.currentTime + 0.05;
  let t = t0;
  for (const [f, d] of tune) {
    bell(ctx, t, f, 0.8, dest);
    t += d * beat;
  }
  for (let i = 0; i < 13; i++) shake(ctx, t0 + i * beat, i % 2 ? 0.55 : 0.9, dest);
}
