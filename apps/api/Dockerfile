FROM node:20-bookworm AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter './packages/*' build
RUN pnpm --filter @stina/api build
RUN pnpm prune --prod

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app /app

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
