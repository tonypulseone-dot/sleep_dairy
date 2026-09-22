'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createChild } from '@/app/actions';
import styles from './Onboarding.module.css';

/**
 * Темперамент вынесен из обязательных вопросов по просьбе Виктории:
 * «80% приходят мамы малышей 1–4 месяцев, там ещё непонятно ничего».
 * Оставляем как необязательный блок с её же формулировкой про пропуск.
 */
const TEMPERAMENT = [
  'Спокойный, легко успокаивается',
  'Легко возбудимый',
  'Чувствительный к шуму и свету',
  'Долго засыпает',
  'Активный, много двигается',
  'Плохо переносит смену обстановки',
];

const FEEDING = [
  { value: 'breast', label: 'Грудное' },
  { value: 'formula', label: 'Искусственное' },
  { value: 'mixed', label: 'Смешанное' },
] as const;

export function Onboarding() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showMore, setShowMore] = useState(false);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isPreterm, setIsPreterm] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [healthNotes, setHealthNotes] = useState('');
  const [temperament, setTemperament] = useState<string[]>([]);
  const [feedingType, setFeedingType] = useState<'breast' | 'formula' | 'mixed'>('breast');

  const toggle = (value: string) =>
    setTemperament((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createChild({ name, birthDate, dueDate, isPreterm, healthNotes, temperament, feedingType });
        router.replace('/');
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.intro}>
        <h1>Добро пожаловать в сонное царство</h1>
        <p>Несколько вопросов о малыше — и можно вести дневник. Всё это потом можно изменить.</p>
      </header>

      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span className={styles.label}>Как зовут малыша</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Дата рождения</span>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
        </label>

        <label className={styles.checkbox}>
          <input type="checkbox" checked={isPreterm} onChange={(e) => setIsPreterm(e.target.checked)} />
          <span>Родился раньше срока</span>
        </label>

        {isPreterm && (
          <label className={styles.field}>
            <span className={styles.label}>Предполагаемая дата родов</span>
            <span className={styles.hint}>Нужна, чтобы считать скорректированный возраст</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
        )}

        <fieldset className={styles.field}>
          <legend className={styles.label}>Вскармливание</legend>
          <span className={styles.hint}>От этого зависит, показывать ли дневник кормления</span>
          <div className={styles.chips}>
            {FEEDING.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={feedingType === option.value}
                onClick={() => setFeedingType(option.value)}
                className={`${styles.chip} ${feedingType === option.value ? styles.chipOn : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {showMore ? (
          <>
            <fieldset className={styles.field}>
              <legend className={styles.label}>Что ближе к малышу</legend>
              <span className={styles.hint}>
                Можно пропустить, если малышу ещё нет четырёх месяцев — в этом возрасте характер
                сна только складывается.
              </span>
              <div className={styles.chips}>
                {TEMPERAMENT.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={temperament.includes(option)}
                    onClick={() => toggle(option)}
                    className={`${styles.chip} ${temperament.includes(option) ? styles.chipOn : ''}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className={styles.field}>
              <span className={styles.label}>Особенности здоровья</span>
              <span className={styles.hint}>
                Например, анемия или колики — это меняет тактику работы со сном
              </span>
              <textarea
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </label>
          </>
        ) : (
          <button type="button" className={styles.more} onClick={() => setShowMore(true)}>
            Рассказать о малыше подробнее
            <span>темперамент и особенности здоровья — необязательно</span>
          </button>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? 'Сохраняем…' : 'Начать дневник'}
        </button>
      </form>
    </main>
  );
}
