#!/usr/bin/env bash
# Executed by deploy.yml via sudo on the StudentSys server. No secrets in arguments.
set -Eeuo pipefail
umask 077

image_tag=${1:?Missing commit SHA}
release_dir=${2:?Missing release directory}
deploy_root=/opt/studentsys
[[ "$image_tag" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA'; exit 1; }
[[ "$release_dir" =~ ^/opt/studentsys/releases/${image_tag}-[0-9]+-[0-9]+$ ]] || {
  echo 'Invalid release directory'; exit 1;
}
[[ $EUID -eq 0 ]] || { echo 'Run using sudo'; exit 1; }

# Also serialize manual runs on the host.
exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
cd "$release_dir"
sha256sum -c images.sha256
docker compose version
available_kb=$(df -Pk "$deploy_root" | awk 'NR == 2 {print $4}')
(( available_kb >= 4 * 1024 * 1024 )) || { echo 'At least 4 GiB free disk is required'; exit 1; }

env_file="$deploy_root/.env.prod"
if [[ ! -f "$env_file" ]]; then
  # Never generate a different DB password for an existing database volume.
  if docker volume inspect studentsys-prod_postgres_data >/dev/null 2>&1; then
    echo 'Database volume exists but .env.prod is missing; restore the original environment file.'
    exit 1
  fi
  db_password=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  account_secret=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  env_tmp=$(mktemp "$deploy_root/.env.prod.XXXXXX")
  cat > "$env_tmp" <<EOF
POSTGRES_USER=student
POSTGRES_PASSWORD=$db_password
POSTGRES_DB=student_sys
WEB_BIND_ADDRESS=0.0.0.0
WEB_PORT=80
# Temporary IP-based HTTP deployment; change to true when HTTPS is configured.
SESSION_COOKIE_SECURE=false
ACCOUNT_COMMAND_HASH_SECRET=$account_secret
QWEN_API_KEY=
QWEN_BASE_URL=
QWEN_MODEL=
EOF
  chmod 600 "$env_tmp"
  mv "$env_tmp" "$env_file"
  unset db_password account_secret
  echo 'Created server-only .env.prod (HTTP preview configuration).'
fi

export IMAGE_TAG="$image_tag"
compose=(docker compose --project-name studentsys-prod --env-file "$env_file" -f "$release_dir/compose.prod.yaml")
"${compose[@]}" config --quiet
gzip -dc images.tar.gz | docker load
# The compressed upload is expendable; keep Docker images and release files for diagnosis.
rm -f images.tar.gz

on_failure() {
  echo 'Deployment failed; inspect the service logs on the server. No database volumes were deleted.' >&2
  "${compose[@]}" ps -a || true
}
trap on_failure ERR

# The database image initializes an empty volume; existing databases are not upgraded.
"${compose[@]}" stop web api
"${compose[@]}" up -d --no-build --pull never --wait --wait-timeout 120 db
"${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 120 api
"${compose[@]}" up -d --no-build --pull never --no-deps --wait --wait-timeout 120 web
"${compose[@]}" exec -T web wget -q -O /dev/null http://127.0.0.1/api/health

# Only mark a release current after both frontend and proxied API are healthy.
ln -sfn "$release_dir" "$deploy_root/current"
printf '%s\n' "$image_tag" > "$deploy_root/deployed-sha"
"${compose[@]}" ps
echo 'StudentSys deployment completed. Existing environment and database data were preserved.'
