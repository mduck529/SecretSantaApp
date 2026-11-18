"use client";

import { useSyncExternalStore } from "react";

const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
const noSubscription = () => () => {};

/**
 * A timestamp shown in the viewer's own timezone ("Nov 14, 3:05 PM"). The server doesn't know
 * the viewer's timezone, so it renders a UTC date first and the browser swaps in local time.
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noSubscription,
    () => new Date(iso).toLocaleString("en-US", options),
    () => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
  );
  return <time dateTime={iso}>{text}</time>;
}
