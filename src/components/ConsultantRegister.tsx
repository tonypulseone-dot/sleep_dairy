"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerConsultant } from "@/app/pro/profile/actions";
import { unwrap } from "@/lib/action-result";
import styles from "./Showcase.module.css";
export function ConsultantRegister() {
  const [error, setError] = useState(""),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <h1>Стать консультантом</h1>
        <Link className={styles.link} href="/pro/login">
          Уже есть аккаунт
        </Link>
      </div>
      <p className={styles.lead}>
        Создайте аккаунт и заполните анкету. Публикацию в витрине одобряет
        Виктория.
      </p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setError("");
          start(async () => {
            try {
              unwrap(
                await registerConsultant({
                  name: String(data.get("name")),
                  email: String(data.get("email")),
                  password: String(data.get("password")),
                }),
              );
              router.replace("/pro/profile");
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Не удалось зарегистрироваться",
              );
            }
          });
        }}
      >
        <label className={styles.field}>
          Имя
          <input name="name" autoComplete="name" required maxLength={100} />
        </label>
        <label className={styles.field}>
          Почта
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label className={styles.field}>
          Пароль
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
          <span className={styles.meta}>Не менее 10 символов</span>
        </label>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button className={styles.primary} disabled={pending}>
          {pending ? "Создаём аккаунт…" : "Создать аккаунт"}
        </button>
      </form>
    </main>
  );
}
