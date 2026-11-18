"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device preferences for the festive extras (snow and sound).
 * Stored in localStorage; every read/write tolerates storage being unavailable.
 */
export type Pref = "snow" | "sound";

const KEY: Record<Pref, string> = { snow: "santa:snow", sound: "santa:sound" };
const EVENT = "santa:prefs";

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function readPref(pref: Pref): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(KEY[pref]);
    if (v === "on") return true;
    if (v === "off") return false;
  } catch {}
  // Defaults: snow on unless the person asked their device for less motion; sound on.
  return pref === "snow" ? !reducedMotion() : true;
}

export function writePref(pref: Pref, on: boolean) {
  try {
    window.localStorage.setItem(KEY[pref], on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** React hook: current value of a preference (false during server render). */
export function usePref(pref: Pref): boolean {
  return useSyncExternalStore(subscribe, () => readPref(pref), () => false);
}
