import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, children, parents, sleeps } from '@/db/schema';
import { currentConsultant } from '@/lib/pro-session';
import { proLogout } from './actions';
import styles from '@/components/Pro.module.css';

/** Возраст ребёнка словами. Скорректированный — если родился раньше срока. */
function ageLabel(birthDate: string, dueDate: string | null, now: Date): string {
  const months = (from: string) => {
    const start = new Date(`${from}T00:00:00Z`);
    let value =
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - start.getUTCMonth());
    if (now.getUTCDate() < start.getUTCDate()) value -= 1;
    return Math.max(0, value);
  };

  const actual = months(birthDate);
  const word = actual === 1 ? 'месяц' : actual < 5 ? 'месяца' : 'месяцев';
  if (!dueDate) return `${actual} ${word}`;

  const corrected = months(dueDate);
  return `${actual} ${word} · скорректированный ${corrected}`;
}

export default async function ProHome() {
  const consultant = await currentConsultant();
  if (!consultant) redirect('/pro/login');

  const now = new Date();

  const rows = await db
    .select({
      childId: children.id,
      name: children.name,
      birthDate: children.birthDate,
      dueDate: children.dueDate,
      parentName: parents.firstName,
      grantedAt: accessGrants.grantedAt,
      lastEntry: sql<string | null>`max(${sleeps.sleepDay})`,
      days: sql<number>`count(distinct ${sleeps.sleepDay})`,
    })
    .from(accessGrants)
    .innerJoin(children, eq(children.id, accessGrants.childId))
    .innerJoin(parents, eq(parents.id, children.parentId))
    .leftJoin(sleeps, eq(sleeps.childId, children.id))
    .where(and(eq(accessGrants.consultantId, consultant.id), isNull(accessGrants.revokedAt)))
    .groupBy(
      children.id,
      children.name,
      children.birthDate,
      children.dueDate,
      parents.firstName,
      accessGrants.grantedAt,
    )
    .orderBy(desc(accessGrants.grantedAt));

  // Два вида ссылки. Прямая t.me/бот/app?startapp= открывает приложение
  // сразу, но работает, только если оно заведено в BotFather через /newapp —
  // иначе мама получит «приложение не найдено». Поэтому прямая включается
  // коротким именем из /newapp, а по умолчанию ссылка идёт через /start,
  // на который бот отвечает кнопкой на экран согласия. Прямая нужна там,
  // где бот работать не может: с сервера не открывается api.telegram.org.
  const botName = process.env.TELEGRAM_BOT_USERNAME;
  const appShortName = process.env.TELEGRAM_APP_SHORT_NAME;
  const inviteLink = !botName
    ? `${process.env.APP_URL ?? ''}/connect?c=${consultant.slug}`
    : appShortName
      ? `https://t.me/${botName}/${appShortName}?startapp=${consultant.slug}`
      : `https://t.me/${botName}?start=${consultant.slug}`;

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <h1>Клиентки</h1>
        <div className={styles.who}>
          <span>{consultant.name}</span>
          <form action={proLogout}>
            <button type="submit" className={styles.linkish}>
              Выйти
            </button>
          </form>
        </div>
      </div>

      <div className={styles.invite}>
        <b>Ссылка для мам</b>
        <code>{inviteLink}</code>
        <span>
          Отправьте её клиентке в переписке. Она откроет дневник и подтвердит доступ — после
          этого её записи появятся здесь.
        </span>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>
          Пока никто не подключился. Отправьте ссылку первой клиентке — она появится в списке
          сразу после подтверждения.
        </p>
      ) : (
        <ul className={styles.clients}>
          {rows.map((row) => (
            <li key={row.childId}>
              <Link href={`/pro/${row.childId}`} className={styles.client}>
                <div className={styles.clientName}>{row.name}</div>
                <div className={styles.clientMeta}>
                  {ageLabel(row.birthDate, row.dueDate, now)}
                  {row.parentName ? ` · мама ${row.parentName}` : ''}
                </div>
                <div className={styles.clientMeta}>
                  {Number(row.days) > 0
                    ? `дней в дневнике: ${row.days} · последняя запись ${row.lastEntry}`
                    : 'записей пока нет'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
