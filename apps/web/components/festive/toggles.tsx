"use client";

import { usePref, writePref } from "./prefs";

export function SoundToggle() {
  const on = usePref("sound");
  return (
    <button type="button" className="toggle" aria-pressed={on} onClick={() => writePref("sound", !on)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        {on ? null : <path d="M3 3l18 18" />}
      </svg>
      {on ? "Jingle on" : "Jingle off"}
    </button>
  );
}

export function SnowToggle() {
  const on = usePref("snow");
  return (
    <button type="button" className="toggle" aria-pressed={on} onClick={() => writePref("snow", !on)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2v20M4.9 6.5l14.2 11M19.1 6.5 4.9 17.5" />
        <path d="m9 4 3 2 3-2M9 20l3-2 3 2" />
        {on ? null : <path d="M3 3l18 18" />}
      </svg>
      {on ? "Snow on" : "Snow off"}
    </button>
  );
}

/** Footer row with the per-device snow and sound switches. */
export function FestiveToggles() {
  return (
    <div className="toggles">
      <SnowToggle />
      <SoundToggle />
    </div>
  );
}
