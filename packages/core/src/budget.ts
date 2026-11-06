/** Budgets are stored in whole cents to avoid floating-point money. */
export interface Budget {
  minCents: number;
  maxCents: number;
  currency: "USD";
}

export const DEFAULT_BUDGET: Budget = { minCents: 100_00, maxCents: 150_00, currency: "USD" };

export function formatBudget({ minCents, maxCents }: Budget): string {
  const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return minCents === maxCents ? fmt(minCents) : `${fmt(minCents)}–${fmt(maxCents)}`;
}
