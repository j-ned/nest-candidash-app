#!/usr/bin/env bash
set -euo pipefail

# Postgres local jetable pour tester la migration Drizzle sans toucher la prod.
DUMP="${1:-$HOME/Bureau/candidash_db_2026-05-30_102657.dump}"
CONTAINER="candidash-migr-test"
PORT=5456
PASS="testpass"

# Utilise docker, sinon podman.
DOCKER="$(command -v docker || command -v podman)"

"$DOCKER" rm -f "$CONTAINER" 2>/dev/null || true
"$DOCKER" run -d --name "$CONTAINER" \
  -e POSTGRES_USER=djoudj \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB=candidash_db \
  -p "$PORT:5432" docker.io/library/postgres:18

echo "Attente du démarrage de Postgres..."
until "$DOCKER" exec "$CONTAINER" pg_isready -U djoudj -d candidash_db >/dev/null 2>&1; do
  sleep 1
done

# Restauration (le dump contient déjà le schéma + données ; --clean --if-exists pour idempotence).
"$DOCKER" exec -i "$CONTAINER" pg_restore --clean --if-exists --no-owner -U djoudj -d candidash_db < "$DUMP" || true

echo "Base restaurée sur postgresql://djoudj:$PASS@localhost:$PORT/candidash_db"
echo "Tables :"
"$DOCKER" exec "$CONTAINER" psql -U djoudj -d candidash_db -c '\dt'
