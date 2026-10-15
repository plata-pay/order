#!/usr/bin/env bash
set -euo pipefail
umask 077
for command in curl jq openssl; do
  command -v "$command" >/dev/null || { printf 'Установи инструменты: pkg install curl jq openssl-tool\n' >&2; exit 1; }
done
AMOUNT=${1:-150}
[[ "$AMOUNT" =~ ^[1-9][0-9]*([.][0-9]{1,2})?$ ]] || { printf 'Укажи сумму числом, например 150 или 150.25\n' >&2; exit 1; }
jq -en --argjson amount "$AMOUNT" '$amount >= 1 and $amount <= 100000' >/dev/null || { printf 'Для теста CryptoBot нужна сумма от 1 до 100000 рублей\n' >&2; exit 1; }
API='https://plata-main.dpl-payments.workers.dev/api/orders'
MERCHANT_API='https://plata-merchant.dpl-payments.workers.dev/api/merchants'
STATE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/plata-pay"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
request() {
  local method=$1 url=$2 payload=$3 auth=${4:-} raw
  if [[ -n "$auth" ]]; then
    raw=$(curl -q --config - -sS --connect-timeout 10 --max-time 40 -X "$method" "$url" -H 'Content-Type: application/json' --data "$payload" -w '\n%{http_code}' <<EOF
header = "Authorization: Bearer $auth"
EOF
    )
  else
    raw=$(curl -q -sS --connect-timeout 10 --max-time 40 -X "$method" "$url" -H 'Content-Type: application/json' --data "$payload" -w '\n%{http_code}')
  fi
  HTTP_STATUS=${raw##*$'\n'}
  RESPONSE=${raw%$'\n'*}
}
expect() {
  local accepted=$1
  if [[ " $accepted " != *" $HTTP_STATUS "* ]]; then
    printf 'Ошибка: HTTP %s\n' "$HTTP_STATUS" >&2
    printf '%s\n' "$RESPONSE" | jq -c '{error,errors}' >&2 || printf 'Сервер вернул не JSON\n' >&2
    exit 1
  fi
}
if [[ -f "$STATE_DIR/credentials.env" ]]; then
  chmod 600 "$STATE_DIR/credentials.env"
  source "$STATE_DIR/credentials.env"
else
  printf 'Первый запуск заменит MERCHANT_ADMIN_TOKEN. Старый секрет регистрации перестанет работать.\n'
  printf 'Новый секрет будет сохранён только в Termux; ключ Cloudflare сохраняться не будет.\n'
  read -rsp 'Cloudflare API token: ' CF_API_TOKEN
  printf '\n'
  [[ "$CF_API_TOKEN" =~ ^[A-Za-z0-9_-]+$ ]] || { printf 'Некорректный формат Cloudflare token\n' >&2; exit 1; }
  MERCHANT_ADMIN_TOKEN=$(openssl rand -hex 32)
  MERCHANT_TOKEN=$(openssl rand -hex 32)
  # Save before the remote update, so a failed connection cannot lose the new value.
  printf 'MERCHANT_ADMIN_TOKEN=%q\nMERCHANT_TOKEN=%q\n' "$MERCHANT_ADMIN_TOKEN" "$MERCHANT_TOKEN" > "$STATE_DIR/credentials.pending"
  request PUT 'https://api.cloudflare.com/client/v4/accounts/1f3c4f97eb94cfdcc8b8aa2661d2e97b/workers/scripts/plata-merchant/secrets' "$(jq -n --arg token "$MERCHANT_ADMIN_TOKEN" '{name:"MERCHANT_ADMIN_TOKEN",type:"secret_text",text:$token}')" "$CF_API_TOKEN"
  expect '200'
  jq -e '.success == true' <<< "$RESPONSE" >/dev/null || { printf 'Cloudflare не подтвердил изменение секрета\n' >&2; exit 1; }
  mv "$STATE_DIR/credentials.pending" "$STATE_DIR/credentials.env"
  unset CF_API_TOKEN
fi
[[ ${MERCHANT_TOKEN:-} =~ ^[a-f0-9]{64}$ && ${MERCHANT_ADMIN_TOKEN:-} =~ ^[a-f0-9]{64}$ ]] || { printf 'Некорректный локальный файл credentials.env\n' >&2; exit 1; }
printf '1. Проверяем неправильный токен…\n'
request POST "$API" '{"merchant_token":"incorrect_merchant_token_0000000000000000","amount":150}'
expect '401'
printf '   Получен ожидаемый HTTP 401.\n'
printf '2. Регистрируем твой токен мерчанта…\n'
request POST "$MERCHANT_API" "$(jq -n --arg token "$MERCHANT_TOKEN" '{action:"register",merchant:$token}')" "$MERCHANT_ADMIN_TOKEN"
expect '201 409'
printf '   Мерчант зарегистрирован. Токен не выводится в терминал.\n'
printf '3. Создаём новый заказ на %s ₽…\n' "$AMOUNT"
request POST "$API" "$(jq -n --arg token "$MERCHANT_TOKEN" --argjson amount "$AMOUNT" '{merchant_token:$token,amount:$amount}')"
expect '201'
ORDER_ID=$(jq -er '.id' <<< "$RESPONSE")
ORDER_URL=$(jq -er '.url' <<< "$RESPONSE")
[[ "$ORDER_ID" =~ ^[a-z0-9]{4}(-[a-z0-9]{4}){3}$ && "$ORDER_URL" == "https://plata-pay.github.io/order/$ORDER_ID" ]] || { printf 'Некорректный ответ с ID или ссылкой\n' >&2; exit 1; }
printf '%s\n' "$RESPONSE" > "$STATE_DIR/latest-order.json"
printf '4. Проверяем статус тем же токеном…\n'
request POST "$API" "$(jq -n --arg token "$MERCHANT_TOKEN" --arg id "$ORDER_ID" '{merchant_token:$token,id:$id}')"
expect '200'
printf '   Статус: %s\n' "$(jq -er '.status' <<< "$RESPONSE")"
printf '\nОткрой ссылку на телефоне:\n%s\n\n' "$ORDER_URL"
printf 'Создание заказа не списывает деньги. Повторный запуск создаст новый заказ.\n'
