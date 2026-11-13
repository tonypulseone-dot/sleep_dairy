import { UserError } from "./action-result";
export const SERVICE_TYPES = {
  consultation: "Консультация",
  support: "Сопровождение",
  analysis: "Разбор дневника",
} as const;
export type ServiceKind = keyof typeof SERVICE_TYPES;
export interface ConsultantProfile {
  name: string;
  approach: string;
  experienceYears: number;
  photoUrl: string;
  contactUrl: string;
  services: { kind: ServiceKind; title: string; price: number }[];
}
export function telegramContact(value: string): string {
  const match =
    /^(?:@|https:\/\/t\.me\/)?([a-zA-Z][a-zA-Z0-9_]{4,31})\/?$/.exec(
      value.trim(),
    );
  if (!match)
    throw new UserError(
      "Укажите Telegram: @username или https://t.me/username",
    );
  return `https://t.me/${match[1]}`;
}
export function validateProfile(
  raw: unknown,
  submitting: boolean,
): ConsultantProfile {
  if (!raw || typeof raw !== "object") throw new UserError("Заполните анкету");
  const p = raw as Record<string, unknown>;
  const str = (key: string, max: number) => {
    const v = p[key];
    if (typeof v !== "string" || v.length > max)
      throw new UserError(`Проверьте поле ${key}`);
    return v.trim();
  };
  const name = str("name", 100),
    approach = str("approach", 4000),
    photoUrl = str("photoUrl", 450000),
    contact = str("contactUrl", 100);
  const experienceYears = p.experienceYears;
  if (
    typeof experienceYears !== "number" ||
    !Number.isInteger(experienceYears) ||
    experienceYears < 0 ||
    experienceYears > 70
  )
    throw new UserError("Опыт работы: от 0 до 70 лет");
  if (
    photoUrl &&
    !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photoUrl)
  )
    throw new UserError("Загрузите фотографию заново");
  const contactUrl = contact ? telegramContact(contact) : "";
  if (!Array.isArray(p.services) || p.services.length > 12)
    throw new UserError("Можно добавить до 12 услуг");
  const services = p.services.map((s: unknown) => {
    if (!s || typeof s !== "object") throw new UserError("Проверьте услуги");
    const v = s as Record<string, unknown>;
    if (
      typeof v.kind !== "string" ||
      !Object.hasOwn(SERVICE_TYPES, v.kind) ||
      typeof v.title !== "string" ||
      v.title.length > 120 ||
      typeof v.price !== "number" ||
      !Number.isInteger(v.price) ||
      v.price < 0 ||
      v.price > 1000000
    )
      throw new UserError("Укажите вид услуги и цену от 0 до 1 000 000 ₽");
    return {
      kind: v.kind as ServiceKind,
      title: v.title.trim(),
      price: v.price,
    };
  });
  if (
    submitting &&
    (!name || !approach || !photoUrl || !contactUrl || !services.length)
  )
    throw new UserError(
      "Для отправки заполните имя, подход, фото, Telegram и хотя бы одну услугу",
    );
  return { name, approach, photoUrl, contactUrl, experienceYears, services };
}
export function matchesFilters(
  profile: Pick<ConsultantProfile, "services" | "experienceYears">,
  kind: string,
  maxPrice: number | null,
  minExperience: number | null,
) {
  return (
    (minExperience === null || profile.experienceYears >= minExperience) &&
    profile.services.some(
      (s) =>
        (!kind || s.kind === kind) &&
        (maxPrice === null || s.price <= maxPrice),
    )
  );
}
