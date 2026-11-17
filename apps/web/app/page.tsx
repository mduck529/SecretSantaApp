import Link from "next/link";
import { redirect } from "next/navigation";
import { Present } from "@/components/festive/present";
import { createUserClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return (
    <main className="narrow landing">
      <div className="hero-art" aria-hidden="true">
        <span className="tree">
          <span className="tree-star" />
        </span>
        <Present />
        <Present size="sm" />
      </div>
      <p className="eyebrow center">The family gift exchange</p>
      <h1 className="hero">Secret Santa</h1>
      <p className="lead center">Draw names, tell your Secret Santa what you&apos;d love, and find just the right gift.</p>

      <ol className="how">
        <li>
          <strong>Names are drawn</strong>
          <span>Everyone gets an email with a link to their own page.</span>
        </li>
        <li>
          <strong>Unwrap your match</strong>
          <span>Open the present to see who you&apos;re buying for. Keep it a secret!</span>
        </li>
        <li>
          <strong>Share what you&apos;d love</strong>
          <span>Only your Secret Santa sees your answers, and they get a heads-up when you update them.</span>
        </li>
      </ol>

      <p className="center">
        <Link className="button primary big" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
