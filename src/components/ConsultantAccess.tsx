'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { grantAccess, revokeAccess } from '@/app/actions';
import styles from './ConsultantAccess.module.css';

export interface GrantView {
  id: string;
  consultantName: string;
  since: string;
}

/** Экран согласия: мама пришла по ссылке и решает, открывать ли дневник. */
export function ConnectPrompt({ slug, consultantName }: { slug: string; consultantName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const connect = () => {
    setError(null);
    startTransition(async () => {
      try {
        await grantAccess(slug);
        router.replace('/consultant');
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось открыть доступ');
      }
    });
  };

  return (
    <main className={styles.screen}>
      <h1>{consultantName} приглашает вести дневник</h1>
      <p className={styles.lead}>
        Вы отмечаете сны малыша, а {consultantName} видит их в своём кабинете — уже собранными
        в таблицу. Считать ничего не нужно.
      </p>

      <div className={styles.consent}>
        {/*
          Имя держим отдельной строкой, а не внутри фразы: в согласии оно должно
          стоять в именительном падеже, иначе на каждом втором имени получится
          «передать Виктория данные».
        */}
        <div className={styles.consentWho}>
          Консультант: <b>{consultantName}</b>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            Я согласна передать консультанту данные о сне и здоровье моего ребёнка на время
            консультации. Доступ можно отозвать в любой момент, дневник останется у меня.
          </span>
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="button" className={styles.primary} onClick={connect} disabled={!agreed || pending}>
        {pending ? 'Открываем…' : 'Открыть доступ'}
      </button>
      <Link href="/" className={styles.skip}>
        Пока не открывать
      </Link>
    </main>
  );
}

/** «Мой консультант»: кто видит дневник и кнопка закрыть доступ. */
export function ConsultantList({ grants }: { grants: GrantView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const revoke = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await revokeAccess(id);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось закрыть доступ');
      }
    });
  };

  return (
    <main className={styles.screen}>
      <header className={styles.head}>
        <Link href="/" className={styles.back} aria-label="Назад">
          ‹
        </Link>
        <h1>Мой консультант</h1>
      </header>

      {grants.length === 0 ? (
        <p className={styles.empty}>
          Дневник видите только вы. Если работаете с консультантом, откройте его ссылку — и
          доступ появится здесь.
        </p>
      ) : (
        <ul className={styles.list}>
          {grants.map((grant) => (
            <li key={grant.id} className={styles.item}>
              <div>
                <div className={styles.itemName}>{grant.consultantName}</div>
                <div className={styles.itemMeta}>видит дневник с {grant.since}</div>
              </div>
              <button
                type="button"
                className={styles.revoke}
                onClick={() => revoke(grant.id)}
                disabled={pending}
              >
                Закрыть доступ
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </main>
  );
}
