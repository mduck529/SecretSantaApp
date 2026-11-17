"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Present } from "./present";
import { burst, jingle, sleighBells } from "./effects";
import { SoundToggle } from "./toggles";

type Phase = "wrapped" | "shake" | "open" | "shown";

function readUnwrapped(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
const noSubscribe = () => () => {};

/**
 * The match reveal. The first time someone sees a given match they unwrap a present;
 * a gift tag rises out with the name, confetti bursts and the jingle plays.
 * After that (remembered on this device) the match card shows straight away,
 * with a button to unwrap it again.
 */
export function GiftReveal({ storageKey, gifteeName, children }: { storageKey: string; gifteeName: string; children: ReactNode }) {
  // Whether this device already unwrapped this match (false while rendering on the server).
  const unwrappedBefore = useSyncExternalStore(noSubscribe, () => readUnwrapped(storageKey), () => false);
  // Null until the person interacts; until then the stored flag decides.
  const [chosen, setChosen] = useState<Phase | null>(null);
  const phase: Phase = chosen ?? (unwrappedBefore ? "shown" : "wrapped");
  const setPhase = setChosen;
  const stage = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const unwrap = () => {
    if (phase !== "wrapped") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase("shake");
    sleighBells();
    timers.current.push(
      window.setTimeout(
        () => {
          setPhase("open");
          jingle();
          timers.current.push(window.setTimeout(() => burst(stage.current), 250));
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {}
        },
        reduce ? 0 : 520
      )
    );
  };

  const replay = () => {
    setPhase("wrapped");
    stage.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      {phase !== "shown" ? (
        <div className="reveal card" ref={stage} data-phase={phase}>
          <p className="reveal-hint">
            <span className="eyebrow">Names have been drawn</span>
            <span className="reveal-title">Tap the present to see who you&apos;re buying for</span>
          </p>
          <button type="button" className="reveal-gift" onClick={unwrap} aria-label="Unwrap the present to see who you're buying for" disabled={phase !== "wrapped"}>
            <Present>
              <span className="tag-wrap">
                <span className="gift-tag">
                  <small>You&apos;re Secret Santa for</small>
                  <strong>{gifteeName}</strong>
                </span>
              </span>
            </Present>
          </button>
          <div className="reveal-foot">
            <SoundToggle />
          </div>
          {phase === "open" ? (
            <p className="sr-only" role="status">
              You&apos;re Secret Santa for {gifteeName}.
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "open" || phase === "shown" ? (
        <div className={phase === "open" ? "reveal-after" : undefined}>
          {children}
          <p className="replay">
            <button type="button" className="link" onClick={replay}>
              Unwrap it again
            </button>
          </p>
        </div>
      ) : null}
    </>
  );
}
