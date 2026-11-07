import Link from "next/link";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/home");

  return (
    <main className="narrow">
      <h1 className="hero">🎁 Secret Santa</h1>
      <p className="lead">Draw names, tell your Secret Santa what you&apos;d love, and find the right gift.</p>
      <ul className="bullets">
        <li>Everyone gets their match by email.</li>
        <li>Only your Secret Santa sees your answers.</li>
        <li>Your Santa gets a heads-up whenever you update your wish list.</li>
      </ul>
      <p>
        <Link className="button primary" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
