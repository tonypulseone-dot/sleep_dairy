import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { consultants } from '@/db/schema';

/**
 * Консультант, к которому попадают все мамы.
 *
 * Пока приложение — только для клиенток Виктории, её доступ оформляется
 * сразу при регистрации (с согласием мамы в анкете). Кто это — задаёт
 * DEFAULT_CONSULTANT_SLUG; если он не задан, а консультант в базе один,
 * берём его. Когда консультантов станет несколько, без явной настройки
 * никто по умолчанию не подключается.
 */
export async function defaultConsultant() {
  const slug = process.env.DEFAULT_CONSULTANT_SLUG?.trim();
  if (slug) {
    const [bySlug] = await db.select().from(consultants).where(eq(consultants.slug, slug)).limit(1);
    return bySlug ?? null;
  }
  const all = await db.select().from(consultants).limit(2);
  return all.length === 1 ? all[0] : null;
}
