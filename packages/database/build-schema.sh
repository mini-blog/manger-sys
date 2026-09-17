#!/bin/sh
set -eu

# Existing SQL remains the source of constraints/triggers that Prisma db push omits.
# This temporary build database contains no application data or server credentials.
initdb -D /tmp/schema-db --auth-local=trust --auth-host=scram-sha-256 > /dev/null
pg_ctl -D /tmp/schema-db -o "-c listen_addresses='' -k /tmp" -w start > /dev/null
trap 'pg_ctl -D /tmp/schema-db -m immediate -w stop > /dev/null' EXIT
createdb -h /tmp schema_build
for file in /schema-source/*/migration.sql; do
  psql -X -h /tmp -d schema_build -v ON_ERROR_STOP=1 -f "$file" > /dev/null
done
pg_dump -h /tmp --schema-only --no-owner --no-privileges schema_build > /tmp/schema.sql
chmod 644 /tmp/schema.sql
