FROM node:20-bookworm AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace configuration and package files for better caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/extension-installer/package.json ./packages/extension-installer/
COPY packages/adapters-node/package.json ./packages/adapters-node/
COPY packages/extension-api/package.json ./packages/extension-api/
COPY packages/core/package.json ./packages/core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/scheduler/package.json ./packages/scheduler/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/extension-host/package.json ./packages/extension-host/
COPY packages/chat/package.json ./packages/chat/
COPY packages/auth/package.json ./packages/auth/
COPY packages/ui-vue/package.json ./packages/ui-vue/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter './packages/*' build
RUN pnpm generate:icons
RUN pnpm --filter @stina/web build

FROM nginx:1.27.0-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 3002
