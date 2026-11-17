import Link from "next/link";
import { notFound } from "next/navigation";
import type { Answers } from "@santa/core";
import { AdminView, type AdminMember } from "@/components/admin-view";
import { PersonView } from "@/components/person-view";
import { familyPhoto } from "@/lib/family-photo";
import { previewSave } from "./actions";

/**
 * Development-only gallery of the signed-in screens with made-up data, so the
 * design can be checked without a database. Returns 404 in production.
 *
 *   /dev/preview?view=match        match sent, giftee has answers
 *   /dev/preview?view=match-empty  match sent, giftee hasn't answered yet
 *   /dev/preview?view=waiting      names not drawn yet
 *   /dev/preview?view=admin        organizer page (after Send)
 *   /dev/preview?view=admin-draft  organizer page (before Match)
 */
export const metadata = { title: "Preview · Secret Santa" };

const GROUP = "00000000-0000-4000-8000-000000000001";

const SUE: Answers = {
  hobbies: "Gardening, mystery novels, and long walks with the dog. Just started pottery!",
  loves: "Lavender, anything blue, good olive oil, cozy socks, Ina Garten",
  please_no: "Candles (I have 40), mugs, anything with glitter",
  fandoms: "Agatha Christie, the Great British Baking Show, the Packers",
  favorite_colors: "Navy, sage green",
  treats: "Earl Grey, dark chocolate with sea salt, a nice Pinot Noir",
  stores: "Anthropologie, Williams Sonoma, the local nursery",
  experiences: "Love them",
  shirt_size: "M",
  pants_size: "8",
  shoe_size: "US women's 7.5",
  allergies: "Tree nuts",
  wishlist: "https://www.amazon.com/hz/wishlist/ls/EXAMPLE123\nhttps://www.etsy.com/listing/1234/handmade-pottery-tools",
};

const MINE: Answers = { hobbies: "Woodworking and pickleball", loves: "Coffee, flannel, anything smoked", shirt_size: "L" };

const MEMBERS: AdminMember[] = [
  ["Jamie Rivera", "jamie@example.com", "organizer", true, true],
  ["Aunt Sue", "sue@example.com", "member", true, true],
  ["Grandpa Joe", "joe@example.com", "member", true, false],
  ["Maria Rivera", "maria@example.com", "member", true, true],
  ["Leo Chen", "leo@example.com", "member", false, false],
  ["Priya Chen", "priya@example.com", "member", true, true],
  ["Sam Okafor", "sam@example.com", "member", true, false],
].map(([name, email, role, signedIn, done], i) => ({
  id: `00000000-0000-4000-8000-0000000001${i}0`,
  display_name: name as string,
  email: email as string,
  role: role as string,
  user_id: signedIn ? "x" : null,
  questionnaire_complete: done as boolean,
  match_email_status: i === 4 ? "failed" : "sent",
}));

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const view = (await searchParams).view ?? "match";

  if (view.startsWith("admin")) {
    const draft = view === "admin-draft";
    return (
      <>
        <PreviewNav />
        <AdminView
          groupId={GROUP}
          group={{
            name: "Rivera Family Christmas 2026",
            status: draft ? "draft" : "sent",
            budget: "$100–$150",
            dateLabel: "Thursday, December 24",
            budget_min_cents: 10000,
            budget_max_cents: 15000,
            exchange_date: "2026-12-24",
            sent_at: draft ? null : "2026-11-20T19:30:00Z",
          }}
          members={MEMBERS}
          phones={{ [MEMBERS[0]!.id]: "+15555550123" }}
          rules={[
            { id: "r1", a_id: MEMBERS[0]!.id, b_id: MEMBERS[3]!.id, two_way: true },
            { id: "r2", a_id: MEMBERS[4]!.id, b_id: MEMBERS[5]!.id, two_way: true },
          ]}
        />
      </>
    );
  }

  return (
    <>
      <PreviewNav />
      <PersonView
        groupId={GROUP}
        groupName="Rivera Family Christmas 2026"
        myName="Jamie Rivera"
        isAdmin
        budget="$100–$150"
        dateLabel="Thursday, December 24"
        exchangeDate="2026-12-24"
        photo={familyPhoto}
        giftee={
          view === "waiting"
            ? null
            : { id: MEMBERS[1]!.id, name: "Aunt Sue", answers: view === "match-empty" ? null : SUE }
        }
        mine={{ answers: MINE, complete: false }}
        saveAction={previewSave}
      />
    </>
  );
}

function PreviewNav() {
  const views = ["match", "match-empty", "waiting", "admin", "admin-draft"];
  return (
    <nav className="toggles" style={{ padding: "0.5rem 16px" }} aria-label="Preview screens">
      {views.map((v) => (
        <Link key={v} className="button small-button" href={`/dev/preview?view=${v}`}>
          {v}
        </Link>
      ))}
    </nav>
  );
}
