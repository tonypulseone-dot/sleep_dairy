#!/usr/bin/env bash
# Автообновление с GitHub. Запускается таймером systemd раз в 2 минуты
# (ставится scripts/install-auto-update.sh). Если в ветке main появилось
# новое — подтягивает, собирает и перезапускает. Сборка не удалась —
# работает прежняя версия, ошибка в журнале /var/log/sleep-dairy-update.log.
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
LOG=/var/log/sleep-dairy-update.log
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# Два запуска одновременно не нужны: сборка идёт пару минут.
exec 9>/run/sleep-dairy-update.lock
flock -n 9 || exit 0

git fetch -q origin main 2>>"$LOG" || { log "не удалось связаться с GitHub — попробую позже"; exit 0; }
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

# Эта версия уже не собралась — пробуем снова не чаще раза в 30 минут,
# чтобы сломанный коммит не пересобирался каждые 2 минуты.
if [ -f .update-failed ] && [ "$(cat .update-failed)" = "$REMOTE" ] \
  && [ $(( $(date +%s) - $(stat -c %Y .update-failed) )) -lt 1800 ]; then
  exit 0
fi

# Только «перемотка вперёд»: если на сервере руками правили файлы, ничего не трогаем.
if ! git merge -q --ff-only origin/main 2>>"$LOG"; then
  log "на сервере есть свои изменения в файлах (git status) — обновление пропущено"
  exit 0
fi
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")
VERSION=$(git rev-parse --short HEAD)
log "обновление ${LOCAL:0:7} → $VERSION"

if ! docker compose build >> "$LOG" 2>&1; then
  # Код возвращаем к работающей версии: файлы на диске должны совпадать
  # с тем, что запущено. Повтор — через 30 минут или со следующим коммитом.
  echo "$REMOTE" > .update-failed
  git reset -q --hard "$LOCAL"
  log "СБОРКА НЕ УДАЛАСЬ — работает прежняя версия ${LOCAL:0:7}, повтор через 30 минут"
  exit 1
fi
rm -f .update-failed

# Версию храним в .env: её видят и приложение (/api/health), и ручные
# docker compose после. Пишем только после удачной сборки.
if grep -q '^APP_VERSION=' .env 2>/dev/null; then
  sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" .env
else
  echo "APP_VERSION=$VERSION" >> .env
fi
if ! docker compose up -d >> "$LOG" 2>&1; then
  log "ЗАПУСК НЕ УДАЛСЯ — смотрите: docker compose ps"
  exit 1
fi
if echo "$CHANGED" | grep -q '^Caddyfile$'; then
  ./scripts/caddy-reload.sh >> "$LOG" 2>&1 || log "Caddy не перезагрузился"
fi
if echo "$CHANGED" | grep -q '^scripts/seed-activities.ts$'; then
  docker compose exec -T app node runtime/seed-activities.cjs >> "$LOG" 2>&1 || log "занятия не перезалились"
fi
# Старые образы после пересборки занимают место на диске.
docker image prune -f > /dev/null 2>&1 || true
log "готово: $VERSION"
