#!/usr/bin/env bash
# Включает автообновление с GitHub: таймер systemd раз в 2 минуты
# запускает scripts/auto-update.sh. Запускать один раз, от root:
#   cd /opt/sleep_dairy && bash scripts/install-auto-update.sh
# Выключить: systemctl disable --now sleep-dairy-update.timer
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$DIR/scripts/auto-update.sh"

cat > /etc/systemd/system/sleep-dairy-update.service <<UNIT
[Unit]
Description=Дневник сна: обновление с GitHub
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$DIR/scripts/auto-update.sh
UNIT

cat > /etc/systemd/system/sleep-dairy-update.timer <<UNIT
[Unit]
Description=Дневник сна: проверять обновления каждые 2 минуты

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now sleep-dairy-update.timer
touch /var/log/sleep-dairy-update.log
echo "Автообновление включено: сервер проверяет GitHub каждые 2 минуты."
echo "Журнал:   tail -f /var/log/sleep-dairy-update.log"
echo "Выключить: systemctl disable --now sleep-dairy-update.timer"
# Первая проверка — сразу, чтобы не ждать.
systemctl start sleep-dairy-update.service || true
tail -n 5 /var/log/sleep-dairy-update.log || true
