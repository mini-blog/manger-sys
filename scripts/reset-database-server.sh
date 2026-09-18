#!/usr/bin/env bash
# Destructive, manual-only reset of the currently deployed StudentSys demo database.
set -Eeuo pipefail
umask 077
[[ ${1:-} == RESET_STUDENTSYS ]] || { echo 'Confirmation must be RESET_STUDENTSYS'; exit 1; }
[[ $EUID -eq 0 ]] || { echo 'Run using sudo'; exit 1; }
root=/opt/studentsys
volume=studentsys-prod_postgres_data
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment/reset is running'; exit 1; }
release=$(readlink -f "$root/current")
[[ "$release" =~ ^/opt/studentsys/releases/([0-9a-f]{40})-[0-9]+-[0-9]+$ ]] || { echo 'Invalid current release'; exit 1; }
export IMAGE_TAG=${BASH_REMATCH[1]}
[[ -f "$root/.env.prod" && -f "$release/compose.prod.yaml" ]] || { echo 'Missing deployed configuration'; exit 1; }
compose=(docker compose --project-name studentsys-prod --env-file "$root/.env.prod")
if [[ -f "$root/.env.ai" ]]; then compose+=(--env-file "$root/.env.ai"); fi
compose+=(-f "$release/compose.prod.yaml")
"${compose[@]}" config --quiet
# Fail before stopping services if any pinned deployed image is unavailable.
for service in db api web; do docker image inspect "studentsys-$service:$IMAGE_TAG" >/dev/null; done
expected_images=$(printf 'studentsys-api:%s\nstudentsys-db:%s\nstudentsys-web:%s' "$IMAGE_TAG" "$IMAGE_TAG" "$IMAGE_TAG")
[[ $("${compose[@]}" config --images | sort -u) == "$expected_images" ]] || { echo 'Unexpected release images'; exit 1; }
[[ $("${compose[@]}" config --volumes) == postgres_data ]] || { echo 'Unexpected release volumes'; exit 1; }
[[ $(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' "$volume") == studentsys-prod ]] || { echo 'Volume project mismatch'; exit 1; }
[[ $(docker volume inspect --format '{{index .Labels "com.docker.compose.volume"}}' "$volume") == postgres_data ]] || { echo 'Volume name mismatch'; exit 1; }
# Verify the deployed database actually mounts this exact volume.
db_id=$("${compose[@]}" ps -aq db)
[[ -n "$db_id" ]] || { echo 'No deployed database container'; exit 1; }
[[ $(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$db_id") == "$volume" ]] || { echo 'Database mount mismatch'; exit 1; }

on_failure() {
  trap - ERR
  "${compose[@]}" stop web api || true
  echo 'Reset failed. Application remains stopped; no backup or automatic rollback exists.' >&2
}
trap on_failure ERR
"${compose[@]}" stop web api
"${compose[@]}" rm --stop --force db
# Intentionally no backup, no global prune, no down --volumes.
docker volume rm "$volume"
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 180 db
# TCP health waits for the entrypoint to finish both initialization SQL files.
"${compose[@]}" exec -T db sh -c 'psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c '\''SELECT count(*) FROM "User"; SELECT count(*) FROM "Student";'\''' >/dev/null
"${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 120 api
"${compose[@]}" up -d --no-build --pull never --no-deps --force-recreate --wait --wait-timeout 120 web
"${compose[@]}" exec -T web wget -q -O /dev/null http://127.0.0.1/api/health
printf 'Reset completed using deployed release %s. Old database deleted without backup.\n' "$IMAGE_TAG"
