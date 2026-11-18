/**
 * Plain-English labels for the organizer's activity log. The log never stores
 * pairings, and neither do these labels.
 */
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const people = (count: number | null) => (count === null ? "" : ` (${count} ${count === 1 ? "person" : "people"})`);

export function describeAudit(action: string, details: Record<string, unknown> = {}): string {
  switch (action) {
    case "group_created":
      return "Group created";
    case "draw":
      return `Names matched${people(n(details.participants))}`;
    case "redraw":
      return `Re-matched${people(n(details.participants))}`;
    case "match_cleared":
      return "Earlier matches cleared (the list changed before sending)";
    case "sent":
      return `Match emails sent${people(n(details.sent))}`;
    case "resent":
      return details.ok === false ? "Tried to resend a match email (failed)" : "Resent a match email to one person";
    case "resent_bulk":
      return `Resent match emails${people(n(details.count))}`;
    case "reminded":
      return `Questionnaire reminder sent${people(n(details.count))}`;
    case "announced":
      return `Announcement sent${people(n(details.count))}`;
    case "member_added":
      return "Person added";
    case "member_updated":
      return details.email_changed ? "Person edited (email changed)" : "Person edited";
    case "member_removed":
      return "Person removed";
    case "rule_added":
      return "Rule added";
    case "rule_removed":
      return "Rule removed";
    case "settings_updated":
      return "Settings changed";
    default:
      return action.replace(/_/g, " ");
  }
}
