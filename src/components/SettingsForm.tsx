'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deleteEverything, setChildSex, setThemePref, updateDayWindow } from '@/app/actions';
import type { ChildSex } from '@/lib/words';
import { applyTheme } from '@/lib/telegram-client';
import { resolveTheme, type ThemePref } from '@/lib/theme';
import { parseTimeOfDay } from '@/lib/sleep-day';
import styles from './SettingsForm.module.css';
import { IconBack } from './Icons';

/** Зоны, в которых реально живут мамы. Своя подставится автоматически. */
const ZONES = [
  ['Europe/Kaliningrad', 'Калининград'],
  ['Europe/Moscow', 'Москва, Петербург'],
  ['Europe/Samara', 'Самара'],
  ['Asia/Yekaterinburg', 'Екатеринбург'],
  ['Asia/Omsk', 'Омск'],
  ['Asia/Krasnoyarsk', 'Красноярск'],
  ['Asia/Irkutsk', 'Иркутск'],
  ['Asia/Yakutsk', 'Якутск'],
  ['Asia/Vladivostok', 'Владивосток'],
  ['Asia/Magadan', 'Магадан'],
  ['Asia/Kamchatka', 'Камчатка'],
  ['Asia/Almaty', 'Алматы'],
  ['Asia/Tbilisi', 'Тбилиси'],
  ['Europe/Minsk', 'Минск'],
  ['Asia/Yerevan', 'Ереван'],
] as const;

const THEMES = [
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
  ['auto', 'По времени суток'],
] as const;

interface Props {
  dayBoundary: string;
  nightFrom: string;
  timeZone: string;
  themePref: 'auto' | 'light' | 'dark';
  childName: string;
  sex: ChildSex | null;
}

export function SettingsForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Удаление живёт в своём переходе: пока оно идёт, кнопка «Сохранить»
  // не должна мигать «Сохраняем…».
  const [removing, startRemoving] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [dayBoundary, setDayBoundary] = useState(props.dayBoundary);
  const [nightFrom, setNightFrom] = useState(props.nightFrom);
  const [timeZone, setTimeZone] = useState(props.timeZone);
  const [theme, setTheme] = useState(props.themePref);
  const [sex, setSex] = useState<ChildSex | null>(props.sex);

  const chooseSex = (value: ChildSex) => {
    setSex(value);
    startTransition(async () => {
      try {
        await setChildSex(value);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  const zones = ZONES.some(([value]) => value === timeZone)
    ? ZONES
    : ([[timeZone, timeZone], ...ZONES] as unknown as typeof ZONES);

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateDayWindow({ dayBoundary, nightFrom, timeZone });
        setSaved(true);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  // Тема применяется сразу по касанию, без кнопки «Сохранить»: её выбирают,
  // чтобы увидеть результат, а не чтобы заполнить форму.
  const chooseTheme = (pref: ThemePref) => {
    setTheme(pref);
    try {
      applyTheme(
        resolveTheme(pref, {
          dayBoundary: parseTimeOfDay(dayBoundary),
          nightFrom: parseTimeOfDay(nightFrom),
          timeZone,
        }),
      );
    } catch {
      // Время в полях недописано — тему покажет сервер после сохранения.
    }
    startTransition(async () => {
      try {
        await setThemePref(pref);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сменить тему');
      }
    });
  };

  const remove = () => {
    setRemoveError(null);
    startRemoving(async () => {
      try {
        await deleteEverything();
        // Не на главную: там приложение завело бы маму заново, и вышло бы,
        // будто удаление не сработало.
        router.replace('/deleted');
      } catch (cause) {
        setRemoveError(cause instanceof Error ? cause.message : 'Не получилось удалить');
      }
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <Link href="/" className={styles.back} aria-label="Назад">
          <IconBack />
        </Link>
        <h1>Настройки</h1>
      </header>

      <section className={styles.block}>
        <h2>Оформление</h2>
        <p className={styles.hint}>
          «По времени суток» — днём светлая, ночью тёмная, по границам ваших суток.
        </p>
        <div className={styles.chips}>
          {THEMES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => chooseTheme(value)}
              className={`${styles.chip} ${theme === value ? styles.chipOn : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <h2>{props.childName}</h2>
        <p className={styles.hint}>Чтобы писать «уснул» или «уснула».</p>
        <div className={styles.chips}>
          {(
            [
              ['girl', 'Девочка'],
              ['boy', 'Мальчик'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sex === value}
              onClick={() => chooseSex(value)}
              className={`${styles.chip} ${sex === value ? styles.chipOn : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <h2>Сутки</h2>
        <p className={styles.hint}>
          От этого зависит, к какому дню отнести ночной сон. Если уложились в 00:30, это ещё
          вчерашние сутки — и в дневнике так и будет.
        </p>

        <div className={styles.times}>
          <label className={styles.field}>
            <span>Утро начинается</span>
            <input type="time" value={dayBoundary} onChange={(e) => setDayBoundary(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Ночь начинается</span>
            <input type="time" value={nightFrom} onChange={(e) => setNightFrom(e.target.value)} />
          </label>
        </div>

        <label className={styles.field}>
          <span>Часовой пояс</span>
          <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
            {zones.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>


      <section className={styles.block}>
        <h2>Выгрузка</h2>
        <p className={styles.hint}>Таблица со снами за выбранный период — открывается в Excel.</p>
        <div className={styles.chips}>
          {[7, 14, 30].map((days) => (
            <a key={days} href={`/export?days=${days}`} className={styles.chip} download>
              за {days} дней
            </a>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <h2>Доступ к дневнику</h2>
        <p className={styles.hint}>Кто из консультантов видит ваши записи.</p>
        <Link href="/consultant" className={styles.link}>
          Мой консультант
        </Link>
      </section>

      {error && <p className={styles.error}>{error}</p>}
      {saved && !error && <p className={styles.saved}>Сохранено</p>}

      <button type="button" className={styles.submit} onClick={save} disabled={pending}>
        {pending ? 'Сохраняем…' : 'Сохранить'}
      </button>

      <section className={styles.block}>
        <h2>Данные</h2>
        <p className={styles.hint}>
          Что мы храним, кому показываем и как это удалить — написано в политике.
        </p>
        <Link href="/privacy" className={styles.link}>
          Политика конфиденциальности
        </Link>

        {/*
          Удаление в два шага. Первый — обычная неяркая кнопка: промахнуться
          мимо неё не страшно. Второй — то, что именно исчезнет, и предложение
          сначала выгрузить дневник: отменить это действие уже нельзя.
        */}
        {!confirming ? (
          <button type="button" className={styles.danger} onClick={() => setConfirming(true)}>
            Удалить дневник
          </button>
        ) : (
          <div className={styles.dangerBox}>
            <p className={styles.dangerText}>
              Исчезнут все записи о снах и кормлениях, данные малыша и доступ консультанта.
              Восстановить их будет нельзя.
            </p>
            <a href="/export?days=365" className={styles.link} download>
              Сначала скачать дневник таблицей
            </a>
            <button
              type="button"
              className={styles.danger}
              onClick={remove}
              disabled={removing}
            >
              {removing ? 'Удаляем…' : 'Да, удалить всё'}
            </button>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => setConfirming(false)}
              disabled={removing}
            >
              Отмена
            </button>
            {removeError && <p className={styles.error}>{removeError}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
