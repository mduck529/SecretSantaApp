import { SubmitButton } from "@/components/action-form";
import { Present } from "@/components/festive/present";
import { redirect } from "next/navigation";
import { deadLinkOutcome, safeNext } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { emailLinkKey } from "@/lib/links";
import { readLinkToken } from "@/lib/link-token";
import { confirmSignIn } from "./actions";

export const metadata = { title: "Continue · Secret Santa" };

/**
 * Sign-in links land here. The extra "Continue" tap means email link scanners
 * (which open links automatically) never sign anyone in or use up a one-time token.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; token_hash?: string; type?: string; next?: string; email?: string }>;
}) {
  const sp = await searchParams;
  const linkEmail = sp.link ? readLinkToken(sp.link, emailLinkKey())?.email : sp.email;
  // Already signed in as the person this link was sent to: skip straight to their page.
  if (linkEmail) {
    const supabase = await createUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (deadLinkOutcome(user?.email, linkEmail) === "go") redirect(safeNext(sp.next));
  }
  return (
    <main className="narrow center">
      <div className="card form-card">
        <Present />
        <p className="eyebrow">Secret Santa</p>
        <h1>Something&apos;s waiting for you</h1>
        <form action={confirmSignIn} className="stack">
          <input type="hidden" name="link" value={sp.link ?? ""} />
          <input type="hidden" name="token_hash" value={sp.token_hash ?? ""} />
          <input type="hidden" name="type" value={sp.type ?? "email"} />
          <input type="hidden" name="next" value={safeNext(sp.next)} />
          <input type="hidden" name="email" value={sp.email ?? ""} />
          <SubmitButton className="primary big" pendingText="Signing you in…">
            Continue
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
