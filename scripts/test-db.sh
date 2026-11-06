#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the privacy tests.
# Needs a local Postgres server (PGHOST/PGUSER etc. as usual). Usage: scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="santa_test_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q -t -o /dev/null)
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
"${PSQL[@]}" -d "$DB" -f supabase/tests/local_auth_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -d "$DB" -f "$f"; done
"${PSQL[@]}" -d "$DB" -f supabase/tests/rls_test.sql
