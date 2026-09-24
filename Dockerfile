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

# Серверы GigaChat (Сбер) подписаны российским удостоверяющим центром
# Минцифры — Node ему по умолчанию не доверяет. Кладём корневой и
# промежуточный сертификаты в образ и подключаем через NODE_EXTRA_CA_CERTS.
# Файлы склеиваем через перевод строки: у скачанных его нет в конце, и без
# него «END CERTIFICATE» и следующий «BEGIN» слипаются — Node такой файл
# не читает («bad end line»). Если скачать не вышло, сборка не падает: без сертификата не заработает
# только перенос скриншотов, и команда проверки об этом скажет.
RUN mkdir -p /app/certs \
  && (wget -qO /tmp/root.pem https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt \
      && wget -qO /tmp/sub.pem https://gu-st.ru/content/lending/russian_trusted_sub_ca_pem.crt \
      && { cat /tmp/root.pem; echo; cat /tmp/sub.pem; echo; } | tr -d '\r' > /app/certs/russian-trusted-ca.pem \
      || echo "ВНИМАНИЕ: сертификат Минцифры не скачался — перенос скриншотов через GigaChat работать не будет") \
  && rm -f /tmp/root.pem /tmp/sub.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian-trusted-ca.pem

EXPOSE 3000
CMD ["node", "server.js"]
