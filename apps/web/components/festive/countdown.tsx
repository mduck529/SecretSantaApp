"use client";

import { useSyncExternalStore } from "react";

/** Whole days from today (in the viewer's time zone) until a YYYY-MM-DD date. */
export function daysUntil(isoDate: string, now = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

const noop = () => () => {};

/** "23 sleeps until the exchange", shown as an ornament. Hidden once the day has passed. */
export function Countdown({ date, label }: { date: string; label: string }) {
  // Computed in the browser so "today" is the viewer's own day.
  const days = useSyncExternalStore(noop, () => daysUntil(date), () => null);
  if (days === null || days < 0) {
    return days === null ? <div className="countdown countdown-pending" aria-hidden="true" /> : null;
  }
  const text = days === 0 ? "It's gift day!" : days === 1 ? "more sleep until the exchange" : "sleeps until the exchange";
  return (
    <div className="countdown">
      <span className="countdown-n">{days === 0 ? "🎁" : days}</span>
      <span className="countdown-text">
        <b>{text}</b>
        <small>{label}</small>
      </span>
    </div>
  );
}
