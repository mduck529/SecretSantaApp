import Link from "next/link";
import { redirect } from "next/navigation";
import { FamilyPhoto } from "@/components/festive/family-photo";
import { Present } from "@/components/festive/present";
import { FestiveToggles } from "@/components/festive/toggles";
import { canCreateGroups, requireUser } from "@/lib/auth";
import { familyPhoto } from "@/lib/family-photo";

export const metadata = { title: "Your groups · Secret Santa" };

export default async function HomePage() {
  const { supabase, user } = await requireUser("/home");
  await supabase.rpc("claim_memberships");
  const { data: groups } = await supabase.from("groups").select("id, name").order("created_at", { ascending: false });

  if (groups && groups.length === 1) redirect(`/g/${groups[0]!.id}`);

  return (
    <main className="narrow">
      <p className="eyebrow">Secret Santa</p>
      <h1>Your groups</h1>
      <FamilyPhoto photo={familyPhoto} />
      {groups && groups.length ? (
        <ul className="cards">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/g/${g.id}`}>
                <Present size="sm" />
                <span>{g.name}</span>
                <span aria-hidden="true" className="arrow">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card muted">You&apos;re not in a group yet. If someone added you, use the link in their email.</p>
      )}
      {canCreateGroups(user.email) ? (
        <p>
          <Link className="button" href="/new">
            Start a new group
          </Link>
        </p>
      ) : null}
      <footer className="footer">
        <FestiveToggles />
        <form action="/auth/signout" method="post">
          <button type="submit" className="link">
            Sign out
          </button>
        </form>
      </footer>
    </main>
  );
}
