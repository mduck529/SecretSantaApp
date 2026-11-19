import { describe, expect, it } from "vitest";
import { createLinkToken, LINK_TTL_SECONDS, linkKey, readLinkToken } from "@/lib/link-token";

const key = linkKey("server-secret");
const now = 1_800_000_000;

describe("email sign-in link tokens", () => {
  it("names who the link was sent to, and keeps working however often it's read", () => {
    const token = createLinkToken(" Nav@Example.com ", key, now);
    expect(readLinkToken(token, key, now)).toEqual({ email: "nav@example.com", expired: false });
    expect(readLinkToken(token, key, now + 60)).toEqual({ email: "nav@example.com", expired: false });
  });

  it("an older link still works after a newer one is made", () => {
    const first = createLinkToken("nav@example.com", key, now);
    const second = createLinkToken("nav@example.com", key, now + 14 * 60);
    expect(first).not.toBe(second);
    expect(readLinkToken(first, key, now + 15 * 60)?.expired).toBe(false);
    expect(readLinkToken(second, key, now + 15 * 60)?.expired).toBe(false);
  });

  it("expires after the TTL", () => {
    const token = createLinkToken("nav@example.com", key, now);
    expect(readLinkToken(token, key, now + LINK_TTL_SECONDS - 1)?.expired).toBe(false);
    expect(readLinkToken(token, key, now + LINK_TTL_SECONDS)?.expired).toBe(true);
  });

  it("rejects links signed with another key", () => {
    const token = createLinkToken("nav@example.com", linkKey("other-secret"), now);
    expect(readLinkToken(token, key, now)).toBeNull();
  });

  it("rejects a link edited to point at someone else", () => {
    const [v, , sig] = createLinkToken("nav@example.com", key, now).split(".");
    const forged = Buffer.from(JSON.stringify({ e: "organizer@example.com", x: now + 999 })).toString("base64url");
    expect(readLinkToken(`${v}.${forged}.${sig}`, key, now)).toBeNull();
  });

  it("rejects junk", () => {
    for (const junk of [undefined, null, 42, "", "v1", "v1.a.b", "v2.a.b", "x".repeat(5000)]) {
      expect(readLinkToken(junk, key, now)).toBeNull();
    }
  });

  it("derives a purpose-specific key rather than using the server secret directly", () => {
    expect(linkKey("server-secret").equals(Buffer.from("server-secret"))).toBe(false);
    expect(linkKey("server-secret").equals(linkKey("server-secret"))).toBe(true);
  });
});
