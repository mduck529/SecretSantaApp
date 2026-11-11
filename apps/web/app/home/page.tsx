import Link from "next/link";
import { redirect } from "next/navigation";
import { canCreateGroups, requireUser } from "@/lib/auth";

export const metadata = { title: "Your groups · Secret Santa" };

export default async function HomePage() {
  const { supabase, user } = await requireUser("/home");
  await supabase.rpc("claim_memberships");
  const { data: groups } = await supabase.from("groups").select("id, name").order("created_at", { ascending: false });

  if (groups && groups.length === 1) redirect(`/g/${groups[0]!.id}`);

  return (
    <main className="narrow">
      <h1>Your Secret Santa groups</h1>
      {groups && groups.length ? (
        <ul className="cards">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/g/${g.id}`}>{g.name}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>You&apos;re not in a group yet. If someone added you, use the link in their email.</p>
      )}
      {canCreateGroups(user.email) ? (
        <p>
          <Link className="button" href="/new">
            Start a new group
          </Link>
        </p>
      ) : null}
      <SignOut />
    </main>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className="link">
        Sign out
      </button>
    </form>
  );
}
