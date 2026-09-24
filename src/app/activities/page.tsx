import { redirect } from 'next/navigation';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { activities } from '@/db/schema';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { ageInMonths } from '@/lib/rhythm';
import styles from './activities.module.css';
import { BackButton } from '@/components/BackButton';

/**
 * Чем занять в бодрствование.
 *
 * Виктория объяснила, зачем это нужно: «когда мы тянем бодрствование,
 * малыш начинает конючить, мама думает, что хочет спать, и укладывает.
 * А по факту ребёнку скучно». Поэтому список короткий и по возрасту —
 * открыла, прочитала строку, пошла.
 */
export default async function ActivitiesPage() {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const months = ageInMonths(child.birthDate, child.dueDate, new Date());

  const rows = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.published, true),
        lte(activities.ageMonthsFrom, months),
        gte(activities.ageMonthsTo, months),
      ),
    )
    .orderBy(asc(activities.ageMonthsFrom));

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <BackButton href="/" className={styles.back} label="Назад" />
        <h1>Чем заняться</h1>
        <span className={styles.age}>{months} мес</span>
      </header>

      <p className={styles.lead}>
        Если малыш закапризничал в конце бодрствования, это не всегда усталость. Иногда просто
        скучно — и тогда сон лучше не двигать.
      </p>

      {rows.length === 0 ? (
        <p className={styles.empty}>Для этого возраста пока ничего не добавлено</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.card}>
              <h2>{row.title}</h2>
              <p>{row.body}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
