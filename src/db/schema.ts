import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ *
 * Справочные типы
 * ------------------------------------------------------------------ */

export const sleepKind = pgEnum('sleep_kind', ['day', 'night']);
/** Откуда взялась запись: таймер, ручной ввод или распознавание фото. */
export const entrySource = pgEnum('entry_source', ['timer', 'manual', 'photo']);
/** Кормление отмечают только на искусственном и смешанном — грудное не считаем. */
export const feedingType = pgEnum('feeding_type', ['breast', 'formula', 'mixed']);
export const themePref = pgEnum('theme_pref', ['auto', 'light', 'dark']);
export const plan = pgEnum('plan', ['trial', 'practice', 'flow']);
export const showcaseStatus = pgEnum('showcase_status', ['hidden', 'pending', 'published', 'rejected']);
export const importStatus = pgEnum('import_status', ['uploaded', 'parsed', 'confirmed', 'failed']);

/* ------------------------------------------------------------------ *
 * Консультанты — те, кто платит
 * ------------------------------------------------------------------ */

export const consultants = pgTable(
  'consultants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    /** scrypt: соль и хеш. Пароль в открытом виде не хранится нигде. */
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    /** Хвост личной ссылки-приглашения: t.me/bot/app?startapp=<slug> */
    slug: text('slug').notNull(),
    telegramId: text('telegram_id'),
    phone: text('phone'),

    plan: plan('plan').notNull().default('trial'),
    planUntil: timestamp('plan_until', { withTimezone: true }),

    /* Витрина. Виктория отбирает вручную: «чтобы мамочка не напоролась на придурка». */
    showcaseStatus: showcaseStatus('showcase_status').notNull().default('hidden'),
    city: text('city'),
    experienceYears: smallint('experience_years'),
    /** Принципы работы — для мам это важнее регалий. */
    approach: text('approach'),
    priceFrom: integer('price_from'),
    contactUrl: text('contact_url'),
    photoUrl: text('photo_url'),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderationNote: text('moderation_note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('consultants_email_key').on(table.email),
    uniqueIndex('consultants_slug_key').on(table.slug),
    index('consultants_showcase_idx').on(table.showcaseStatus),
  ],
);

/* ------------------------------------------------------------------ *
 * Мамы и дети
 * ------------------------------------------------------------------ */

export const parents = pgTable(
  'parents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    telegramId: text('telegram_id').notNull(),
    firstName: text('first_name'),
    /** IANA-зона: от неё зависит, к каким суткам отнести ночной сон. */
    timeZone: text('time_zone').notNull().default('Europe/Moscow'),
    themePref: themePref('theme_pref').notNull().default('auto'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('parents_telegram_id_key').on(table.telegramId)],
);

export const children = pgTable(
  'children',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => parents.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    birthDate: date('birth_date').notNull(),
    /** ПДР — для скорректированного возраста недоношенных. */
    dueDate: date('due_date'),
    isPreterm: boolean('is_preterm').notNull().default(false),

    /**
     * Особенности здоровья. Виктория: «если у ребёнка анемия — там другая
     * тактика работы, а этого ни у кого нет, и для сна капец как важно».
     */
    healthNotes: text('health_notes'),
    /** Темперамент отмечается выбором вариантов, а не текстом. */
    temperament: jsonb('temperament').$type<string[]>(),

    feedingType: feedingType('feeding_type').notNull().default('breast'),

    /* Границы сонных суток — мама выставляет сама. Минуты от полуночи. */
    dayBoundaryMinutes: smallint('day_boundary_minutes').notNull().default(360),
    nightFromMinutes: smallint('night_from_minutes').notNull().default(1140),

    /** Ориентир по режиму мам тревожит, поэтому его можно выключить. */
    showRhythmHint: boolean('show_rhythm_hint').notNull().default(true),

    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('children_parent_idx').on(table.parentId)],
);

/* ------------------------------------------------------------------ *
 * Дневник
 * ------------------------------------------------------------------ */

export const sleeps = pgTable(
  'sleeps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** Пусто — сон идёт прямо сейчас. */
    endedAt: timestamp('ended_at', { withTimezone: true }),

    /**
     * Считаются из времени начала и границ суток, но хранятся:
     * консультант может поправить вручную, и правка должна пережить пересчёт.
     */
    sleepDay: date('sleep_day').notNull(),
    kind: sleepKind('kind').notNull(),

    source: entrySource('source').notNull().default('timer'),
    importId: uuid('import_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sleeps_child_day_idx').on(table.childId, table.sleepDay),
    index('sleeps_child_started_idx').on(table.childId, table.startedAt),
  ],
);

export const feedings = pgTable(
  'feedings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull(),
    sleepDay: date('sleep_day').notNull(),
    amountMl: smallint('amount_ml'),
    note: text('note'),
    source: entrySource('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('feedings_child_day_idx').on(table.childId, table.sleepDay)],
);

/* ------------------------------------------------------------------ *
 * Доступ консультанта к дневнику
 *
 * Мама даёт доступ явной галочкой конкретному человеку и может отозвать
 * в один тап. Консультация закончилась — доступ закрыт, дневник остаётся у мамы.
 * ------------------------------------------------------------------ */

export const accessGrants = pgTable(
  'access_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    consultantId: uuid('consultant_id')
      .notNull()
      .references(() => consultants.id, { onDelete: 'cascade' }),

    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Какую редакцию согласия мама приняла — понадобится, если текст изменится. */
    consentVersion: text('consent_version').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('access_grants_consultant_idx').on(table.consultantId),
    index('access_grants_child_idx').on(table.childId),
  ],
);

export const consultantNotes = pgTable(
  'consultant_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    consultantId: uuid('consultant_id')
      .notNull()
      .references(() => consultants.id, { onDelete: 'cascade' }),
    /** Пусто — заметка про клиента вообще, а не про конкретный день. */
    sleepDay: date('sleep_day'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('consultant_notes_child_idx').on(table.childId, table.consultantId)],
);

/* ------------------------------------------------------------------ *
 * Фото в таблицу
 * ------------------------------------------------------------------ */

export const photoImports = pgTable(
  'photo_imports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    childId: uuid('child_id')
      .notNull()
      .references(() => children.id, { onDelete: 'cascade' }),
    /**
     * Где лежит файл. Пусто — мама открыла загрузку, но разбора ещё нет,
     * и сам снимок мы не храним: держать фотографии детских дневников,
     * которые пока нечем обработать, смысла нет.
     */
    fileKey: text('file_key'),
    status: importStatus('status').notNull().default('uploaded'),
    /** Что распозналось до маминых правок. */
    parsed: jsonb('parsed').$type<unknown>(),
    parseError: text('parse_error'),

    /** Сколько снимков мама выбрала за один заход. */
    fileCount: smallint('file_count'),
    recordsParsed: smallint('records_parsed'),
    /**
     * Сколько записей мама поправила на экране проверки.
     * Это наша метрика точности: если правят больше трети,
     * функция не «бомба», а раздражитель, и это надо увидеть в цифрах.
     */
    recordsEdited: smallint('records_edited'),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('photo_imports_child_idx').on(table.childId)],
);

/* ------------------------------------------------------------------ *
 * Контент Виктории
 * ------------------------------------------------------------------ */

/**
 * Таблица режимов Виктории. Всё в минутах.
 *
 * Формат её собственный, и он богаче обычных «норм»: на один возраст
 * приходится несколько вариантов режима по числу снов, а окна бодрствования
 * заданы по порядку — первое короче последнего.
 *
 * Показываем диапазоном и только пока своих данных мало. Её же оговорка
 * едет вместе с цифрами: «Это ориентиры, а не строгие правила».
 */
export const rhythmNorms = pgTable(
  'rhythm_norms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ageMonthsFrom: smallint('age_months_from').notNull(),
    ageMonthsTo: smallint('age_months_to').notNull(),
    /** Сколько снов в этом варианте режима. Пусто — вариант один. */
    napsCount: smallint('naps_count'),

    /** Окна бодрствования по порядку: [{min, max}, …] — 1ВБ, 2ВБ и так далее. */
    wakeWindows: jsonb('wake_windows').$type<{ min: number; max: number }[]>(),

    /** СВБ — суммарное бодрствование за сутки. */
    totalWakeMin: smallint('total_wake_min'),
    totalWakeMax: smallint('total_wake_max'),
    /** ДС — суммарный дневной сон. */
    daySleepMin: smallint('day_sleep_min'),
    daySleepMax: smallint('day_sleep_max'),
    nightSleepMin: smallint('night_sleep_min'),
    nightSleepMax: smallint('night_sleep_max'),
    /** Суточный сон — заполнен для младших возрастов, где режима ещё нет. */
    totalSleepMin: smallint('total_sleep_min'),
    totalSleepMax: smallint('total_sleep_max'),

    note: text('note'),
  },
  (table) => [index('rhythm_norms_age_idx').on(table.ageMonthsFrom, table.ageMonthsTo)],
);

/** Чем занять ребёнка в бодрствование — мамы принимают скуку за усталость. */
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ageMonthsFrom: smallint('age_months_from').notNull(),
    ageMonthsTo: smallint('age_months_to').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    published: boolean('published').notNull().default(true),
  },
  (table) => [index('activities_age_idx').on(table.ageMonthsFrom, table.ageMonthsTo)],
);

export type Consultant = typeof consultants.$inferSelect;
export type Parent = typeof parents.$inferSelect;
export type Child = typeof children.$inferSelect;
export type Sleep = typeof sleeps.$inferSelect;
export type Feeding = typeof feedings.$inferSelect;
export type AccessGrant = typeof accessGrants.$inferSelect;
