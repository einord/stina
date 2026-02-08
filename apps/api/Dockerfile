FROM node:22-bookworm AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

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
COPY packages/builtin-tools/package.json ./packages/builtin-tools/
COPY packages/ui-vue/package.json ./packages/ui-vue/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter './packages/*' build
RUN pnpm --filter @stina/api build

FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

ENV NODE_ENV=production

# Copy workspace configuration and package files
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
COPY packages/builtin-tools/package.json ./packages/builtin-tools/
COPY packages/ui-vue/package.json ./packages/ui-vue/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --prod

# Copy only built artifacts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/extension-installer/dist ./packages/extension-installer/dist
COPY --from=build /app/packages/adapters-node/dist ./packages/adapters-node/dist
COPY --from=build /app/packages/extension-api/dist ./packages/extension-api/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/scheduler/dist ./packages/scheduler/dist
COPY --from=build /app/packages/i18n/dist ./packages/i18n/dist
COPY --from=build /app/packages/extension-host/dist ./packages/extension-host/dist
COPY --from=build /app/packages/chat/dist ./packages/chat/dist
COPY --from=build /app/packages/auth/dist ./packages/auth/dist
COPY --from=build /app/packages/builtin-tools/dist ./packages/builtin-tools/dist

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
