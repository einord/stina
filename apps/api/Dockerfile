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
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/extension-host/package.json ./packages/extension-host/
COPY packages/chat/package.json ./packages/chat/
COPY packages/ui-vue/package.json ./packages/ui-vue/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter './packages/*' build
RUN pnpm --filter @stina/api build

FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

ENV NODE_ENV=production

# Copy workspace configuration and package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/extension-installer/package.json ./packages/extension-installer/
COPY packages/adapters-node/package.json ./packages/adapters-node/
COPY packages/extension-api/package.json ./packages/extension-api/
COPY packages/core/package.json ./packages/core/
COPY packages/shared/package.json ./packages/shared/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/extension-host/package.json ./packages/extension-host/
COPY packages/chat/package.json ./packages/chat/
COPY packages/ui-vue/package.json ./packages/ui-vue/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod

# Copy only built artifacts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/extension-installer/dist ./packages/extension-installer/dist
COPY --from=build /app/packages/adapters-node/dist ./packages/adapters-node/dist
COPY --from=build /app/packages/extension-api/dist ./packages/extension-api/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/i18n/dist ./packages/i18n/dist
COPY --from=build /app/packages/extension-host/dist ./packages/extension-host/dist
COPY --from=build /app/packages/chat/dist ./packages/chat/dist

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
