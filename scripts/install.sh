#!/usr/bin/env bash
#
# Установка дневника сна на чистый сервер одной командой (Ubuntu 22.04/24.04):
#
#   curl -fsSL https://raw.githubusercontent.com/tonypulseone-dot/sleep_dairy/main/scripts/install.sh | bash
#
# Скрипт задаёт несколько вопросов и дальше всё делает сам: ставит Docker,
# обходит недоступность Docker Hub, забирает код, генерирует пароли,
# запускает приложение, ждёт сертификат и заводит кабинет консультанта.
#
# Запускать повторно безопасно: пароль базы и секрет сессий берутся из уже
# существующего .env, данные остаются на месте. Так же обновляется код.
#
# Ответы можно передать заранее, тогда скрипт ни о чём не спросит:
#
#   curl -fsSL .../install.sh | SD_TOKEN='123:AA...' SD_BOT='son_bot' \
#     SD_DOMAIN='son.example.ru' SD_EMAIL='v@mail.ru' SD_PASS='...' bash
#
# Необязательные: SD_NAME (по умолчанию «Виктория»), SD_SLUG («viktoria»).

# Весь скрипт — в фигурных скобках. При запуске через `curl | bash` bash
# читает скрипт из того же канала, что служит stdin для каждой команды,
# и apt-get или установщик Docker молча съедали бы его продолжение: bash
# продолжал бы с середины строки. Скобки заставляют прочитать всё целиком
# до первой команды.
{
set -euo pipefail

REPO_URL="https://github.com/tonypulseone-dot/sleep_dairy.git"
DIR="/opt/sleep_dairy"
LOG="/var/log/sleep-diary-install.log"

# Зеркала Docker Hub, которые отвечали из России. Они живут и умирают:
# если перестанут все, адрес рабочего зеркала стоит спросить у хостинга.
MIRRORS='"https://mirror.gcr.io", "https://dockerhub.timeweb.cloud", "https://huecker.io"'

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

TOKEN=${SD_TOKEN:-}
BOT=${SD_BOT:-}
DOMAIN=${SD_DOMAIN:-}
C_NAME=${SD_NAME:-}
C_EMAIL=${SD_EMAIL:-}
C_PASS=${SD_PASS:-}
C_SLUG=${SD_SLUG:-}
# Токен передан заранее — значит, и остальное тоже: вопросов не задаём.
UNATTENDED=''
[ -z "$TOKEN" ] || UNATTENDED=1

# Ответы читаем с терминала, а не из stdin: при запуске через `curl | bash`
# stdin занят самим скриптом. Переданное заранее не спрашиваем и не
# печатаем — среди этого токен и пароль.
ask() {
  local __var=$1 prompt=$2 default=${3:-} reply=${!1:-}
  if [ -n "$reply" ]; then
    printf '  %s: задано заранее\n' "$prompt"
    return
  fi
  if [ -n "$UNATTENDED" ]; then
    [ -n "$default" ] || die "Не передано значение для «$prompt»."
    printf '  %s: %s\n' "$prompt" "$default"
    printf -v "$__var" '%s' "$default"
    return
  fi
  while [ -z "$reply" ]; do
    if [ -n "$default" ]; then
      read -r -p "  $prompt [$default]: " reply </dev/tty || true
      reply=${reply:-$default}
    else
      read -r -p "  $prompt: " reply </dev/tty || true
    fi
    [ -n "$reply" ] || echo "  Без этого не продолжить."
  done
  printf -v "$__var" '%s' "$reply"
}

ask_secret() {
  local __var=$1 prompt=$2 reply=${!1:-}
  if [ -n "$reply" ]; then
    [ ${#reply} -ge 8 ] || die "Пароль для кабинета должен быть не короче 8 символов."
    printf '  %s: задано заранее\n' "$prompt"
    return
  fi
  [ -z "$UNATTENDED" ] || die "Не передан пароль для кабинета (SD_PASS)."
  while [ ${#reply} -lt 8 ]; do
    read -r -s -p "  $prompt: " reply </dev/tty || true
    echo
    [ ${#reply} -ge 8 ] || echo "  Нужно не меньше 8 символов."
  done
  printf -v "$__var" '%s' "$reply"
}

confirm() {
  local reply=''
  # Без вопросов не останавливаемся: если домен и правда смотрит не туда,
  # установка всё равно упрётся в сертификат и скажет об этом прямо.
  if [ -n "$UNATTENDED" ]; then
    warn "Продолжаем: вопросы отключены."
    return 0
  fi
  read -r -p "  $1 [y/N]: " reply </dev/tty || true
  [[ $reply =~ ^[YyДд] ]]
}

# Значение из уже существующего .env. Пароль базы при повторном запуске
# менять нельзя: база создана со старым, и приложение перестало бы в неё входить.
env_value() {
  [ -f "$DIR/.env" ] || return 0
  sed -n "s/^$1=//p" "$DIR/.env" | tail -n 1
}

[ "$(id -u)" -eq 0 ] || die "Нужны права root. Выполните sudo -i и запустите команду ещё раз."
[ -n "$UNATTENDED" ] || [ -r /dev/tty ] || die "Скрипт задаёт вопросы, поэтому запускать его нужно в терминале."

bold "Дневник сна — установка"
if [ -n "$UNATTENDED" ]; then
  echo "  Все ответы переданы заранее — дальше всё сделается само, минут 10–15."
else
  echo "  Сначала несколько вопросов, потом всё сделается само, минут 10–15."
fi

# --------------------------------------------------------------------- 1
bold "1/7 · Бот"
ask TOKEN "Токен бота от @BotFather"
TOKEN=$(printf '%s' "$TOKEN" | tr -d '[:space:]')
[[ $TOKEN =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] \
  || die "Это не похоже на токен бота. Он выглядит так: 123456789:AAH4b..."

# С российских серверов api.telegram.org открывается не всегда. Самому
# приложению он не нужен: вход мамы проверяется подписью, которую Telegram
# кладёт в приложение, без единого запроса наружу. Без него не работает
# только процесс-бот — его роль тогда берут на себя настройки в BotFather.
getme() {
  local code
  code=$(curl "$@" -sS -o /tmp/tg-getme.json -w '%{http_code}' --max-time 15 \
    "https://api.telegram.org/bot$TOKEN/getMe" 2>/dev/null || true)
  printf '%s' "${code:-000}"
}
TG_OK=''
CODE=$(getme)
# Частая причина «не отвечает» — сломанный маршрут по IPv6 при рабочем IPv4.
[ "$CODE" != 000 ] || CODE=$(getme -4)
case "$CODE" in
  200)
    TG_OK=1
    BOT=$(sed -n 's/.*"username":"\([^"]*\)".*/\1/p' /tmp/tg-getme.json)
    [ -n "$BOT" ] || die "Telegram ответил неожиданно: $(cat /tmp/tg-getme.json)"
    ok "Бот @$BOT на связи"
    ;;
  401|404)
    die "Telegram не узнал этот токен. Скопируйте его из @BotFather ещё раз."
    ;;
  *)
    warn "С этого сервера не открывается api.telegram.org (код $CODE) — в России так бывает."
    warn "Приложению это не мешает. Бот-помощник работать не будет, его заменят"
    warn "две настройки в @BotFather — инструкция появится в конце установки."
    ask BOT "Имя бота без @, например son_diary_bot"
    BOT=${BOT#@}
    [[ $BOT =~ ^[A-Za-z0-9_]{5,32}$ ]] || die "Имя бота — латиница, цифры и подчёркивание, как в @BotFather."
    warn "Проверить токен отсюда нельзя — скопируйте его из @BotFather без ошибок."
    ;;
esac

# --------------------------------------------------------------------- 2
bold "2/7 · Домен"
ask DOMAIN "Домен приложения, например son.example.ru"
DOMAIN=$(printf '%s' "$DOMAIN" | tr -d '[:space:]' | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')
if printf '%s' "$DOMAIN" | LC_ALL=C grep -q '[^ -~]'; then
  # Кириллический домен: сертификат выпускается на его punycode-запись.
  DOMAIN=$(python3 -c 'import sys; print(sys.argv[1].encode("idna").decode())' "$DOMAIN") \
    || die "Не получилось перевести домен в punycode. Введите его в виде xn--..."
fi
DOMAIN=$(printf '%s' "$DOMAIN" | tr '[:upper:]' '[:lower:]')

DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}' || true)
[ -n "$DNS_IP" ] || die "Домен $DOMAIN пока никуда не указывает. Проверьте A-запись и подождите 10–30 минут."
MY_IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
if [ "$DNS_IP" = "$MY_IP" ]; then
  ok "$DOMAIN указывает на этот сервер ($MY_IP)"
else
  warn "$DOMAIN указывает на $DNS_IP, а у сервера адрес $MY_IP."
  warn "Если это ошибка, сертификат не выпустится и мини-приложение не откроется."
  confirm "Всё равно продолжить?" || die "Остановились. Поправьте A-запись и запустите заново."
fi
# Без AAAA-записи getent отдаёт IPv4-адрес в виде ::ffff:… — это не IPv6.
if getent ahostsv6 "$DOMAIN" | grep -v '::ffff:' | grep -q .; then
  warn "У домена есть AAAA-запись (IPv6). Если сервер не отвечает по IPv6, сертификат может не выпуститься — лучше её удалить."
fi

# --------------------------------------------------------------------- 3
bold "3/7 · Кабинет консультанта"
ask C_NAME  "Имя консультанта" "Виктория"
ask C_EMAIL "Почта для входа в кабинет"
[[ $C_EMAIL == *@*.* ]] || die "Это не похоже на адрес почты."
ask_secret C_PASS "Пароль для входа в кабинет (не меньше 8 символов)"
ask C_SLUG  "Имя для ссылки-приглашения, латиницей" "viktoria"
[[ $C_SLUG =~ ^[a-z0-9-]{3,32}$ ]] || die "Только маленькие латинские буквы, цифры и дефис."

echo
echo "  Вопросов больше не будет. Дальше можно не смотреть — в конце появятся ссылки."

# --------------------------------------------------------------------- 4
bold "4/7 · Docker"
export DEBIAN_FRONTEND=noninteractive
# needrestart в Ubuntu после установки пакетов спрашивает, какие службы
# перезапустить, и ждёт ответа — в установке без вопросов это зависание.
export NEEDRESTART_MODE=a
# На свежем сервере в первые минуты работают автообновления и держат
# блокировку apt: ждём её до пяти минут, а не падаем.
: > "$LOG"
apt-get -o DPkg::Lock::Timeout=300 update -qq </dev/null >>"$LOG" 2>&1 || warn "apt-get update завершился с ошибкой, пробуем дальше"
apt-get -o DPkg::Lock::Timeout=300 install -y -qq git curl ca-certificates openssl </dev/null >>"$LOG" 2>&1 || die "Не получилось поставить git. Подробности: $LOG"

if ! command -v docker >/dev/null 2>&1; then
  if curl -fsSL --max-time 30 https://get.docker.com -o /tmp/get-docker.sh 2>>"$LOG" \
     && sh /tmp/get-docker.sh </dev/null >>"$LOG" 2>&1; then
    ok "Docker установлен с сайта Docker"
  else
    warn "Сайт Docker недоступен, ставим из репозитория Ubuntu"
    apt-get -o DPkg::Lock::Timeout=300 install -y -qq docker.io </dev/null >>"$LOG" 2>&1 || die "Не получилось поставить Docker. Подробности: $LOG"
  fi
fi
systemctl enable --now docker </dev/null >>"$LOG" 2>&1 || true
if ! docker compose version >/dev/null 2>&1; then
  apt-get -o DPkg::Lock::Timeout=300 install -y -qq docker-compose-v2 </dev/null >>"$LOG" 2>&1 \
    || apt-get -o DPkg::Lock::Timeout=300 install -y -qq docker-compose-plugin </dev/null >>"$LOG" 2>&1 \
    || die "Не получилось поставить docker compose. Подробности: $LOG"
fi
ok "$(docker --version)"

hub_ok() { timeout 120 docker pull -q hello-world </dev/null >>"$LOG" 2>&1; }
if hub_ok; then
  ok "Docker Hub доступен"
else
  warn "Docker Hub недоступен, подключаем зеркала"
  mkdir -p /etc/docker
  [ -f /etc/docker/daemon.json ] && cp /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
  printf '{\n  "registry-mirrors": [%s]\n}\n' "$MIRRORS" > /etc/docker/daemon.json
  systemctl restart docker
  hub_ok || die "Ни Docker Hub, ни зеркала не отвечают. Спросите у поддержки хостинга адрес зеркала Docker Hub, впишите его в /etc/docker/daemon.json и запустите установку заново."
  ok "Образы качаются через зеркало"
fi

# Сборке нужно около полутора гигабайт памяти. На маленьком сервере без
# подкачки она падает молча, поэтому подстраховываемся.
MEM_MB=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >>"$LOG" && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "Добавлена подкачка 2 ГБ: памяти ${MEM_MB} МБ, сборке было бы тесно"
fi

# --------------------------------------------------------------------- 5
bold "5/7 · Код и настройки"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q --ff-only || die "Не получилось обновить код в $DIR. Возможно, там правили файлы руками."
  ok "Код обновлён"
else
  git clone -q "$REPO_URL" "$DIR" || die "Не получилось скачать код с GitHub."
  ok "Код скачан в $DIR"
fi
cd "$DIR"

PG_PASS=$(env_value POSTGRES_PASSWORD);  [ -n "$PG_PASS" ] || PG_PASS=$(openssl rand -hex 32)
SESSION=$(env_value SESSION_SECRET);     [ -n "$SESSION" ] || SESSION=$(openssl rand -hex 32)
ANTHROPIC=$(env_value ANTHROPIC_API_KEY)
# Прямые ссылки t.me/бот/app работают, только если мини-приложение заведено
# в BotFather через /newapp. Без бота это единственный способ пригласить маму.
APP_SHORT=$(env_value TELEGRAM_APP_SHORT_NAME)
[ -n "$APP_SHORT" ] || [ -n "$TG_OK" ] || APP_SHORT=app
L_OPERATOR=$(env_value LEGAL_OPERATOR)
L_INN=$(env_value LEGAL_INN)
L_EMAIL=$(env_value LEGAL_EMAIL)
L_HOSTING=$(env_value LEGAL_HOSTING)

umask 077
cat > .env <<EOF
APP_DOMAIN=$DOMAIN
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_BOT_USERNAME=$BOT
# Короткое имя мини-приложения из BotFather (/newapp). Пусто — приглашения
# идут через бота: t.me/бот?start=...
TELEGRAM_APP_SHORT_NAME=$APP_SHORT

POSTGRES_PASSWORD=$PG_PASS
SESSION_SECRET=$SESSION

# Распознавание скриншотов. С российского сервера Anthropic недоступен,
# поэтому пусто: приложение честно скажет, что загрузка снимками не настроена.
ANTHROPIC_API_KEY=$ANTHROPIC

# Реквизиты для политики конфиденциальности — заполнить до живых мам.
LEGAL_OPERATOR=$L_OPERATOR
LEGAL_INN=$L_INN
LEGAL_EMAIL=$L_EMAIL
LEGAL_HOSTING=$L_HOSTING
EOF
umask 022
ok "Настройки записаны в $DIR/.env, пароли сгенерированы"

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q 'Status: active'; then
  ufw allow 22/tcp >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
  ok "В файрволе открыты порты 80 и 443"
fi

BUSY=$(ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v docker-proxy || true)
if [ -n "$BUSY" ]; then
  printf '%s\n' "$BUSY" >&2
  die "Порты 80 или 443 уже заняты другой программой (выше). Обычно это nginx или apache: systemctl disable --now nginx apache2 — и запустите установку заново."
fi

# --------------------------------------------------------------------- 6
bold "6/7 · Сборка и запуск"
echo "  Самый долгий шаг, обычно 5–10 минут. Ход сборки пишется в $LOG"
# Без доступа к Telegram бот только падал бы и перезапускался по кругу.
SCALE=()
[ -n "$TG_OK" ] || SCALE=(--scale bot=0)
if ! docker compose up -d --build "${SCALE[@]}" </dev/null >>"$LOG" 2>&1; then
  tail -n 30 "$LOG" >&2
  die "Сборка или запуск не удались. Полный журнал: $LOG — пришлите его."
fi
ok "Контейнеры запущены"

# Проверяем изнутри сервера, но с настоящим сертификатом: --resolve ведёт
# запрос на этот же сервер, а проверка подлинности остаётся включённой.
printf '  Ждём сертификат Let'"'"'s Encrypt'
READY=''
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/privacy" 2>/dev/null; then
    READY=1; break
  fi
  printf '.'; sleep 5
done
echo
if [ -n "$READY" ]; then
  ok "https://$DOMAIN отвечает, сертификат выпущен"
else
  docker compose logs --tail 20 caddy >&2 || true
  die "За 5 минут сертификат не выпустился (журнал Caddy выше). Чаще всего домен смотрит не на этот сервер или закрыты порты 80/443."
fi

# --------------------------------------------------------------------- 7
bold "7/7 · Наполнение"
run() { docker compose exec -T app node "$@" </dev/null >>"$LOG" 2>&1; }
run runtime/seed-norms.cjs      && ok "Таблица режимов загружена"            || warn "Таблица режимов не загрузилась, см. $LOG"
run runtime/seed-activities.cjs && ok "Активности загружены (черновик)"      || warn "Активности не загрузились, см. $LOG"
run runtime/seed-consultant.cjs "$C_EMAIL" "$C_PASS" "$C_NAME" "$C_SLUG" \
  && ok "Кабинет для «$C_NAME» заведён" \
  || die "Не получилось завести кабинет консультанта, см. $LOG"

if [ -n "$TG_OK" ]; then
  sleep 3
  if docker compose ps --status running --services 2>/dev/null | grep -qx bot; then
    ok "Бот работает"
  else
    warn "Бот не запустился: docker compose logs bot"
  fi
fi

if [ -n "$APP_SHORT" ]; then
  INVITE="https://t.me/$BOT/$APP_SHORT?startapp=$C_SLUG"
else
  INVITE="https://t.me/$BOT?start=$C_SLUG"
fi

bold "Готово"
if [ -z "$TG_OK" ]; then
cat <<EOF

  Осталось две настройки в @BotFather — без них мини-приложение не откроется:

  1. Кнопка в чате с ботом
     /mybots → @$BOT → Bot Settings → Menu Button
     адрес: https://$DOMAIN     название: Дневник

  2. Прямые ссылки для приглашений
     /newapp → @$BOT → название «Дневник сна» → короткое описание
     → картинка 640×360 → GIF: /empty
     → адрес: https://$DOMAIN   → короткое имя: $APP_SHORT
EOF
fi
cat <<EOF

  Мини-приложение     откройте @$BOT в Telegram → кнопка «Дневник» внизу
  Кабинет консультанта https://$DOMAIN/pro
                       вход: $C_EMAIL и пароль, который вы ввели
  Приглашение для мам $INVITE

  До того как звать живых мам, заполните реквизиты в $DIR/.env
  (строки LEGAL_*) и выполните: cd $DIR && docker compose up -d

EOF

exit 0
}
