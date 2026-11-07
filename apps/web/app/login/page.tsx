import { ActionForm, SubmitButton } from "@/components/action-form";
import { safeNext } from "@/lib/auth";
import { sendLoginLink } from "./actions";

export const metadata = { title: "Sign in · Secret Santa" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; expired?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="narrow">
      <h1>Sign in</h1>
      {sp.expired ? (
        <p className="notice error">That link has expired or was already used. We&apos;ll email you a fresh one.</p>
      ) : (
        <p>Enter your email and we&apos;ll send you a link. No password needed.</p>
      )}
      <ActionForm action={sendLoginLink} className="stack">
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" defaultValue={sp.email ?? ""} />
        </label>
        <SubmitButton className="primary" pendingText="Sending…">
          Email me a sign-in link
        </SubmitButton>
      </ActionForm>
    </main>
  );
}
