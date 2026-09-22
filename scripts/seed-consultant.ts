/**
 * Заводит консультанта: npx tsx scripts/seed-consultant.ts <почта> <пароль> <имя> <slug>
 *
 * Пока регистрация закрыта — консультантов заводим руками. Откроем её,
 * когда пройдём проверку на живых клиентках и появятся тарифы.
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { consultants } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';

const [email, password, name, slug] = process.argv.slice(2);

async function main() {
  if (!email || !password || !name || !slug) {
    console.error('Нужно: <почта> <пароль> <имя> <slug>');
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(consultants)
    .where(eq(consultants.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    await db
      .update(consultants)
      .set({ passwordHash: hashPassword(password), name, slug })
      .where(eq(consultants.id, existing.id));
    console.log(`Обновлён консультант ${email}, ссылка: ?startapp=${slug}`);
  } else {
    await db.insert(consultants).values({
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      name,
      slug,
    });
    console.log(`Заведён консультант ${email}, ссылка: ?startapp=${slug}`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
