import Image from "next/image";
import { SERVICE_TYPES, type ConsultantProfile } from "@/lib/showcase";
import styles from "./Showcase.module.css";
export function ConsultantCard({
  profile,
  contact = true,
  children,
}: {
  profile: ConsultantProfile;
  contact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.identity}>
        {/* Uploaded and resized JPEG, kept in the database with the approved profile. */}
        
        {profile.photoUrl && (
          <Image unoptimized
            src={profile.photoUrl}
            alt={`Фото: ${profile.name}`}
            className={styles.photo}
            width={80}
            height={80}
          />
        )}
        <div>
          <h2>{profile.name}</h2>
          <p className={styles.meta}>
            Опыт работы: {profile.experienceYears} лет
          </p>
        </div>
      </div>
      <p className={styles.approach}>{profile.approach}</p>
      <ul className={styles.services}>
        {profile.services.map((s, i) => (
          <li key={i}>
            <span>
              {s.title || SERVICE_TYPES[s.kind]}
              <small className={styles.meta} style={{ display: "block" }}>
                {s.title ? SERVICE_TYPES[s.kind] : ""}
              </small>
            </span>
            <strong>{s.price.toLocaleString("ru-RU")} ₽</strong>
          </li>
        ))}
      </ul>
      {contact && profile.contactUrl && (
        <a
          className={styles.primary}
          href={profile.contactUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Написать в Telegram
        </a>
      )}
      {children}
    </article>
  );
}
