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
COPY packages/web packages/web
FROM dependencies AS development
ENV NODE_ENV=development
EXPOSE 5173
CMD ["pnpm", "--filter", "@student/web", "dev:container"]

FROM dependencies AS build
ENV NODE_ENV=production
RUN pnpm --filter @student/web... build

FROM nginx:1.28-alpine AS production
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
