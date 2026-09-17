# The PostgreSQL entrypoint runs these files only when PGDATA is empty.
FROM postgres:17-alpine
COPY sql/schema.sql /docker-entrypoint-initdb.d/001-schema.sql
COPY sql/development-seed.sql /docker-entrypoint-initdb.d/002-development-seed.sql
