'use client';

import { unwrap } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { proLogin } from '@/app/pro/actions';
import styles from './Pro.module.css';

export function ProLogin() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await proLogin(email, password));
        router.replace('/pro');
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не получилось войти');
      }
    });
  };

  return (
    <main className={styles.loginScreen}>
      <form className={styles.loginForm} onSubmit={submit}>
        <h1>Кабинет консультанта</h1>
        <p className={styles.hint}>Дневники ваших клиенток — с любого устройства.</p>

        <label className={styles.field}>
          <span>Почта</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className={styles.field}>
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </main>
  );
}
