FROM node:20-bookworm AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter './packages/*' build
RUN pnpm --filter @stina/web build

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 3002
