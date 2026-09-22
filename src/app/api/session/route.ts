import { NextResponse } from 'next/server';
import { setSessionCookie, upsertParent } from '@/lib/session';
import { verifyInitData } from '@/lib/telegram';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    initData?: string;
    dev?: boolean;
  };

  // Локальная разработка без Telegram: один и тот же тестовый родитель.
  if (body.dev && process.env.NODE_ENV !== 'production') {
    const parent = await upsertParent({ telegramId: 'dev-1', firstName: 'Разработка' });
    await setSessionCookie(parent.id);
    return NextResponse.json({ ok: true, dev: true, invite: null });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return new NextResponse('Приложение не настроено: нет токена бота', { status: 500 });
  }
  if (!body.initData) {
    return new NextResponse('Откройте приложение через Telegram', { status: 400 });
  }

  const verified = verifyInitData(body.initData, token);
  if (!verified) {
    return new NextResponse('Не удалось подтвердить вход. Откройте приложение заново.', { status: 401 });
  }

  const parent = await upsertParent({
    telegramId: String(verified.user.id),
    firstName: verified.user.first_name ?? null,
  });
  await setSessionCookie(parent.id);
  // Хвост ссылки-приглашения: по нему мама попадёт на экран согласия.
  return NextResponse.json({ ok: true, invite: verified.startParam ?? null });
}
