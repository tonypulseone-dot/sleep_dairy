import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consultants } from '@/db/schema';
import { verifyPassword } from '@/lib/password';
import { askGigaChat, gigachatConfigured, GIGACHAT_MODEL } from '@/lib/gigachat';
import { parseRecognized, screenshotPrompt } from '@/lib/import-parse';
import { IMPORT_FIXTURES } from '@/lib/import-fixtures';

/**
 * Самопроверка распознавания: прогоняет эталонные скриншоты (выдуманные
 * данные, public/diag) через настоящий GigaChat и сравнивает с ожидаемым.
 * Нужна, чтобы настраивать подсказку модели без доступа к серверу.
 * Доступ — логин и пароль консультанта (Basic). Не чаще раза в 15 секунд.
 */

let lastRun = 0;

async function authorized(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return false;
  const [email, ...rest] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  const [consultant] = await db
    .select()
    .from(consultants)
    .where(eq(consultants.email, (email ?? '').trim().toLowerCase()))
    .limit(1);
  return Boolean(consultant && verifyPassword(rest.join(':'), consultant.passwordHash));
}

export async function POST(request: Request) {
  if (!(await authorized(request))) {
    return new NextResponse('Нужен логин консультанта', { status: 401, headers: { 'WWW-Authenticate': 'Basic' } });
  }
  if (!gigachatConfigured()) return NextResponse.json({ error: 'GIGACHAT_AUTH_KEY не задан' }, { status: 503 });
  if (Date.now() - lastRun < 15_000) return NextResponse.json({ error: 'Не чаще раза в 15 секунд' }, { status: 429 });
  lastRun = Date.now();

  const id = new URL(request.url).searchParams.get('case') ?? '';
  const fixture = IMPORT_FIXTURES.find((item) => item.id === id);
  if (!fixture) return NextResponse.json({ error: 'Неизвестный case', cases: IMPORT_FIXTURES.map((item) => item.id) }, { status: 400 });

  const image = await readFile(path.join(process.cwd(), 'public', 'diag', `${fixture.id}.jpg`));
  const started = Date.now();
  let raw: string;
  try {
    raw = await askGigaChat(screenshotPrompt(fixture.today), { data: image, mime: 'image/jpeg' });
  } catch (error) {
    return NextResponse.json({ case: fixture.id, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
  const parsed = parseRecognized(raw, fixture.today);
  const found = parsed.sleeps.map((sleep) => `${sleep.date} ${sleep.start}-${sleep.end}${sleep.doubtful ? ' ?' : ''}`);
  const plain = new Set(found.map((item) => item.replace(' ?', '')));
  const expected = new Set(fixture.expected);

  return NextResponse.json({
    case: fixture.id,
    title: fixture.title,
    model: GIGACHAT_MODEL,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    ok: parsed.screen === fixture.screen && fixture.expected.every((item) => plain.has(item)) && plain.size === expected.size,
    screen: { expected: fixture.screen, got: parsed.screen },
    missing: fixture.expected.filter((item) => !plain.has(item)),
    extra: [...plain].filter((item) => !expected.has(item)),
    found,
    swapped: parsed.swapped,
    dropped: parsed.dropped,
    raw,
  });
}
