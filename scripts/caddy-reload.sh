#!/usr/bin/env bash
#
# Перечитать сайты Caddy после правки файлов в /opt/caddy-sites.
#
#   /opt/sleep_dairy/scripts/caddy-reload.sh
#
# Сначала проверяет конфигурацию целиком. Файл с ошибкой (хватит одной
# незакрытой скобки) ломает её всю, вместе с дневником, поэтому при ошибке
# работающая конфигурация остаётся нетронутой, а скрипт говорит, что не так.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=(--config /etc/caddy/Caddyfile --adapter caddyfile)

if ! out=$(docker compose exec -T caddy caddy validate "${CONFIG[@]}" 2>&1); then
  printf '%s\n' "$out" | grep -v '"level":"info"' | tail -n 5 >&2
  printf '\n  ✗ Конфигурация с ошибкой — Caddy продолжает работать со старой.\n' >&2
  printf '    Исправьте файл в /opt/caddy-sites и запустите скрипт ещё раз.\n' >&2
  printf '    Незакрытая скобка даёт ошибку в следующем по алфавиту файле — смотрите и его соседа.\n\n' >&2
  exit 1
fi

docker compose exec -T caddy caddy reload "${CONFIG[@]}" >/dev/null 2>&1
printf '  ✓ Caddy перечитал сайты. Сертификат для нового домена выпустится сам в течение минуты.\n'
