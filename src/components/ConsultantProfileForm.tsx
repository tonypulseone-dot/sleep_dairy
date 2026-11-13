"use client";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/app/pro/profile/actions";
import { unwrap } from "@/lib/action-result";
import {
  SERVICE_TYPES,
  type ConsultantProfile,
  type ServiceKind,
} from "@/lib/showcase";
import styles from "./Showcase.module.css";
const labels: Record<string, string> = {
  draft: "Черновик",
  pending: "Анкета на проверке у Виктории",
  published: "Анкета одобрена",
  rejected: "Нужны изменения",
};
export function ConsultantProfileForm({
  initial,
  revision: initialRevision,
  status,
  note,
  published,
}: {
  initial: ConsultantProfile;
  revision: number;
  status: string;
  note: string | null;
  published: boolean;
}) {
  const [profile, setProfile] = useState(initial),
    [revision, setRevision] = useState(initialRevision),
    [pending, start] = useTransition(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [uploading, setUploading] = useState(false);
  const router = useRouter();
  const change = <K extends keyof ConsultantProfile>(
    key: K,
    value: ConsultantProfile[K],
  ) => setProfile((p) => ({ ...p, [key]: value }));
  async function photo(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      if (file.size > 12 * 1024 * 1024)
        throw new Error("Выберите фото размером до 12 МБ");
      if (!/^image\/(jpeg|png|webp)$/.test(file.type))
        throw new Error("Выберите JPEG, PNG или WebP");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Не получилось обработать фото");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const jpeg = canvas.toDataURL("image/jpeg", 0.8);
      if (jpeg.length > 450000)
        throw new Error("Выберите фотографию меньшего размера");
      change("photoUrl", jpeg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось загрузить фото");
    } finally {
      setUploading(false);
    }
  }
  function save(submit: boolean) {
    setError("");
    setMessage("");
    start(async () => {
      try {
        const result = unwrap(await saveProfile(profile, submit, revision));
        setRevision(result.revision);
        setMessage(
          submit
            ? "Анкета отправлена Виктории на проверку"
            : "Черновик сохранён",
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось сохранить");
      }
    });
  }
  return (
    <>
      <div className={styles.status}>
        {labels[status]}
        {published && (
          <p className={styles.meta}>
            В витрине видна одобренная версия. Новые изменения появятся после
            проверки.
          </p>
        )}
        {note && <p>{note}</p>}
      </div>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          save(true);
        }}
      >
        <label className={styles.field}>
          Имя
          <input
            value={profile.name}
            maxLength={100}
            required
            onChange={(e) => change("name", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Фотография
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending || uploading}
            onChange={(e) => photo(e.target.files?.[0])}
          />
        </label>
        
        {profile.photoUrl && (
          <Image unoptimized
            src={profile.photoUrl}
            alt="Предпросмотр фотографии"
            width={100}
            height={100}
            className={styles.photo}
          />
        )}
        <label className={styles.field}>
          Опыт работы, лет
          <input
            type="number"
            min={0}
            max={70}
            required
            value={profile.experienceYears}
            onChange={(e) => change("experienceYears", Number(e.target.value))}
          />
        </label>
        <label className={styles.field}>
          О себе и своём подходе
          <textarea
            aria-label="О себе и своём подходе"
            maxLength={4000}
            required
            value={profile.approach}
            onChange={(e) => change("approach", e.target.value)}
            placeholder="Расскажите о принципах работы, методиках и ценностях"
          />
        </label>
        <label className={styles.field}>
          Telegram для связи
          <input
            required
            value={profile.contactUrl}
            maxLength={100}
            onChange={(e) => change("contactUrl", e.target.value)}
            placeholder="@username"
          />
        </label>
        <div>
          <h2>Услуги и цены</h2>
          {profile.services.map((s, i) => (
            <div className={styles.serviceEdit} key={i}>
              <label className={styles.field}>
                Вид услуги
                <select
                  aria-label="Вид услуги"
                  value={s.kind}
                  onChange={(e) =>
                    change(
                      "services",
                      profile.services.map((x, j) =>
                        j === i
                          ? { ...x, kind: e.target.value as ServiceKind }
                          : x,
                      ),
                    )
                  }
                >
                  {Object.entries(SERVICE_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Название
                <input
                  value={s.title}
                  maxLength={120}
                  placeholder="Например, 2 недели"
                  onChange={(e) =>
                    change(
                      "services",
                      profile.services.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className={styles.field}>
                Цена, ₽
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  required
                  value={s.price}
                  onChange={(e) =>
                    change(
                      "services",
                      profile.services.map((x, j) =>
                        j === i ? { ...x, price: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className={styles.secondary}
                aria-label={`Удалить услугу ${i + 1}`}
                onClick={() =>
                  change(
                    "services",
                    profile.services.filter((_, j) => j !== i),
                  )
                }
              >
                Удалить
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.secondary}
            disabled={profile.services.length >= 12}
            onClick={() =>
              change("services", [
                ...profile.services,
                { kind: "consultation", title: "", price: 0 },
              ])
            }
          >
            Добавить услугу
          </button>
        </div>
        <p className={styles.meta}>
          Виктория проверяет подход каждого специалиста и решает, подходит ли
          анкета для витрины.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={pending || uploading}
            onClick={() => save(false)}
          >
            Сохранить черновик
          </button>
          <button
            type="submit"
            className={styles.primary}
            disabled={pending || uploading}
          >
            {pending
              ? "Сохраняем…"
              : uploading
                ? "Обрабатываем фото…"
                : "Отправить на проверку"}
          </button>
        </div>
      </form>
    </>
  );
}
