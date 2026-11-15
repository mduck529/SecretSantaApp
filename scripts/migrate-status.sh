#!/usr/bin/env bash
# Lists supabase/migrations/*.sql and marks which are recorded as applied in production.
# Read-only: it never applies anything.
#
# Needs the Supabase CLI, logged in (`supabase login`) and linked
# (`supabase link --project-ref YOUR_REF`). Usage: scripts/migrate-status.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "The Supabase CLI is not installed (https://supabase.com/docs/guides/cli)." >&2
  exit 1
fi

# `supabase migration list` prints "Local | Remote | Time" rows; take the Remote column.
remote="$(supabase migration list 2>/dev/null | awk -F'|' 'NF>=3 { gsub(/ /, "", $2); if ($2 ~ /^[0-9]+$/) print $2 }')" || {
  echo "Could not read production. Run 'supabase login' and 'supabase link' first." >&2
  exit 1
}

pending=0
for f in supabase/migrations/*.sql; do
  version="$(basename "$f" | cut -d_ -f1)"
  if grep -qx "$version" <<<"$remote"; then
    echo "applied   $(basename "$f")"
  else
    echo "PENDING   $(basename "$f")"
    pending=$((pending + 1))
  fi
done
echo
echo "$pending pending. Apply with 'supabase db push' (owner only). See docs/SETUP.md."
