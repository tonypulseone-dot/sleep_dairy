import { NextResponse } from 'next/server';
import { setSessionCookie, upsertParent } from '@/lib/session';
import { verifyInitData } from '@/lib/telegram';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    initData?: string;
    dev?: boolean;
  };

  /*
   * Вход без Telegram — только для локальной разработки.
   *
   * Раньше он открывался по одному лишь NODE_ENV. Это опасно: если
   * приложение запустят не через наш образ и переменная не выставится,
   * любой желающий получит чужую сессию одним запросом. Поэтому нужен
   * ещё и явный ALLOW_DEV_LOGIN — забыть выставить его безопасно,
   * забыть снять уже нет.
   */
  if (body.dev && process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === '1') {
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
