FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Миграции, бот и наполнение базы собираются в самодостаточные файлы:
# в самодостаточной сборке Next нет drizzle-orm и grammy — он вшивает их
# в свои чанки, — поэтому запускать эти скрипты из исходников в боевом
# образе нечем.
RUN npm run build && npm run build:runtime

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

# Самодостаточная сборка Next плюс собранные скрипты и файлы миграций.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/runtime ./runtime

EXPOSE 3000
CMD ["node", "server.js"]
