import { DEFAULT_BUDGET, formatBudget } from "@santa/core";

export default function Home() {
  return (
    <main className="home">
      <h1>Secret Santa</h1>
      <p>Draw names, tell your Santa what you&apos;d love, and find the right gift.</p>
      <ul>
        <li>Everyone gets their match by email.</li>
        <li>Only your Secret Santa sees your answers.</li>
        <li>Budget: {formatBudget(DEFAULT_BUDGET)}</li>
      </ul>
    </main>
  );
}
