import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Reusable sign-in tokens for the links in our emails.
 *
 * Supabase keeps only one live sign-in link per person, so every new email used to
 * break the link in every earlier one. These tokens are ours instead: each says
 * "this email address, valid until this time", signed with a server-only key. Any
 * number can be valid at once, and opening one doesn't use it up. When someone
 * taps Continue, the server checks the token and signs them in.
 *
 * Format: v1.<base64url JSON {e: email, x: expiry in unix seconds}>.<base64url HMAC-SHA256>
 */

/** How long a link in an email keeps working. Long enough to cover the whole season. */
export const LINK_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

const VERSION = "v1";

/** The signing key, derived from a server secret so it's only usable for this purpose. */
export function linkKey(serverSecret: string): Buffer {
  return createHmac("sha256", serverSecret).update("secret-santa:email-link:v1").digest();
}

function sign(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

export function createLinkToken(email: string, key: Buffer, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = LINK_TTL_SECONDS): string {
  const payload = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: nowSeconds + ttlSeconds })).toString("base64url");
  const data = `${VERSION}.${payload}`;
  return `${data}.${sign(key, data)}`;
}

/**
 * Who a token was issued to and whether it has expired, or null if it's malformed or
 * wasn't signed by us. Only sign someone in when `expired` is false.
 */
export function readLinkToken(token: unknown, key: Buffer, nowSeconds = Math.floor(Date.now() / 1000)): { email: string; expired: boolean } | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const [version, payload, signature, ...rest] = token.split(".");
  if (version !== VERSION || payload === undefined || signature === undefined || rest.length) return null;
  const expected = Buffer.from(sign(key, `${version}.${payload}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: unknown; x?: unknown };
    if (typeof e !== "string" || !e.includes("@") || typeof x !== "number") return null;
    return { email: e, expired: x <= nowSeconds };
  } catch {
    return null;
  }
}
