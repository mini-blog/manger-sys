# Compile a fresh schema at image-build time, never upgrade the server's existing DB.
FROM postgres:17-alpine AS schema
COPY packages/api/prisma/migrations /schema-source
COPY packages/database/build-schema.sh /build-schema.sh
USER postgres
RUN sh /build-schema.sh

FROM postgres:17-alpine
COPY --from=schema /tmp/schema.sql /docker-entrypoint-initdb.d/001-schema.sql
