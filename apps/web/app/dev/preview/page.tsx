import Link from "next/link";
import { notFound } from "next/navigation";
import type { Answers, GiftIdeas } from "@santa/core";
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
 *   /dev/preview?view=revealed     after the organizer reveals who had whom
 *   /dev/preview?view=admin        organizer page (after Send)
 *   /dev/preview?view=admin-draft  organizer page (before Match)
 */
export const metadata = { title: "Preview · Secret Santa" };

const GROUP = "00000000-0000-4000-8000-000000000001";

const SUE: Answers = {
  hobbies: "Gardening, mystery novels, and long walks with the dog. Just started pottery!",
  this_year: "Retired in June and finally have time for the garden. Also became a grandma!",
  want_to_try: "A real pottery wheel class, and seeing the tulip fields in Holland",
  fandoms: "Agatha Christie, the Great British Baking Show, the Packers",
  loves: "Lavender, anything blue, good olive oil, cozy socks, Ina Garten",
  coffee_tea: "Tea",
  sweet_salty: "Sweet",
  night_in_out: "Cozy night in",
  beach_mountains: "Both!",
  books_movies: "Books",
  cook_order: "Cook it",
  useful_fancy: "Useful",
  classic_trendy: "Classic",
  comfy_dressed: "Comfy",
  outdoors_indoors: "Outdoors",
  gadgets_handmade: "Handmade",
  keep_or_do: "Something to do",
  real_fake_tree: "Real tree",
  squishy_favorite: "Vaseline-filled",
  shirt_size: "M",
  pants_size: "8",
  shoe_size: "US women's 7.5",
  please_no: "Candles (I have 40), mugs, anything with glitter",
  allergies: "Tree nuts",
};

const IDEAS: GiftIdeas = {
  nutshell:
    "A tea-loving homebody who'd pick a cozy night in with a good mystery over a night out. Newly retired and newly a grandma, they're throwing themselves into the garden and pottery, and they love classic, handmade things they'll actually use.",
  retail: [
    {
      title: "Beginner pottery tool set",
      reason: "She just started pottery and loves working with her hands.",
      based_on: "hobbies",
      estimated_price_usd: 45,
      search_keywords: "pottery tool kit wooden",
      best_shop: "etsy",
      is_experience: false,
    },
    {
      title: "Lavender garden starter kit",
      reason: "Combines her love of gardening and lavender.",
      based_on: "loves",
      estimated_price_usd: 60,
      search_keywords: "lavender seed starter kit",
      best_shop: "amazon",
      is_experience: false,
    },
  ],
  diy: [
    {
      title: "Hand-blended Earl Grey tea tin",
      reason: "Earl Grey is her favorite; add dried lavender for a personal twist.",
      based_on: "loves",
      estimated_cost_usd: 25,
      materials: ["Loose Earl Grey", "Dried culinary lavender", "Tea tin", "Label"],
      how_to: "Mix 4 parts tea to 1 part lavender, fill the tin and hand-letter a label.",
      difficulty: "easy",
      time_needed: "under_1_hour",
    },
  ],
};

const MINE: Answers = { hobbies: "Woodworking and pickleball", loves: "Coffee, flannel, anything smoked", coffee_tea: "Coffee", shirt_size: "L" };

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
  // Sam started but hasn't finished; Leo has nothing saved.
  questionnaire_updated_at: done || i === 6 ? "2026-11-15T18:30:00Z" : null,
  match_email_status: i === 4 ? "failed" : "sent",
  last_reminded_at: i === 2 ? "2026-11-17T16:00:00Z" : null,
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
            revealed_at: null,
          }}
          members={MEMBERS}
          phones={{ [MEMBERS[0]!.id]: "+15555550123" }}
          rules={[
            { id: "r1", a_id: MEMBERS[0]!.id, b_id: MEMBERS[3]!.id, two_way: true },
            { id: "r2", a_id: MEMBERS[4]!.id, b_id: MEMBERS[5]!.id, two_way: true },
          ]}
          activity={
            draft
              ? []
              : [
                  { id: 3, label: "Questionnaire reminder sent (1 person)", actor: "Jamie Rivera", at: "2026-11-17T16:00:00Z" },
                  { id: 2, label: "Match emails sent (7 people)", actor: "Jamie Rivera", at: "2026-11-20T19:30:00Z" },
                  { id: 1, label: "Names matched (7 people)", actor: "Jamie Rivera", at: "2026-11-20T19:25:00Z" },
                ]
          }
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
            : view === "match-empty"
              ? { id: MEMBERS[1]!.id, name: "Aunt Sue", answers: null, ideas: null }
              : { id: MEMBERS[1]!.id, name: "Aunt Sue", answers: SUE, ideas: IDEAS }
        }
        revealed={
          view === "revealed"
            ? MEMBERS.map((m, i) => ({ id: m.id, giver: m.display_name, receiver: MEMBERS[(i + 1) % MEMBERS.length]!.display_name }))
            : null
        }
        mine={{ answers: MINE, complete: false }}
        saveAction={previewSave}
      />
    </>
  );
}

function PreviewNav() {
  const views = ["match", "match-empty", "waiting", "revealed", "admin", "admin-draft"];
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
