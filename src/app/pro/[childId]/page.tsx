import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accessGrants, children, consultantNotes, parents, sleeps } from '@/db/schema';
import { SleepChart, type ChartDay } from '@/components/SleepChart';
import { SleepTimeline, type TimelineDay } from '@/components/SleepTimeline';
import { ProNotes } from '@/components/ProNotes';
import { ageLabel, clockOf } from '@/lib/pro-format';
import { currentConsultant } from '@/lib/pro-session';
import {
  averageTotalSleep,
  dayStartInstant,
  durationMinutes,
  formatDuration,
  formatTimeOfDay,
  localMinutes,
  shiftDate,
  sleepDayOf,
  summarizeDay,
  openingNight,
  type DayTotals,
  type DayWindow,
} from '@/lib/sleep-day';
import { childWords } from '@/lib/words';
import styles from '@/components/Pro.module.css';

const PERIODS = [5, 7, 10, 14] as const;
/** Шкала суток начинается за 12 часов до утренней границы: с 18:00 при утре в 06:00. */
const AXIS_BEFORE_MORNING = 12 * 60;

export default async function ClientCard({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const consultant = await currentConsultant();
  if (!consultant) redirect('/pro/login');

  const { childId } = await params;

  // Доступ действует, пока мама его не отозвала: проверяем на каждый заход,
  // а не один раз при входе в кабинет.
  const [access] = await db
    .select({ id: accessGrants.id, grantedAt: accessGrants.grantedAt })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.childId, childId),
        eq(accessGrants.consultantId, consultant.id),
        isNull(accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (!access) notFound();

  const [child] = await db.select().from(children).where(eq(children.id, childId)).limit(1);
  if (!child) notFound();
  const [parent] = await db.select().from(parents).where(eq(parents.id, child.parentId)).limit(1);

  const notes = await db
    .select()
    .from(consultantNotes)
    .where(and(eq(consultantNotes.childId, childId), eq(consultantNotes.consultantId, consultant.id)))
    .orderBy(desc(consultantNotes.createdAt));

  const window: DayWindow = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };

  const requested = Number((await searchParams).p);
  const period = PERIODS.includes(requested as (typeof PERIODS)[number]) ? requested : 7;

  const now = new Date();
  const today = sleepDayOf(now, window);
  const from = shiftDate(today, -(period - 1));

  const rows = await db
    .select()
    .from(sleeps)
    // Без верхней границы: ночь следующих суток нужна для бодрствования перед ней.
    .where(and(eq(sleeps.childId, childId), gte(sleeps.sleepDay, from)))
    .orderBy(asc(sleeps.startedAt));

  const byDay = new Map<string, { startedAt: Date; endedAt: Date | null }[]>();
  for (const row of rows) {
    const list = byDay.get(row.sleepDay) ?? [];
    list.push({ startedAt: row.startedAt, endedAt: row.endedAt });
    byDay.set(row.sleepDay, list);
  }

  const days: DayTotals[] = [];
  for (let offset = 0; offset < period; offset += 1) {
    const sleepDay = shiftDate(today, -offset);
    // Сутки заканчиваются уходом в следующую ночь — она открывает следующие сутки.
    const nextNight = openingNight(byDay.get(shiftDate(sleepDay, 1)) ?? [], window);
    days.push(summarizeDay(sleepDay, byDay.get(sleepDay) ?? [], window, now, nextNight));
  }

  // Сегодняшний день ещё не закончился: включать его в среднее — занижать цифру.
  const completed = days.filter((day) => day.sleepDay !== today && day.totalSleep > 0);
  const average = averageTotalSleep(completed);

  /*
   * Шкала по дням, свежий день сверху. Сутки по Виктории начинаются с ночи,
   * поэтому шкала идёт с вечера накануне (за 12 часов до утренней границы):
   * слева ночь, дальше день и бодрствование до следующей ночи.
   */
  const byDayRows = new Map<string, typeof rows>();
  for (const row of rows) byDayRows.set(row.sleepDay, [...(byDayRows.get(row.sleepDay) ?? []), row]);
  const clock = (at: Date) => formatTimeOfDay(localMinutes(at, window.timeZone));
  const timelineLabel = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const timeline: TimelineDay[] = days.map((day) => {
    const start = dayStartInstant(day.sleepDay, window).getTime() - AXIS_BEFORE_MORNING * 60000;
    const minutesFrom = (at: Date) => (at.getTime() - start) / 60000;
    const dayRows = byDayRows.get(day.sleepDay) ?? [];
    const segments = dayRows.map((row) => {
      const end = row.endedAt ?? now;
      const from = Math.max(0, Math.min(1440, minutesFrom(row.startedAt)));
      return {
        from,
        to: Math.max(from, Math.min(1440, minutesFrom(end))),
        kind: row.kind,
        ongoing: row.endedAt === null,
        start: clock(row.startedAt),
        end: row.endedAt ? clock(row.endedAt) : null,
        duration: formatDuration(durationMinutes(row.startedAt, end)),
      };
    });
    // Бодрствование перед каждым сном; между кусками одной ночи — ночное пробуждение.
    const wakes = dayRows.map((row, index) => {
      const previous = dayRows[index - 1];
      if (!previous?.endedAt) return null;
      const minutes = durationMinutes(previous.endedAt, row.startedAt);
      if (minutes < 1) return null;
      return { text: formatDuration(minutes), night: previous.kind === 'night' && row.kind === 'night' };
    });
    const nextNight = openingNight(byDay.get(shiftDate(day.sleepDay, 1)) ?? [], window);
    const complete = day.sleepDay !== today && day.totalSleep > 0;
    const diff = average === null || !complete ? 0 : day.totalSleep - average;
    const nowAt = day.sleepDay === today ? Math.round(minutesFrom(now)) : null;
    return {
      sleepDay: day.sleepDay,
      label: timelineLabel.format(new Date(`${day.sleepDay}T12:00:00Z`)),
      isToday: day.sleepDay === today,
      segments,
      wakes,
      evening:
        day.eveningWake !== null && nextNight
          ? { wake: formatDuration(day.eveningWake), night: clock(nextNight) }
          : null,
      total: formatDuration(day.totalSleep),
      day: formatDuration(day.daySleep),
      night: formatDuration(day.nightSleep),
      napCount: day.napCount,
      // Отклонение от среднего — только заметное: мелочь в полчаса глаз не должна цеплять.
      delta: Math.abs(diff) >= 30 ? { text: `${diff > 0 ? '+' : '−'}${formatDuration(Math.abs(diff))}`, up: diff > 0 } : null,
      nowAt: nowAt !== null && nowAt >= 0 && nowAt <= 1440 ? nowAt : null,
    };
  });

  // График читается слева направо от старых дней к свежим, как и любая динамика.
  const chartDays: ChartDay[] = [...days].reverse().map((day) => ({
    label: new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${day.sleepDay}T12:00:00Z`)),
    title: new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      .format(new Date(`${day.sleepDay}T12:00:00Z`)),
    daySleep: day.daySleep,
    nightSleep: day.nightSleep,
  }));

  const noteTime = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Moscow',
  });
  const since = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  const birth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const words = childWords(child.sex);
  // «10 мая 2026 г.» — точку в конце убираем, дальше идёт своя.
  const bornOn = birth.format(new Date(`${child.birthDate}T12:00:00Z`)).replace(/\.$/, '');

  // Каждое поле — с пояснением: что это и зачем консультанту.
  const profile: { label: string; value: React.ReactNode; hint: string }[] = [
    {
      label: 'Возраст',
      value: ageLabel(child.birthDate, child.dueDate, now),
      hint: child.dueDate
        ? `${words.born} ${bornOn}. Скорректированный — от предполагаемой даты родов: по нему подбираем режим недоношенным.`
        : `${words.born} ${bornOn}. По возрасту сверяем нормы сна и окна бодрствования.`,
    },
    {
      label: 'Срок рождения',
      value: child.isPreterm ? words.preterm : words.fullTerm,
      hint: child.isPreterm
        ? 'Недоношенным режим ориентируем на скорректированный возраст, а не на фактический.'
        : `${words.born} в срок — режим сверяем с фактическим возрастом.`,
    },
    {
      label: 'Вскармливание',
      value: child.feedingType === 'formula' ? 'искусственное' : child.feedingType === 'mixed' ? 'смешанное' : 'грудное',
      hint: 'Влияет на ночные пробуждения, кормления перед сном и ассоциации на засыпание.',
    },
    {
      label: 'Темперамент',
      value:
        child.temperament && child.temperament.length > 0 ? (
          <span className={styles.tags}>
            {child.temperament.map((item) => (
              <span key={item} className={styles.tag}>
                {item}
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.muted}>мама не отметила</span>
        ),
      hint: 'Мама выбирает при регистрации. Подсказывает, насколько малыш чувствителен к укладыванию, шуму и смене обстановки.',
    },
    {
      label: 'Особенности здоровья',
      value: child.healthNotes ? (
        <span className={styles.health}>{child.healthNotes}</span>
      ) : (
        <span className={styles.muted}>мама ничего не указала</span>
      ),
      hint: 'Со слов мамы: анемия, рефлюкс, аллергия и т. п. — меняют тактику работы со сном.',
    },
    {
      label: 'Границы суток',
      value: `день с ${clockOf(child.dayBoundaryMinutes)}, ночь с ${clockOf(child.nightFromMinutes)}`,
      hint: 'Как настроено у мамы: по этим часам сон делится на дневной и ночной, а записи — на сутки.',
    },
    {
      label: 'Мама',
      value: `${parent.firstName ?? 'без имени'} · открыла доступ ${since.format(access.grantedAt)}`,
      hint: 'Доступ действует, пока мама его не закроет в приложении — тогда карточка исчезнет из кабинета.',
    },
  ];

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <h1 className={styles.cardName}>{child.name}</h1>
        <Link href="/pro" className={styles.linkish}>
          Ко всем клиенткам
        </Link>
      </div>

      <section className={styles.profile} aria-label="О малыше">
        <dl className={styles.fields}>
          {profile.map((field) => (
            <div key={field.label} className={styles.field2}>
              <dt className={styles.fieldLabel}>{field.label}</dt>
              <dd className={styles.fieldValue}>{field.value}</dd>
              <dd className={styles.fieldHint}>{field.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      <ProNotes
        childId={childId}
        notes={notes.map((note) => ({ id: note.id, body: note.body, when: noteTime.format(note.createdAt) }))}
      />

      <div className={styles.periods}>
        <span className={styles.periodLabel}>Показать за</span>
        {PERIODS.map((value) => (
          <Link
            key={value}
            href={`/pro/${childId}?p=${value}`}
            className={`${styles.period} ${value === period ? styles.periodOn : ''}`}
          >
            {value} дней
          </Link>
        ))}
        {/* Та же выборка таблицей — для Excel и переписки с мамой. */}
        <a href={`/pro/${childId}/export?days=${period}`} className={styles.download} download>
          Скачать таблицу
        </a>
      </div>

      <SleepChart
        days={chartDays}
        hint="Столбец — весь сон за сутки: ночной снизу, дневной сверху. Видно, растёт ли сон и не проседают ли отдельные дни."
      />

      <SleepTimeline
        days={timeline}
        axisFrom={(child.dayBoundaryMinutes - AXIS_BEFORE_MORNING + 1440) % 1440}
        hint="Каждая строка — сутки: ночь (с вечера накануне) и день после неё, до ухода в следующую ночь. Под шкалой — время каждого сна и бодрствования (↔): после ночи — с утра, дальше — между снами и перед ночью (→ ночь). Справа — итоги и отклонение от среднего (▲▼)."
      />

      <div className={styles.average}>
        <span className={styles.averageLabel}>Средне-суточный сон</span>
        <span className={styles.averageValue}>{average === null ? '—' : formatDuration(average)}</span>
        <span className={styles.averageNote}>
          {completed.length === 0
            ? 'нужен хотя бы один завершённый день'
            : `по ${completed.length} завершённым дням, сегодняшний не считаем`}
        </span>
      </div>
    </main>
  );
}
