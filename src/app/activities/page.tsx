import Link from 'next/link';
import { redirect } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { activityGroups } from '@/db/schema';
import { TelegramBoot } from '@/components/TelegramBoot';
import { currentChild, currentParent } from '@/lib/session';
import { ageInMonths } from '@/lib/rhythm';
import { forAge, pickGroup } from '@/lib/activity-groups';
import styles from './activities.module.css';
import { BackButton } from '@/components/BackButton';
import { ActivityList } from '@/components/ActivityList';
import { IconToy } from '@/components/Icons';

/**
 * Чем занять в бодрствование — подборка Виктории по возрастам.
 *
 * Она объяснила, зачем это нужно: «когда мы тянем бодрствование, малыш
 * начинает конючить, мама думает, что хочет спать, и укладывает. А по
 * факту ребёнку скучно». Сразу открывается группа по возрасту малыша;
 * другие возрасты — внизу, если хочется заглянуть вперёд или назад.
 */
export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const parent = await currentParent();
  if (!parent) return <TelegramBoot botUsername={process.env.TELEGRAM_BOT_USERNAME} />;

  const child = await currentChild(parent.id);
  if (!child) redirect('/onboarding');

  const months = ageInMonths(child.birthDate, child.dueDate, new Date());

  const groups = await db
    .select()
    .from(activityGroups)
    .where(eq(activityGroups.published, true))
    .orderBy(asc(activityGroups.position));

  const picked = pickGroup(groups, months);
  const { g } = await searchParams;
  const asked = groups.find((group) => group.id === g);
  const group = asked ?? picked?.group ?? null;
  const own = group !== null && group.id === picked?.group.id;

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <BackButton href="/" className={styles.back} label="Назад" />
        <span className={styles.mark} aria-hidden="true">
          <IconToy size={20} />
        </span>
        <h1>Чем заняться</h1>
        <span className={styles.age}>{months} мес</span>
      </header>

      <p className={styles.lead}>
        Если малыш закапризничал в конце бодрствования, это не всегда усталость. Иногда просто
        скучно — и тогда сон лучше не двигать, а занять малыша.
      </p>

      {group === null ? (
        <p className={styles.empty}>Занятия пока не добавлены</p>
      ) : (
        <>
          <section className={styles.group} aria-labelledby="group-title">
            <h2 id="group-title" className={styles.groupTitle}>
              Занятия для {forAge(group.title)}
            </h2>
            {own && !picked?.exact && (
              <p className={styles.groupNote}>
                Отдельного списка для {months} мес пока нет — это ближайший по возрасту.
              </p>
            )}
            {!own && picked && (
              <p className={styles.groupNote}>
                Это занятия для другого возраста.{' '}
                <Link href="/activities" className={styles.backLink}>
                  Вернуться к занятиям для {forAge(picked.group.title)}
                </Link>
              </p>
            )}
            {group.intro && <p className={styles.intro}>{group.intro}</p>}
          </section>

          <ActivityList key={group.id} sections={group.sections} />

          {/* Совет Виктории в конце группы: «Если малыш не любит живот — это нормально…» */}
          {group.outro && <p className={styles.outro}>{group.outro}</p>}

          <nav className={styles.others} aria-label="Другой возраст">
            <span className={styles.othersLabel}>Другой возраст</span>
            <div className={styles.othersList}>
              {groups.map((item) => (
                <Link
                  key={item.id}
                  href={item.id === picked?.group.id ? '/activities' : `/activities?g=${item.id}`}
                  aria-current={item.id === group.id ? 'page' : undefined}
                  className={`${styles.other} ${item.id === group.id ? styles.otherOn : ''}`}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </nav>
        </>
      )}
    </main>
  );
}
