'use client';

import { unwrap } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createChild } from '@/app/actions';
import { childWords, type ChildSex } from '@/lib/words';
import { ConsentBox } from './ConsentBox';
import { Moon } from './Moon';
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

const SEX = [
  { value: 'girl', label: 'Девочка' },
  { value: 'boy', label: 'Мальчик' },
] as const;

const FEEDING = [
  { value: 'breast', label: 'Грудное' },
  { value: 'formula', label: 'Искусственное' },
  { value: 'mixed', label: 'Смешанное' },
] as const;

export function Onboarding({ consultantName }: { consultantName: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Сначала приветствие, потом вопросы: Виктория описывала это именно так —
  // «включаете приложение, что-то красивое высвечивается, потом идут вопросы».
  const [step, setStep] = useState<'welcome' | 'form'>('welcome');
  const [showMore, setShowMore] = useState(false);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<ChildSex | null>(null);
  const [consent, setConsent] = useState(false);
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
    if (!sex) {
      setError('Выберите, мальчик или девочка');
      return;
    }
    if (consultantName && !consent) {
      setError(`Отметьте согласие — без него ${consultantName} не увидит дневник`);
      return;
    }
    startTransition(async () => {
      try {
        unwrap(await createChild({ name, sex, consent, birthDate, dueDate, isPreterm, healthNotes, temperament, feedingType }));
        router.replace('/');
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось сохранить');
      }
    });
  };

  if (step === 'welcome') {
    return (
      <main className={styles.welcome}>
        <Moon />
        <h1 className={styles.welcomeTitle}>Добро пожаловать в сонное царство</h1>
        <p className={styles.welcomeText}>
          Здесь вы отмечаете сны малыша одной кнопкой. Ничего считать не нужно —
          и ничего страшного, если какой-то сон вы пропустите.
        </p>
        <button type="button" className={styles.submit} onClick={() => setStep('form')}>
          Начать
        </button>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <header className={styles.intro}>
        <h1>Расскажите о малыше</h1>
        <p>Несколько коротких вопросов — и можно вести дневник. Всё это потом можно изменить.</p>
      </header>

      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>
          <span className={styles.label}>Как зовут малыша</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </label>

        {/* Только для грамматики: «уснул» или «уснула» на главной кнопке. */}
        <fieldset className={styles.field}>
          <legend className={styles.label}>Мальчик или девочка</legend>
          <div className={styles.chips}>
            {SEX.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sex === option.value}
                onClick={() => setSex(option.value)}
                className={`${styles.chip} ${sex === option.value ? styles.chipOn : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className={styles.field}>
          <span className={styles.label}>Дата рождения</span>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
        </label>

        <label className={styles.checkbox}>
          <input type="checkbox" checked={isPreterm} onChange={(e) => setIsPreterm(e.target.checked)} />
          <span>{childWords(sex).born} раньше срока</span>
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

        {/*
          Приложение — для клиенток консультанта, поэтому доступ ему оформляется
          сразу при регистрации. Но только с явным согласием: это данные о здоровье.
        */}
        {consultantName && (
          <ConsentBox consultantName={consultantName} agreed={consent} onChange={setConsent} />
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? 'Сохраняем…' : 'Начать дневник'}
        </button>

        {/*
          Про здоровье малыша мы спрашиваем прямо здесь, поэтому и ссылка на
          политику стоит здесь же, а не прячется в настройках.
        */}
        {!consultantName && (
        <p className={styles.policyNote}>
          Начиная дневник, вы соглашаетесь с{' '}
          <Link href="/privacy">политикой конфиденциальности</Link> — что мы храним, кому
          показываем и как всё удалить.
        </p>
        )}
      </form>
    </main>
  );
}
