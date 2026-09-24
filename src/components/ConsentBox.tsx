'use client';

import Link from 'next/link';
import styles from './ConsentBox.module.css';

/**
 * Согласие открыть дневник консультанту — один текст для анкеты и для
 * экрана приглашения. Версия текста — CONSENT_VERSION в lib/consent.ts:
 * меняется текст — меняется и она.
 *
 * Имя держим отдельной строкой, а не внутри фразы: в согласии оно должно
 * стоять в именительном падеже, иначе на каждом втором имени получится
 * «передать Виктория данные».
 */
export function ConsentBox({
  consultantName,
  agreed,
  onChange,
}: {
  consultantName: string;
  agreed: boolean;
  onChange: (agreed: boolean) => void;
}) {
  return (
    <div className={styles.consent}>
      <div className={styles.who}>
        Ваш консультант: <b>{consultantName}</b>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={agreed} onChange={(e) => onChange(e.target.checked)} />
        <span>
          Я согласна открыть консультанту дневник сна и данные о здоровье моего ребёнка —
          на условиях{' '}
          {/* Ссылка внутри подписи к галочке: клик по ней не должен её переключать. */}
          <Link href="/privacy" className={styles.policy} onClick={(e) => e.stopPropagation()}>
            политики конфиденциальности
          </Link>
          . Доступ можно закрыть в настройках, дневник останется у меня.
        </span>
      </label>
    </div>
  );
}
