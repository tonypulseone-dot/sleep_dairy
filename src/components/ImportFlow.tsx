'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { acceptImportConsent, commitImport, type ImportResult } from '@/app/actions';
import { unwrap } from '@/lib/action-result';
import { haptic } from '@/lib/telegram-client';
import { childWords, type ChildSex } from '@/lib/words';
import { BackButton } from './BackButton';
import { IconCalendar, IconClose, IconEdit, IconMoon, IconSun } from './Icons';
import styles from './ImportFlow.module.css';

/**
 * Перенос снов из других приложений.
 *
 * 90% мам приходят со скриншотами своего трекера, остальные — с заметками.
 * Нейросеть переписывает время, мама проверяет список и только потом
 * нажимает «Добавить». Без её подтверждения в дневник не попадает ничего.
 */

const MAX_SHOTS = 20;

interface Row {
  id: number;
  date: string | null;
  start: string;
  end: string;
  include: boolean;
  edited: boolean;
  /** Время не сошлось с длительностью на скриншоте — пусть мама посмотрит. */
  doubtful: boolean;
  /** Длительность, написанная на скриншоте. */
  stated: number | null;
}

interface Recognized {
  date: string | null;
  sleeps: { date: string | null; start: string; end: string; doubtful: boolean; stated: number | null }[];
  timesVisible: boolean;
  screen: 'list' | 'stats' | 'chart' | 'other';
}

type Phase = 'pick' | 'working' | 'review' | 'done';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function dateLabel(date: string): string {
  const at = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[at.getUTCDay()]}, ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`;
}

function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function spanText(start: string, end: string): string {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return '';
  const minutes = (to - from + 1440) % 1440 || 1440;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Скриншот уменьшаем на телефоне: цифры читаются и на 1080 точках по ширине,
 * а загрузка в разы быстрее. HEIC с айфона браузер при выборе из галереи
 * сам отдаёт как JPEG; если не смог прочитать — отправляем как есть.
 */
async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1080 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (blob) return blob;
  } catch {
    /* отправим оригинал */
  }
  return file;
}

async function recognize(body: FormData): Promise<Recognized> {
  const response = await fetch('/api/import/recognize', { method: 'POST', body });
  const data = (await response.json().catch(() => null)) as (Recognized & { error?: string }) | null;
  if (!response.ok || !data) {
    const error = new Error(data?.error ?? 'Не получилось распознать — попробуйте ещё раз');
    // Лимит, отключённый сервис, закончившаяся сессия — дальше пробовать бессмысленно.
    (error as Error & { stop?: boolean }).stop = [401, 403, 429, 503].includes(response.status);
    throw error;
  }
  return data;
}

export function ImportFlow({
  consented: initiallyConsented,
  enabled,
  today,
  dayBoundary,
  nightFrom,
  sex,
}: {
  consented: boolean;
  enabled: boolean;
  today: string;
  dayBoundary: number;
  nightFrom: number;
  sex: ChildSex | null;
}) {
  const words = childWords(sex);
  const [consented, setConsented] = useState(initiallyConsented);
  const [agree, setAgree] = useState(false);
  const [mode, setMode] = useState<'shots' | 'text'>('shots');
  const [phase, setPhase] = useState<Phase>('pick');
  const [text, setText] = useState('');
  const [shots, setShots] = useState<string[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [skippedRows, setSkippedRows] = useState<{ row: Row; reason: string }[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const recognizedCount = useRef(0);
  const nextId = useRef(1);

  // Миниатюры живут, пока открыт экран, — потом освобождаем память.
  useEffect(() => () => shots.forEach((url) => URL.revokeObjectURL(url)), [shots]);

  const isNight = (row: Row) => {
    const from = toMinutes(row.start);
    const to = toMinutes(row.end);
    if (from === null || to === null) return false;
    const byStart = nightFrom > dayBoundary ? from >= nightFrom || from < dayBoundary : from >= nightFrom && from < dayBoundary;
    // Перешёл через полночь и проснулся после утренней границы — тоже ночь.
    return byStart || (to <= from && to > dayBoundary);
  };

  const addRecognized = (found: Recognized, fallbackDate: string | null) => {
    const fresh = found.sleeps.map((sleep) => ({
      id: nextId.current++,
      date: sleep.date ?? found.date ?? fallbackDate,
      start: sleep.start,
      end: sleep.end,
      include: true,
      edited: false,
      doubtful: sleep.doubtful,
      stated: sleep.stated,
    }));
    recognizedCount.current += fresh.length;
    setRows((current) => {
      const seen = new Set(current.map((row) => `${row.date}|${row.start}|${row.end}`));
      return [...current, ...fresh.filter((row) => !seen.has(`${row.date}|${row.start}|${row.end}`))];
    });
    return fresh.length;
  };

  const runShots = async (files: File[]) => {
    const list = files.slice(0, MAX_SHOTS);
    setError(null);
    setNotes(files.length > MAX_SHOTS ? [`Взяли первые ${MAX_SHOTS} скриншотов — остальные перенесите следующим заходом.`] : []);
    setShots(list.map((file) => URL.createObjectURL(file)));
    setPhase('working');
    setProgress({ done: 0, total: list.length });

    for (const [index, file] of list.entries()) {
      try {
        const body = new FormData();
        const image = await prepareImage(file);
        body.append('image', image, 'screenshot.jpg');
        const found = await recognize(body);
        const count = addRecognized(found, null);
        if (count === 0) {
          const number = `Скриншот ${index + 1}`;
          setNotes((current) => [
            ...current,
            found.screen === 'stats'
              ? `${number} — это статистика с итогами за дни: в ней нет времени каждого сна. Откройте в приложении ленту снов за день.`
              : found.screen === 'chart'
                ? `${number} — это график: по полоскам время сна не прочитать. Нажмите в приложении на день (например, «Вчера ›») — откроется список снов со временем, его и сфотографируйте.`
                : !found.timesVisible
                ? `${number}: не видно времени снов — нужна лента за день, где написано «11:07», «11:43».`
                : `${number}: снов не нашлось.`,
          ]);
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Не получилось распознать';
        setNotes((current) => [...current, `Скриншот ${index + 1}: ${message}`]);
        if ((cause as { stop?: boolean }).stop) break;
      }
      setProgress({ done: index + 1, total: list.length });
    }
    setPhase('review');
  };

  const runText = async () => {
    if (!text.trim()) return;
    setError(null);
    setNotes([]);
    setShots([]);
    setPhase('working');
    setProgress({ done: 0, total: 1 });
    try {
      const body = new FormData();
      body.append('text', text);
      const found = await recognize(body);
      if (addRecognized(found, null) === 0) setNotes(['В тексте не нашлось снов с временем начала и конца.']);
    } catch (cause) {
      setNotes([cause instanceof Error ? cause.message : 'Не получилось распознать']);
    }
    setProgress({ done: 1, total: 1 });
    setPhase('review');
  };

  const update = (id: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, ...patch, edited: true, doubtful: 'start' in patch || 'end' in patch ? false : row.doubtful } : row,
      ),
    );

  const moveGroup = (from: string | null, to: string) =>
    setRows((current) => current.map((row) => (row.date === from ? { ...row, date: to, edited: row.edited || from !== null } : row)));

  // Группы по дням, свежие снизу — как листают дневник. Без даты — первыми: их надо дозаполнить.
  const groups = useMemo(() => {
    const map = new Map<string | null, Row[]>();
    for (const row of [...rows].sort((a, b) => `${a.date ?? ''}${a.start}`.localeCompare(`${b.date ?? ''}${b.start}`))) {
      map.set(row.date, [...(map.get(row.date) ?? []), row]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));
  }, [rows]);

  const ready = rows.filter((row) => row.include && row.date && toMinutes(row.start) !== null && toMinutes(row.end) !== null);
  const undated = rows.some((row) => row.include && !row.date);

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = unwrap(
          await commitImport({
            rows: ready.map((row) => ({ date: row.date as string, start: row.start, end: row.end })),
            screenshots: shots.length,
            recognized: recognizedCount.current,
            edited: rows.filter((row) => row.edited || !row.include).length,
          }),
        );
        setSkippedRows(outcome.skipped.map((item) => ({ row: ready[item.index], reason: item.reason })));
        setResult(outcome);
        setPhase('done');
        haptic(outcome.added > 0 ? 'success' : 'error');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  const restart = () => {
    setRows([]);
    setNotes([]);
    setShots([]);
    setResult(null);
    setSkippedRows([]);
    setText('');
    recognizedCount.current = 0;
    setPhase('pick');
  };

  const header = (
    <header className={styles.head}>
      <BackButton href="/" className={styles.back} label="Назад" />
      <h1>Перенести сны</h1>
    </header>
  );

  if (!enabled) {
    return (
      <main className={styles.screen}>
        {header}
        <p className={styles.card}>
          Перенос из других приложений скоро появится. Пока сны можно внести вручную — кнопка
          «Внести сон вручную» на главном экране.
        </p>
      </main>
    );
  }

  if (!consented) {
    return (
      <main className={styles.screen}>
        {header}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Как это работает</h2>
          <ol className={styles.steps}>
            <li>Вы прикрепляете скриншоты из своего приложения для сна или вставляете текст из заметок.</li>
            <li>Нейросеть GigaChat переписывает с них время снов.</li>
            <li>Вы проверяете список и сами решаете, что добавить в дневник.</li>
          </ol>
          <p className={styles.privacy}>
            Для распознавания скриншоты и текст передаются в сервис GigaChat (ПАО Сбербанк),
            серверы в России. Там они не сохраняются: удаляем сразу после распознавания. Подробнее —
            в <Link href="/privacy">политике конфиденциальности</Link>.
          </p>
          <label className={styles.agree}>
            <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            <span>Согласна на передачу скриншотов и заметок для распознавания</span>
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="button"
            className={styles.primary}
            disabled={!agree || pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  unwrap(await acceptImportConsent());
                  setConsented(true);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
                }
              })
            }
          >
            Продолжить
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      {header}

      {phase === 'pick' && (
        <>
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'shots'} className={`${styles.tab} ${mode === 'shots' ? styles.tabOn : ''}`} onClick={() => setMode('shots')}>
              Скриншоты
            </button>
            <button type="button" role="tab" aria-selected={mode === 'text'} className={`${styles.tab} ${mode === 'text' ? styles.tabOn : ''}`} onClick={() => setMode('text')}>
              Текст из заметок
            </button>
          </div>

          {mode === 'shots' ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Какой скриншот подойдёт</h2>
              <ul className={styles.tips}>
                <li className={styles.good}>
                  Лента снов за день, где видно время: <b>«11:07»</b> и <b>«11:43»</b> у каждого сна, или «13:05–14:20».
                </li>
                <li className={styles.good}>
                  По скриншоту на день. Лента длинная — сделайте два, повторы уберём сами.
                </li>
                <li className={styles.bad}>
                  Статистика с итогами за дни и графики-полоски без цифр — в них нет времени каждого сна.
                  Нажмите в приложении на нужный день — откроется список со временем.
                </li>
                <li className={styles.good}>До {MAX_SHOTS} скриншотов за раз.</li>
              </ul>
              <label className={styles.upload}>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    event.target.value = '';
                    if (files.length) void runShots(files);
                  }}
                />
                <span className={styles.uploadTitle}>Выбрать скриншоты</span>
                <span className={styles.uploadSub}>из галереи телефона</span>
              </label>
            </section>
          ) : (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Вставьте заметки</h2>
              <p className={styles.hint}>
                Как угодно: по дням, списком, сообщениями. Главное — чтобы было видно, когда {words.fellAsleep.toLowerCase()} и
                когда {words.wokeUp.toLowerCase()}.
              </p>
              <textarea
                className={styles.textarea}
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={7}
                maxLength={6000}
                placeholder={'Например:\n23.09 — днём 9:30–10:45, 13:00–14:30\nночь 20:15–6:40'}
                aria-label="Заметки о снах"
              />
              <button type="button" className={styles.primary} disabled={!text.trim()} onClick={() => void runText()}>
                Распознать
              </button>
            </section>
          )}
        </>
      )}

      {phase === 'working' && (
        <section className={styles.card} aria-live="polite">
          <div className={styles.spinner} aria-hidden="true" />
          <h2 className={styles.cardTitle}>
            {progress.total > 1 ? `Распознаём ${Math.min(progress.done + 1, progress.total)} из ${progress.total}` : 'Распознаём…'}
          </h2>
          <p className={styles.hint}>Обычно 5–15 секунд на скриншот. Не закрывайте приложение.</p>
          <div className={styles.bar}>
            <i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </section>
      )}

      {phase === 'review' && (
        <>
          {shots.length > 0 && (
            <div className={styles.thumbs} aria-label="Ваши скриншоты — нажмите, чтобы сверить">
              {shots.map((url, index) => (
                <button key={url} type="button" className={styles.thumb} onClick={() => setZoom(url)} aria-label={`Открыть скриншот ${index + 1}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          )}

          {notes.length > 0 && (
            <ul className={styles.notes}>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}

          {rows.length === 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Снов не нашлось</h2>
              <p className={styles.hint}>
                Попробуйте другой скриншот — список снов с временем — или внесите сны вручную.
              </p>
              <button type="button" className={styles.primary} onClick={restart}>
                Попробовать ещё раз
              </button>
            </section>
          ) : (
            <>
              <p className={styles.found}>
                Нашли <b>{rows.length}</b> {rows.length === 1 ? 'сон' : rows.length < 5 ? 'сна' : 'снов'}. Проверьте время —
                его можно поправить, а лишнее снять галочкой.
              </p>

              {groups.map(([date, list]) => (
                <section key={date ?? 'none'} className={`${styles.group} ${date ? '' : styles.groupWarn}`}>
                  <label className={styles.groupDate}>
                    <IconCalendar size={17} />
                    <span>{date ? dateLabel(date) : 'Дата не распознана — выберите'}</span>
                    <input
                      type="date"
                      className={styles.dateOverlay}
                      value={date ?? ''}
                      max={today}
                      aria-label="Дата этих снов"
                      onClick={(event) => {
                        try {
                          event.currentTarget.showPicker?.();
                        } catch {
                          /* откроется сам */
                        }
                      }}
                      onChange={(event) => event.target.value && moveGroup(date, event.target.value)}
                    />
                  </label>
                  <ul className={styles.rows}>
                    {list.map((row) => (
                      <li key={row.id} className={`${styles.row} ${row.include ? '' : styles.rowOff} ${row.doubtful ? styles.rowDoubt : ''}`}>
                        <label className={styles.check}>
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(event) => update(row.id, { include: event.target.checked })}
                            aria-label={`Добавить сон ${row.start}–${row.end}`}
                          />
                        </label>
                        <span className={isNight(row) ? styles.kindNight : styles.kindDay} aria-label={isNight(row) ? 'ночной' : 'дневной'}>
                          {isNight(row) ? <IconMoon size={16} /> : <IconSun size={16} />}
                        </span>
                        {/* Время — нашим текстом и всегда в 24 часах: узкое системное
                            поле в 12-часовом формате обрезало AM/PM. */}
                        <span className={styles.span}>
                          {row.start}–{row.end}
                        </span>
                        <span className={styles.duration}>{spanText(row.start, row.end)}</span>
                        <button
                          type="button"
                          className={styles.edit}
                          aria-expanded={editing === row.id}
                          aria-label={`Изменить время ${row.start}–${row.end}`}
                          onClick={() => setEditing(editing === row.id ? null : row.id)}
                        >
                          <IconEdit size={18} />
                        </button>
                        {row.doubtful && editing !== row.id && (
                          <p className={styles.doubt}>
                            {row.stated
                              ? `На скриншоте сон длится ${Math.floor(row.stated / 60)}:${String(row.stated % 60).padStart(2, '0')}, а по времени — ${spanText(row.start, row.end)}. Сверьте время`
                              : 'Время не сходится с длительностью на скриншоте — сверьте'}
                          </p>
                        )}
                        {editing === row.id && (
                          <div className={styles.editor}>
                            <label className={styles.timeField}>
                              <span>{words.fellAsleep}</span>
                              <input type="time" value={row.start} onChange={(event) => update(row.id, { start: event.target.value })} />
                            </label>
                            <label className={styles.timeField}>
                              <span>{words.wokeUp}</span>
                              <input type="time" value={row.end} onChange={(event) => update(row.id, { end: event.target.value })} />
                            </label>
                            <button type="button" className={styles.done} onClick={() => setEditing(null)}>
                              Готово
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.footer}>
                <button type="button" className={styles.primary} disabled={pending || ready.length === 0} onClick={save}>
                  {pending ? 'Добавляем…' : `Добавить в дневник: ${ready.length}`}
                </button>
                <button type="button" className={styles.ghost} onClick={restart} disabled={pending}>
                  Заново
                </button>
              </div>
              {undated && <p className={styles.hint}>Сны без даты не добавятся — выберите для них день.</p>}
            </>
          )}
        </>
      )}

      {phase === 'done' && result && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            {result.added > 0
              ? `Добавили ${result.added} ${result.added === 1 ? 'сон' : result.added < 5 ? 'сна' : 'снов'}`
              : 'Ничего не добавили'}
          </h2>
          {skippedRows.length > 0 && (
            <>
              <p className={styles.hint}>Эти сны пропустили:</p>
              <ul className={styles.skipped}>
                {skippedRows.map(({ row, reason }) => (
                  <li key={row.id}>
                    <b>
                      {row.date ? dateLabel(row.date) : 'без даты'}, {row.start}–{row.end}
                    </b>{' '}
                    — {reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={styles.footer}>
            {result.lastDay && (
              <Link href={`/day?d=${result.lastDay}`} className={styles.primary}>
                Открыть дневник
              </Link>
            )}
            <button type="button" className={styles.ghost} onClick={restart}>
              Перенести ещё
            </button>
          </div>
        </section>
      )}

      {zoom && (
        <div className={styles.zoom} role="dialog" aria-label="Скриншот">
          <button type="button" className={styles.zoomClose} onClick={() => setZoom(null)} aria-label="Закрыть">
            <IconClose />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Ваш скриншот" />
        </div>
      )}
    </main>
  );
}
