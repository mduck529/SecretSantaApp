"use client";

import { useEffect, useState } from "react";

const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/**
 * A timestamp shown in the viewer's own timezone ("Nov 14, 3:05 PM"). The server doesn't know
 * the viewer's timezone, so it renders a UTC date first and the browser swaps in local time.
 */
export function LocalTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
  useEffect(() => setText(new Date(iso).toLocaleString("en-US", options)), [iso]);
  return <time dateTime={iso}>{text}</time>;
}
