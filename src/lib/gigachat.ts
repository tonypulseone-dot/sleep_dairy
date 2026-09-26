import { randomUUID } from 'node:crypto';

/**
 * Клиент GigaChat (Сбер). Работает с российского сервера, данные не
 * покидают Россию — поэтому распознавание скриншотов идёт через него.
 *
 * Как устроен доступ:
 *  1. Ключ авторизации (base64 от «Client ID:Client Secret») меняем на
 *     токен доступа — он живёт 30 минут, держим его в памяти процесса.
 *  2. Картинку загружаем в хранилище GigaChat и получаем её id.
 *  3. Спрашиваем модель, приложив id картинки.
 *  4. Картинку сразу удаляем из хранилища GigaChat.
 *
 * Сертификаты серверов Сбера выданы российским удостоверяющим центром
 * (Минцифры). Node ему по умолчанию не доверяет — корневой сертификат
 * кладётся в образ и подключается через NODE_EXTRA_CA_CERTS (см. Dockerfile).
 */

const AUTH_URL = process.env.GIGACHAT_AUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const API_URL = process.env.GIGACHAT_API_URL || 'https://gigachat.devices.sberbank.ru/api/v1';
const SCOPE = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
/** Модель, которая умеет читать картинки. */
export const GIGACHAT_MODEL = process.env.GIGACHAT_MODEL || 'GigaChat-2-Max';

export function gigachatConfigured(): boolean {
  return Boolean(process.env.GIGACHAT_AUTH_KEY);
}

/** Ошибка GigaChat с понятным описанием для журнала сервера. */
export class GigaChatError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: 'auth' | 'quota' | 'rate' | 'network' | 'bad_response' | 'other',
  ) {
    super(message);
  }
}

let cached: { token: string; expiresAt: number } | null = null;

async function call(url: string, init: RequestInit, what: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(90_000) });
  } catch (cause) {
    const reason = cause instanceof Error ? `${cause.message} ${String((cause as { cause?: unknown }).cause ?? '')}` : String(cause);
    const tls = /certificate|self.signed|UNABLE_TO_GET_ISSUER|CERT_/i.test(reason);
    throw new GigaChatError(
      tls
        ? `GigaChat: не доверяем сертификату Сбера (${what}). Нужен корневой сертификат Минцифры в NODE_EXTRA_CA_CERTS. ${reason}`
        : `GigaChat недоступен (${what}): ${reason}`,
      null,
      'network',
    );
  }
  if (response.ok) return response;

  const body = (await response.text().catch(() => '')).slice(0, 400);
  const kind =
    response.status === 401 || response.status === 403
      ? 'auth'
      : response.status === 402
        ? 'quota'
        : response.status === 429
          ? 'rate'
          : 'other';
  throw new GigaChatError(`GigaChat ${what}: HTTP ${response.status} ${body}`, response.status, kind);
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const key = process.env.GIGACHAT_AUTH_KEY;
  if (!key) throw new GigaChatError('GIGACHAT_AUTH_KEY не задан', null, 'auth');

  const response = await call(
    AUTH_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${key}`,
        RqUID: randomUUID(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ scope: SCOPE }).toString(),
    },
    'получение токена',
  );
  const data = (await response.json()) as { access_token?: string; expires_at?: number };
  if (!data.access_token) throw new GigaChatError('GigaChat не вернул токен', response.status, 'bad_response');
  cached = { token: data.access_token, expiresAt: data.expires_at ?? Date.now() + 25 * 60_000 };
  return cached.token;
}

async function authorized(path: string, init: RequestInit, what: string): Promise<Response> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  try {
    return await call(`${API_URL}${path}`, { ...init, headers }, what);
  } catch (error) {
    // Токен могли отозвать раньше срока — один раз берём новый.
    if (error instanceof GigaChatError && error.status === 401 && cached) {
      cached = null;
      headers.set('Authorization', `Bearer ${await accessToken()}`);
      return call(`${API_URL}${path}`, { ...init, headers }, what);
    }
    throw error;
  }
}

async function uploadImage(image: Buffer, mime: string): Promise<string> {
  const form = new FormData();
  const extension = mime === 'image/png' ? 'png' : 'jpg';
  form.append('file', new Blob([new Uint8Array(image)], { type: mime }), `screenshot.${extension}`);
  form.append('purpose', 'general');
  const response = await authorized('/files', { method: 'POST', body: form }, 'загрузка картинки');
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new GigaChatError('GigaChat не вернул id картинки', response.status, 'bad_response');
  return data.id;
}

async function deleteFile(id: string): Promise<void> {
  await authorized(`/files/${encodeURIComponent(id)}/delete`, { method: 'POST' }, 'удаление картинки').catch(
    (error: unknown) => console.error('GigaChat: не удалось удалить картинку', id, error),
  );
}

/** Один вопрос к модели. С картинкой — если передана. Возвращает текст ответа. */
export async function askGigaChat(
  prompt: string,
  image?: { data: Buffer; mime: string },
  model: string = GIGACHAT_MODEL,
): Promise<string> {
  const fileId = image ? await uploadImage(image.data, image.mime) : null;
  try {
    const response = await authorized(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          // Нужна не фантазия, а переписывание цифр: минимум случайности.
          temperature: 0.01,
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: prompt,
              ...(fileId ? { attachments: [fileId] } : {}),
            },
          ],
        }),
      },
      'распознавание',
    );
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new GigaChatError('GigaChat вернул пустой ответ', response.status, 'bad_response');
    return content;
  } finally {
    // Скриншот с детскими данными не должен оставаться у Сбера дольше, чем нужно.
    if (fileId) await deleteFile(fileId);
  }
}

/** Для проверки доступа: список моделей. */
export async function listModels(): Promise<string[]> {
  const response = await authorized('/models', { method: 'GET' }, 'список моделей');
  const data = (await response.json()) as { data?: { id: string }[] };
  return (data.data ?? []).map((model) => model.id);
}
