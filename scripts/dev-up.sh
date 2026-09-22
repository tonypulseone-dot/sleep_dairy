#!/usr/bin/env bash
# Поднимает локальную базу и накатывает миграции.
#
# В песочнице разработки фоновые процессы не переживают переход между
# командами, поэтому Postgres приходится поднимать заново. Скрипт
# идемпотентный: если база уже работает, он ничего не ломает.
set -euo pipefail

if ! pg_isready -q 2>/dev/null; then
  service postgresql start >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    pg_isready -q 2>/dev/null && break
    sleep 1
  done
fi

pg_isready | head -1
su postgres -c "createdb sleepdiary" 2>/dev/null || true
npm run db:migrate
