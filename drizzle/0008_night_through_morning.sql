-- Сон, который продолжался за утреннюю границу следующих суток, — ночной,
-- даже если начался чуть раньше «ночи» (уложили в 18:40 при границе 19:00).
-- Раньше тип решался только по времени начала; приводим старые записи
-- к новому правилу (см. sleepKindOf в src/lib/sleep-day.ts).
UPDATE "sleeps" AS s
SET "kind" = 'night'
FROM "children" AS c, "parents" AS p
WHERE c."id" = s."child_id"
  AND p."id" = c."parent_id"
  AND s."kind" = 'day'
  AND s."ended_at" IS NOT NULL
  AND s."ended_at" > (((s."sleep_day" + 1)::timestamp + make_interval(mins => c."day_boundary_minutes")) AT TIME ZONE p."time_zone");
