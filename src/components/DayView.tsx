'use client';

import { unwrap } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addSleepManual, deleteSleep, updateSleep } from '@/app/actions';
import styles from './DayView.module.css';
import { IconBack, IconCalendar, IconForward, IconMoon } from './Icons';
import { childWords, type ChildSex } from '@/lib/words';
import { BackButton } from './BackButton';

export interface DayRow {
  id: string;
  kind: 'day' | 'night';
  start: string;
  end: string | null;
  duration: string;
}

export interface DayTotalsView {
  daySleep: string;
  nightSleep: string;
  totalSleep: string;
  totalWake: string;
  napCount: number;
}

interface Props {
  sleepDay: string;
  /** Сегодняшние сонные сутки — для выбора «сегодня / вчера / позавчера». */
  today: string;
  dayBoundary: number;
  nightFrom: number;
  /** Пришли с главной по кнопке «Внести сон вручную» — форма сразу открыта. */
  startAdding?: boolean;
  title: string;
  prevDay: string;
  nextDay: string | null;
  rows: DayRow[];
  totals: DayTotalsView;
  sex: ChildSex | null;
}

/**
 * Значок рядом с цветом: тип сна не должен опознаваться одним лишь цветом —
 * иначе строки неразличимы при дальтонизме и на чёрно-белом скриншоте,
 * а Виктория как раз скринит дневник, объясняя что-то маме.
 */
function KindMark({ kind }: { kind: 'day' | 'night' }) {
  return kind === 'night' ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2Z"
        fill="currentColor"
      />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path
        d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface Draft {
  id: string | null;
  /** Сонные сутки, к которым относится сон. */
  day: string;
  start: string;
  end: string;
}

function shiftDay(date: string, days: number): string {
  const at = new Date(`${date}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «23 сентября». */
function dayLabel(date: string): string {
  return `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

/** «ночь с 23 на 24 сентября» — однозначно, какая это ночь. */
function nightLabel(date: string): string {
  const next = shiftDay(date, 1);
  return next.slice(5, 7) === date.slice(5, 7)
    ? `ночь с ${Number(date.slice(8))} на ${dayLabel(next)}`
    : `ночь с ${dayLabel(date)} на ${dayLabel(next)}`;
}

/**
 * Где на календаре окажется сон — так же, как его разложит сервер
 * (composeSleep): время до утренней границы — уже следующее число, конец
 * не позже начала — следующие сутки.
 */
function placeSleep(draft: Draft, dayBoundary: number) {
  const from = toMinutes(draft.start);
  const to = toMinutes(draft.end);
  if (from === null || to === null) return null;
  const startDate = from < dayBoundary ? shiftDay(draft.day, 1) : draft.day;
  const endDate = to <= from ? shiftDay(startDate, 1) : startDate;
  const nextMorning = shiftDay(draft.day, 1);
  const pad = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${pad(now.getHours() * 60 + now.getMinutes())}`;
  return {
    throughMorning: endDate > nextMorning || (endDate === nextMorning && to > dayBoundary),
    inFuture: `${endDate}T${pad(to)}` > local,
  };
}

/** «1 ч 30 мин» — длительность между двумя «14:00», через полночь тоже. */
function spanText(start: string, end: string): string | null {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return null;
  const minutes = (to - from + 1440) % 1440 || 1440;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} мин` : rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

export function DayView({
  sleepDay,
  today,
  dayBoundary,
  nightFrom,
  startAdding = false,
  title,
  prevDay,
  nextDay,
  rows,
  totals,
  sex,
}: Props) {
  const words = childWords(sex);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const blank = (): Draft => ({ id: null, day: sleepDay, start: '13:00', end: '14:30' });
  const [draft, setDraft] = useState<Draft | null>(startAdding ? blank : null);
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<void>, goTo?: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await job();
        setDraft(null);
        // Сон за другой день — показываем тот день, чтобы мама увидела запись.
        if (goTo) router.replace(`/day?d=${goTo}`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  const save = () => {
    if (!draft) return;
    run(
      async () => {
        const input = { sleepDay: draft.day, start: draft.start, end: draft.end };
        if (draft.id) unwrap(await updateSleep(draft.id, input));
        else unwrap(await addSleepManual(input));
      },
      draft.day !== sleepDay || startAdding ? draft.day : undefined,
    );
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <BackButton href="/" className={styles.back} label="Назад" />
        <div className={styles.nav}>
          <Link href={`/day?d=${prevDay}`} className={styles.step} aria-label="Предыдущий день">
            <IconBack />
          </Link>
          <span className={styles.title}>{title}</span>
          {nextDay ? (
            <Link href={`/day?d=${nextDay}`} className={styles.step} aria-label="Следующий день">
              <IconForward />
            </Link>
          ) : (
            <span className={`${styles.step} ${styles.stepOff}`} aria-hidden="true">
              <IconForward />
            </span>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        /*
          Четыре «0:00» подряд выглядели как поломка. Пустой день — не ошибка:
          говорим, что делать дальше, и для сегодняшнего дня, и для прошлого.
        */
        <section className={styles.emptyCard}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconMoon size={26} />
          </span>
          <h2 className={styles.emptyTitle}>
            {nextDay === null ? 'Сегодня записей пока нет' : 'В этот день записей нет'}
          </h2>
          <p className={styles.emptyText}>
            {nextDay === null
              ? 'Когда малыш уснёт, нажмите большую кнопку на главном экране — сон появится здесь сам. Забыли отметить? Добавьте его вручную.'
              : 'Если помните, как прошёл день, добавьте сны вручную — ориентиры по режиму станут точнее.'}
          </p>
        </section>
      ) : (
      <section className={styles.totals} aria-label="Итоги дня">
        <div>
          <span className={styles.totalValue}>{totals.totalSleep}</span>
          <span className={styles.totalLabel}>суточный</span>
        </div>
        <div>
          <span className={styles.totalValue}>{totals.daySleep}</span>
          <span className={styles.totalLabel}>дневной</span>
        </div>
        <div>
          <span className={styles.totalValue}>{totals.nightSleep}</span>
          <span className={styles.totalLabel}>ночной</span>
        </div>
        <div>
          <span className={styles.totalValue}>{totals.totalWake}</span>
          <span className={styles.totalLabel}>бодрствование</span>
        </div>
      </section>
      )}

      <ul className={styles.list}>

        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`${styles.row} ${row.kind === 'night' ? styles.night : styles.nap}`}
              onClick={() =>
                setDraft(
                  draft?.id === row.id
                    ? null
                    : { id: row.id, day: sleepDay, start: row.start, end: row.end ?? row.start },
                )
              }
            >
              <span className={styles.rowKind}>
                <KindMark kind={row.kind} />
                {row.kind === 'night' ? 'Ночной' : 'Дневной'}
              </span>
              <span className={styles.rowTime}>
                {row.start}
                {row.end ? `–${row.end}` : ' — идёт'}
              </span>
              <span className={styles.rowDuration}>{row.duration}</span>
            </button>

            {draft?.id === row.id && (
              <Editor
                words={words}
                window={{ dayBoundary, nightFrom }}
                draft={draft}
                pending={pending}
                onChange={setDraft}
                onSave={save}
                onCancel={() => setDraft(null)}
                onDelete={() => run(async () => unwrap(await deleteSleep(row.id)))}
              />
            )}
          </li>
        ))}
      </ul>

      {error && <p className={styles.error}>{error}</p>}

      {draft && draft.id === null ? (
        <Editor
          words={words}
          window={{ dayBoundary, nightFrom }}
          days={{ today }}
          draft={draft}
          pending={pending}
          onChange={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      ) : (
        <div className={styles.addRow}>
          <button
            type="button"
            className={styles.add}
            onClick={() => setDraft(blank())}
          >
            + Внести сон вручную
          </button>
        </div>
      )}
    </main>
  );
}

function Editor({
  words,
  window,
  days,
  draft,
  pending,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  words: ReturnType<typeof childWords>;
  window: { dayBoundary: number; nightFrom: number };
  /** Только для нового сна: выбор дня. У записанного сна день уже известен. */
  days?: { today: string };
  draft: Draft;
  pending: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const span = spanText(draft.start, draft.end);
  const placed = placeSleep(draft, window.dayBoundary);
  const startMinutes = toMinutes(draft.start);
  // То же правило, что на сервере (sleepKindOf): уснул «ночью» — или проспал
  // за утреннюю границу — значит, ночной.
  const night =
    startMinutes !== null &&
    ((window.nightFrom > window.dayBoundary
      ? startMinutes >= window.nightFrom || startMinutes < window.dayBoundary
      : startMinutes >= window.nightFrom && startMinutes < window.dayBoundary) ||
      (placed !== null && placed.throughMorning));
  // Мама вносит ночь, которая закончилась сегодня утром, а день стоит «Сегодня»:
  // такой сон оказался бы в будущем. Подсказываем и переносим одним нажатием.
  // Кнопку «это прошлая ночь» предлагаем только ночному сну, который во
  // вчерашних сутках уже закончился; дневной сон «в будущем» — просто ошибка времени.
  const yesterday = days ? shiftDay(days.today, -1) : null;
  const inFuture = placed?.inFuture ?? false;
  const lastNight =
    days && yesterday && inFuture && night && draft.day === days.today && !placeSleep({ ...draft, day: yesterday }, window.dayBoundary)?.inFuture
      ? yesterday
      : null;

  const quick = days
    ? [
        { label: 'Сегодня', value: days.today },
        { label: 'Вчера', value: shiftDay(days.today, -1) },
        { label: 'Позавчера', value: shiftDay(days.today, -2) },
      ]
    : [];
  const other = days && !quick.some((item) => item.value === draft.day);

  return (
    <div className={styles.editor}>
      {days && (
        <div className={styles.dayPick}>
          <span className={styles.pickLabel}>Когда был сон</span>
          <div className={styles.dayChips} role="group" aria-label="День">
            {quick.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={draft.day === item.value}
                className={`${styles.dayChip} ${draft.day === item.value ? styles.dayChipOn : ''}`}
                onClick={() => onChange({ ...draft, day: item.value })}
              >
                {item.label}
              </button>
            ))}
            {/*
              Другой день. Видимая часть — обычная кнопка с нашей подписью;
              системное поле даты лежит поверх неё прозрачным: нажатие
              открывает календарь телефона, но рисует его не iOS, а мы —
              иначе в Safari текст поля «съезжал» к верху подложки.
            */}
            <label className={`${styles.dayChip} ${styles.dayDate} ${other ? styles.dayChipOn : ''}`}>
              <IconCalendar size={18} />
              <span>{other ? dayLabel(draft.day) : 'Другой день'}</span>
              <input
                type="date"
                className={styles.dateOverlay}
                value={draft.day}
                max={days.today}
                aria-label="Другой день"
                onClick={(event) => {
                  // На компьютере Chrome открывает календарь только по значку — открываем сами.
                  try {
                    event.currentTarget.showPicker?.();
                  } catch {
                    /* браузер без showPicker — откроется сам */
                  }
                }}
                onChange={(event) => event.target.value && onChange({ ...draft, day: event.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      <div className={styles.times}>
        <label className={styles.timeField}>
          <span>{words.fellAsleep}</span>
          <input
            type="time"
            value={draft.start}
            onChange={(event) => onChange({ ...draft, start: event.target.value })}
          />
        </label>
        <label className={styles.timeField}>
          <span>{words.wokeUp}</span>
          <input
            type="time"
            value={draft.end}
            onChange={(event) => onChange({ ...draft, end: event.target.value })}
          />
        </label>
      </div>

      {span && placed && (
        <p className={styles.preview}>
          <KindMark kind={night ? 'night' : 'day'} />
          {night ? `Ночной сон, ${nightLabel(draft.day)}` : `Дневной сон, ${dayLabel(draft.day)}`} ·{' '}
          <b>{span}</b>
        </p>
      )}

      {inFuture && (
        <div className={styles.warn} role="status">
          {lastNight ? (
            <>
              <span>
                {words.wokeUp} в {draft.end} — это время сегодня ещё не наступило. Если это прошлая
                ночь, она относится к суткам {dayLabel(lastNight)}.
              </span>
              <button type="button" className={styles.warnButton} onClick={() => onChange({ ...draft, day: lastNight })}>
                Да, это {nightLabel(lastNight)}
              </button>
            </>
          ) : (
            <span>
              {words.wokeUp} в {draft.end} — это время ещё не наступило. Проверьте время или
              выберите другой день.
            </span>
          )}
        </div>
      )}

      <div className={styles.editorActions}>
        <button type="button" className={styles.save} onClick={onSave} disabled={pending}>
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={pending}>
          Отмена
        </button>
        {onDelete && (
          <button type="button" className={styles.danger} onClick={onDelete} disabled={pending}>
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}
