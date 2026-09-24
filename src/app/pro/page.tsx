import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, children, consultantNotes, parents, sleeps } from '@/db/schema';
import { currentConsultant } from '@/lib/pro-session';
import { durationMinutes, formatDuration, sleepDayOf } from '@/lib/sleep-day';
import { ageLabel, ageMonths, daysAgo, plural } from '@/lib/pro-format';
import {
  QUIET_AFTER_DAYS,
  TREND_STEP,
  ageGroups,
  clientStats,
  dailyActivity,
  localDate,
  shiftIso,
  summarize,
  type ClientStatus,
} from '@/lib/pro-stats';
import { proLogout } from './actions';
import { CopyButton, CopyLink } from '@/components/CopyLink';
import styles from '@/components/Pro.module.css';
import dash from '@/components/ProDashboard.module.css';

const STATUS: Record<ClientStatus, { label: string; className: string }> = {
  active: { label: 'ведёт дневник', className: dash.stActive },
  slowing: { label: 'реже отмечает', className: dash.stSlowing },
  quiet: { label: 'затихла', className: dash.stQuiet },
  new: { label: 'только подключилась', className: dash.stNew },
};

/** Готовый текст напоминания — Виктория копирует его в переписку с мамой. */
function reminderText(parentName: string | null, silentDays: number | null): string {
  const hello = parentName ? `${parentName}, здравствуйте!` : 'Здравствуйте!';
  if (silentDays === null) {
    return `${hello} Как у вас дела? Вижу, в дневнике сна пока нет записей — получилось открыть приложение? Если что-то не выходит, напишите, помогу.`;
  }
  return `${hello} Как у вас дела? Вижу, в дневнике сна нет записей уже ${silentDays} ${plural(silentDays, 'день', 'дня', 'дней')} — всё в порядке? Если отмечать неудобно, напишите, подскажу, как проще. Пропущенные сны можно внести задним числом — кнопка «Внести сон вручную» на главном экране.`;
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
      dayBoundary: children.dayBoundaryMinutes,
      nightFrom: children.nightFromMinutes,
      parentName: parents.firstName,
      timeZone: parents.timeZone,
      grantedAt: accessGrants.grantedAt,
    })
    .from(accessGrants)
    .innerJoin(children, eq(children.id, accessGrants.childId))
    .innerJoin(parents, eq(parents.id, children.parentId))
    .where(and(eq(accessGrants.consultantId, consultant.id), isNull(accessGrants.revokedAt)))
    .orderBy(desc(accessGrants.grantedAt));

  const revoked = await db
    .select({ revokedAt: accessGrants.revokedAt })
    .from(accessGrants)
    .where(and(eq(accessGrants.consultantId, consultant.id), isNotNull(accessGrants.revokedAt)));

  const ids = rows.map((row) => row.childId);
  const since = shiftIso(localDate(now), -16);

  // Последнее действие мамы — запись или правка, в том числе задним числом.
  const lastEntries = ids.length
    ? await db
        .select({
          childId: sleeps.childId,
          at: sql<Date>`max(greatest(${sleeps.createdAt}, ${sleeps.updatedAt}))`.mapWith(
            (value: string | Date) => new Date(value),
          ),
          days: sql<number>`count(distinct ${sleeps.sleepDay})`.mapWith(Number),
        })
        .from(sleeps)
        .where(inArray(sleeps.childId, ids))
        .groupBy(sleeps.childId)
    : [];
  const recentSleeps = ids.length
    ? await db
        .select({
          childId: sleeps.childId,
          sleepDay: sleeps.sleepDay,
          startedAt: sleeps.startedAt,
          endedAt: sleeps.endedAt,
        })
        .from(sleeps)
        .where(and(inArray(sleeps.childId, ids), gte(sleeps.sleepDay, since)))
    : [];
  const notes = ids.length
    ? await db
        .select({ childId: consultantNotes.childId, body: consultantNotes.body })
        .from(consultantNotes)
        .where(and(eq(consultantNotes.consultantId, consultant.id), inArray(consultantNotes.childId, ids)))
        .orderBy(desc(consultantNotes.createdAt))
    : [];

  const lastBy = new Map(lastEntries.map((entry) => [entry.childId, entry]));
  const noteBy = new Map<string, string>();
  for (const note of notes) if (!noteBy.has(note.childId)) noteBy.set(note.childId, note.body);
  const sleepsBy = new Map<string, { sleepDay: string; minutes: number }[]>();
  const daysBy = new Map<string, Set<string>>();
  for (const sleep of recentSleeps) {
    const list = sleepsBy.get(sleep.childId) ?? [];
    list.push({ sleepDay: sleep.sleepDay, minutes: durationMinutes(sleep.startedAt, sleep.endedAt, now) });
    sleepsBy.set(sleep.childId, list);
    const set = daysBy.get(sleep.childId) ?? new Set<string>();
    set.add(sleep.sleepDay);
    daysBy.set(sleep.childId, set);
  }

  const clients = rows.map((row) => {
    const window = { dayBoundary: row.dayBoundary, nightFrom: row.nightFrom, timeZone: row.timeZone };
    const stats = clientStats(
      {
        childId: row.childId,
        grantedAt: row.grantedAt,
        lastEntryAt: lastBy.get(row.childId)?.at ?? null,
        today: sleepDayOf(now, window),
        sleeps: sleepsBy.get(row.childId) ?? [],
      },
      now,
    );
    return {
      ...row,
      ...stats,
      diaryDays: lastBy.get(row.childId)?.days ?? 0,
      note: noteBy.get(row.childId) ?? null,
    };
  });

  const summary = summarize(
    clients,
    revoked.map((row) => row.revokedAt).filter((at): at is Date => at !== null),
    now,
  );
  const toRemind = clients
    .filter((client) => client.status === 'quiet')
    .sort((a, b) => (b.silentDays ?? 999) - (a.silentDays ?? 999));
  const activity = dailyActivity(daysBy, now, 14);
  const peak = Math.max(1, ...activity.map((day) => day.count));
  const ages = ageGroups(clients.map((client) => ageMonths(client.birthDate, now)));
  const agePeak = Math.max(1, ...ages.map((group) => group.count));
  const today = localDate(now);
  const dayLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });

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

  const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <h1>Кабинет</h1>
        <div className={styles.who}>
          <span>{consultant.name}</span>
          <form action={proLogout}>
            <button type="submit" className={styles.linkish}>
              Выйти
            </button>
          </form>
        </div>
      </div>

      {/* Главные цифры: сколько клиенток, кто пишет, кому написать. */}
      <section className={dash.kpis} aria-label="Главное">
        <div className={dash.kpi}>
          <span className={dash.kpiLabel}>Клиентки</span>
          <span className={dash.kpiValue}>{summary.total}</span>
          <span className={dash.kpiHint}>
            {summary.newThisWeek > 0 ? `+${summary.newThisWeek} за неделю` : 'новых за неделю нет'} · открыли
            вам дневник
          </span>
        </div>
        <div className={`${dash.kpi} ${dash.kpiGood}`}>
          <span className={dash.kpiLabel}>Ведут дневник</span>
          <span className={dash.kpiValue}>{summary.active}</span>
          <span className={dash.kpiHint}>отмечали сны сегодня или вчера</span>
        </div>
        <div className={`${dash.kpi} ${summary.quiet > 0 ? dash.kpiWarn : ''}`}>
          <span className={dash.kpiLabel}>Кому напомнить</span>
          <span className={dash.kpiValue}>{summary.quiet}</span>
          <span className={dash.kpiHint}>
            {QUIET_AFTER_DAYS}+ {plural(QUIET_AFTER_DAYS, 'день', 'дня', 'дней')} без записей
            {summary.slowing > 0 ? ` · ещё ${summary.slowing} реже отмечают` : ''}
          </span>
        </div>
        <div className={dash.kpi}>
          <span className={dash.kpiLabel}>Регулярность</span>
          <span className={dash.kpiValue}>{percent(summary.regularity)}</span>
          <span className={dash.kpiHint}>доля дней с записями за неделю, в среднем по клиенткам</span>
        </div>
      </section>

      <section className={dash.metrics} aria-label="Результаты и удержание">
        <div className={dash.metric}>
          <span className={dash.metricLabel}>Сон за неделю</span>
          <span className={dash.metricValue}>
            <span className={dash.up}>▲ {summary.better}</span>
            <span className={dash.flat}>≈ {summary.steady}</span>
            <span className={dash.down}>▼ {summary.worse}</span>
          </span>
          <span className={dash.metricHint}>
            у скольких клиенток суточный сон вырос, не изменился или снизился по сравнению с прошлой
            неделей (сдвиг от {TREND_STEP} мин, нужно хотя бы 3 дня записей в каждой неделе)
          </span>
        </div>
        <div className={dash.metric}>
          <span className={dash.metricLabel}>В работе в среднем</span>
          <span className={dash.metricValue}>
            {summary.avgWithUsDays === null
              ? '—'
              : `${summary.avgWithUsDays} ${plural(summary.avgWithUsDays, 'день', 'дня', 'дней')}`}
          </span>
          <span className={dash.metricHint}>сколько дней прошло с момента, как мама открыла вам доступ</span>
        </div>
        <div className={dash.metric}>
          <span className={dash.metricLabel}>Закрыли доступ</span>
          <span className={dash.metricValue}>{summary.leftThisMonth}</span>
          <span className={dash.metricHint}>
            за 30 дней: консультация закончилась или мама ушла. За всё время — {revoked.length}
          </span>
        </div>
      </section>

      {toRemind.length > 0 && (
        <section className={dash.panel} aria-labelledby="remind-title">
          <div className={styles.sectionHead}>
            <h2 id="remind-title" className={styles.sectionTitle}>
              Кому напомнить
            </h2>
            <span className={styles.private}>готовый текст — скопируйте и отправьте маме</span>
          </div>
          <ul className={dash.remindList}>
            {toRemind.map((client) => (
              <li key={client.childId} className={dash.remind}>
                <Link href={`/pro/${client.childId}`} className={dash.remindWho}>
                  <b>{client.name}</b>
                  <span>
                    {client.parentName ? `мама ${client.parentName} · ` : ''}
                    {client.silentDays === null
                      ? `записей нет с подключения (${daysAgo(client.withUsDays)})`
                      : `последняя запись ${daysAgo(client.silentDays)}`}
                  </span>
                </Link>
                <CopyButton
                  text={reminderText(client.parentName, client.silentDays)}
                  label="Скопировать сообщение"
                  className={dash.remindCopy}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.invite}>
        <b>Ссылка для мам</b>
        <CopyLink link={inviteLink} />
        <span>
          Отправьте её клиентке в переписке. Она откроет дневник и подтвердит доступ — после
          этого её записи появятся здесь.
        </span>
      </div>

      <section aria-labelledby="clients-title" className={dash.clientsBlock}>
        <div className={styles.sectionHead}>
          <h2 id="clients-title" className={styles.sectionTitle}>
            Клиентки
          </h2>
          <span className={styles.private}>свежие подключения сверху</span>
        </div>
        {clients.length === 0 ? (
          <p className={styles.empty}>
            Пока никто не подключился. Отправьте ссылку первой клиентке — она появится в списке
            сразу после подтверждения.
          </p>
        ) : (
          <ul className={styles.clients}>
            {clients.map((client) => (
              <li key={client.childId}>
                <Link href={`/pro/${client.childId}`} className={styles.client}>
                  <div className={dash.clientHead}>
                    <span className={styles.clientName}>{client.name}</span>
                    <span className={`${dash.status} ${STATUS[client.status].className}`}>
                      {STATUS[client.status].label}
                    </span>
                  </div>
                  <div className={styles.clientMeta}>
                    {ageLabel(client.birthDate, client.dueDate, now)}
                    {client.parentName ? ` · мама ${client.parentName}` : ''}
                  </div>
                  <div className={styles.clientMeta}>
                    {client.diaryDays > 0
                      ? `дней в дневнике: ${client.diaryDays} · последняя запись ${daysAgo(client.silentDays ?? 0)}`
                      : 'записей пока нет'}
                  </div>
                  {(client.avgSleep !== null || client.regularity !== null) && (
                    <div className={dash.clientStats}>
                      {client.avgSleep !== null && (
                        <span>
                          сон в сутки <b>{formatDuration(client.avgSleep)}</b>
                          {client.trend !== null && Math.abs(client.trend) >= TREND_STEP && (
                            <span className={client.trend > 0 ? dash.up : dash.down}>
                              {' '}
                              {client.trend > 0 ? '▲ +' : '▼ −'}
                              {formatDuration(Math.abs(client.trend))}
                            </span>
                          )}
                        </span>
                      )}
                      {client.regularity !== null && (
                        <span>
                          регулярность <b>{percent(client.regularity)}</b>
                        </span>
                      )}
                    </div>
                  )}
                  {client.note && <div className={dash.clientNote}>{client.note}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {clients.length > 0 && (
        <div className={dash.charts}>
          <figure className={dash.panel}>
            <figcaption className={dash.chartHead}>
              <span className={styles.sectionTitle}>Отмечали сны по дням</span>
              <span className={dash.chartHint}>
                сколько клиенток внесли хотя бы один сон в эти сутки — видно, не проседает ли
                вовлечённость
              </span>
            </figcaption>
            <ol className={dash.bars} aria-label="Клиентки с записями по дням, последние две недели">
              {activity.map((day) => (
                <li key={day.date} className={dash.barCol}>
                  <span className={dash.barValue}>{day.count}</span>
                  <span className={dash.barTrack}>
                    <i
                      className={`${dash.bar} ${day.date === today ? dash.barToday : ''}`}
                      style={{ height: `${(day.count / peak) * 100}%` }}
                    />
                  </span>
                  <span className={dash.barLabel}>
                    {day.date === today ? 'сег' : dayLabel.format(new Date(`${day.date}T12:00:00Z`))}
                    <small>{Number(day.date.slice(8))}</small>
                  </span>
                </li>
              ))}
            </ol>
          </figure>

          <figure className={dash.panel}>
            <figcaption className={dash.chartHead}>
              <span className={styles.sectionTitle}>Возраст малышей</span>
              <span className={dash.chartHint}>
                с какими возрастами вы работаете чаще — пригодится для контента и тарифов
              </span>
            </figcaption>
            <ul className={dash.ages}>
              {ages.map((group) => (
                <li key={group.label} className={dash.ageRow}>
                  <span className={dash.ageLabel}>{group.label}</span>
                  <span className={dash.ageTrack}>
                    <i className={dash.ageBar} style={{ width: `${(group.count / agePeak) * 100}%` }} />
                  </span>
                  <span className={dash.ageValue}>{group.count}</span>
                </li>
              ))}
            </ul>
          </figure>
        </div>
      )}
    </main>
  );
}
