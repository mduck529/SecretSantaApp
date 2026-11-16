import type { Shop } from "@santa/core";

/** Shop search links built from the model's plain keywords. The model never supplies a URL. */
const SHOPS: { shop: Exclude<Shop, "any">; label: string; url: (q: string) => string }[] = [
  { shop: "amazon", label: "Amazon", url: (q) => `https://www.amazon.com/s?k=${q}` },
  { shop: "etsy", label: "Etsy", url: (q) => `https://www.etsy.com/search?q=${q}` },
  { shop: "target", label: "Target", url: (q) => `https://www.target.com/s?searchTerm=${q}` },
];

export function shopLinks(keywords: string, best: Shop): { label: string; href: string }[] {
  const q = encodeURIComponent(keywords.trim());
  const ordered = [...SHOPS].sort((a, b) => Number(b.shop === best) - Number(a.shop === best));
  return ordered.map((s) => ({ label: s.label, href: s.url(q) }));
}
