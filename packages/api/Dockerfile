FROM node:22.17-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
# Prisma lifecycle scripts must detect the correct OpenSSL runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json packages/api/package.json
COPY packages/web/package.json packages/web/package.json
COPY packages/common/package.json packages/common/package.json
RUN pnpm install --frozen-lockfile
COPY packages/common packages/common
COPY packages/api packages/api
FROM dependencies AS development
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "--filter", "@student/api", "dev:container"]

FROM dependencies AS build
RUN pnpm --filter @student/api... build

FROM build AS migrate
CMD ["pnpm", "--filter", "@student/api", "db:migrate"]

FROM node:22.17-bookworm-slim AS api
WORKDIR /app
# Keep pnpm's store and package links at their original relative locations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/api/package.json ./packages/api/package.json
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/common/package.json ./packages/common/package.json
COPY --from=build /app/packages/common/dist ./packages/common/dist
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "packages/api/dist/main.js"]
