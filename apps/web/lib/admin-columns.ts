/**
 * The `memberships` columns the organizer page reads with the organizer's own login.
 * Row Level Security column grants (migration 20261116000000, security review M-2) allow only
 * these, so anything else makes the query fail and the page render empty. A test checks this list
 * against the migration. Never add `match_email_sent_at` or `match_email_retry`: after an add or
 * remove they show whose match changed.
 */
export const ADMIN_MEMBER_COLUMNS =
  "id, display_name, email, role, user_id, questionnaire_complete, match_email_status";
