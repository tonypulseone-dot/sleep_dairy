import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Проверка initData из Telegram Mini App.
 *
 * Telegram подписывает данные о пользователе ключом, производным от токена бота.
 * Без этой проверки любой может представиться кем угодно, поэтому доверять
 * содержимому initData до успешной валидации нельзя.
 *
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface InitData {
  user: TelegramUser;
  authDate: Date;
  startParam?: string;
}

/** Сколько живёт подпись. Старее — просим открыть приложение заново. */
const MAX_AGE_SECONDS = 24 * 60 * 60;

export function verifyInitData(raw: string, botToken: string, now: Date = new Date()): InitData | null {
  if (!raw || !botToken) return null;

  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  // Подпись считается по парам ключ=значение, отсортированным по ключу.
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');

  if (!safeEqualHex(hash, expected)) return null;

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) return null;
  const authDate = new Date(Number(authDateRaw) * 1000);
  if (Number.isNaN(authDate.getTime())) return null;
  if ((now.getTime() - authDate.getTime()) / 1000 > MAX_AGE_SECONDS) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return null;
  }
  if (typeof user?.id !== 'number') return null;

  return {
    user,
    authDate,
    // Хвост ссылки-приглашения консультанта: ?startapp=<slug>
    startParam: params.get('start_param') ?? undefined,
  };
}

/** Сравнение без утечки времени. Длины могут не совпасть — тогда сразу мимо. */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
