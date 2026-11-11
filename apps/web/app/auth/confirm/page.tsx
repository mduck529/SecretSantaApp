import { SubmitButton } from "@/components/action-form";
import { redirect } from "next/navigation";
import { deadLinkOutcome, safeNext } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { confirmSignIn } from "./actions";

export const metadata = { title: "Continue · Secret Santa" };

/**
 * Sign-in links land here. The extra "Continue" tap keeps email link scanners
 * (which open links automatically) from using up the one-time sign-in token.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string; email?: string }>;
}) {
  const sp = await searchParams;
  // Already signed in as the person this link was sent to: skip straight to their page.
  if (sp.email) {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (deadLinkOutcome(user?.email, sp.email) === "go") redirect(safeNext(sp.next));
  }
  return (
    <main className="narrow center">
      <h1>🎁 Secret Santa</h1>
      <form action={confirmSignIn} className="stack">
        <input type="hidden" name="token_hash" value={sp.token_hash ?? ""} />
        <input type="hidden" name="type" value={sp.type ?? "email"} />
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <input type="hidden" name="email" value={sp.email ?? ""} />
        <SubmitButton className="primary big" pendingText="Signing you in…">
          Continue
        </SubmitButton>
      </form>
    </main>
  );
}
