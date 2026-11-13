import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consultantNotes } from "@/db/schema";
import { currentConsultant } from "@/lib/pro-session";
import { loadConsultantDiary } from "@/lib/consultant-diary";
import { periodSummary, tableRows } from "@/lib/consultant-table";
import { formatDuration } from "@/lib/sleep-day";
import { ProNotes } from "@/components/ProNotes";
import styles from "@/components/Pro.module.css";
import sheet from "@/components/ConsultantTable.module.css";
export default async function ClientCard({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ from?: string; to?: string; p?: string }>;
}) {
  const consultant = await currentConsultant();
  if (!consultant) redirect("/pro/login");
  const { childId } = await params;
  const data = await loadConsultantDiary(
    consultant.id,
    childId,
    await searchParams,
  );
  if (!data) notFound();
  const { child, access, days, period } = data;
  const notes = await db
    .select()
    .from(consultantNotes)
    .where(
      and(
        eq(consultantNotes.childId, childId),
        eq(consultantNotes.consultantId, consultant.id),
      ),
    )
    .orderBy(desc(consultantNotes.createdAt));
  const dates = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: data.parent.timeZone,
  });
  const summary = periodSummary(days);
  const value = (v: number | null) => (v === null ? "—" : formatDuration(v));
  return (
    <main className={sheet.page}>
      <div className={styles.top}>
        <h1>{child.name}</h1>
        <Link href="/pro" className={styles.linkish}>
          Ко всем клиенткам
        </Link>
      </div>
      <p className={sheet.note}>
        В работе с {dates.format(access.grantedAt)} · с момента открытия доступа
      </p>
      <form className={sheet.controls} key={`${period.from}-${period.to}`}>
        <label>
          С даты
          <input
            aria-label="Начало периода"
            type="date"
            name="from"
            defaultValue={period.from}
            required
          />
        </label>
        <label>
          По дату
          <input
            aria-label="Конец периода"
            type="date"
            name="to"
            defaultValue={period.to}
            required
          />
        </label>
        <button type="submit">Показать</button>
        {[7, 14, 30].map((p) => (
          <Link
            key={p}
            href={`/pro/${childId}?p=${p}`}
            className={styles.linkish}
          >
            {p} дней
          </Link>
        ))}
        <a
          className={styles.linkish}
          href={`/pro/${childId}/export?from=${period.from}&to=${period.to}`}
          download
        >
          Скачать таблицу
        </a>
      </form>
      <p className={sheet.note}>
        До 90 дней за раз. Время — в часовом поясе малыша (
        {data.parent.timeZone}). На телефоне таблицу можно листать вправо.
      </p>
      <div
        className={sheet.scroll}
        tabIndex={0}
        role="region"
        aria-label="Дневник сна по дням"
      >
        <table className={sheet.table}>
          <caption className="sr-only">Дневник сна {child.name}</caption>
          <thead>
            <tr>
              <th scope="col">Дата</th>
              {days.map((d) => (
                <th key={d.date} scope="col">
                  {new Intl.DateTimeFormat("ru-RU", {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${d.date}T12:00:00Z`))}
                  <small>
                    {d.complete
                      ? "Учтён в среднем"
                      : d.status === "Нет записей"
                        ? "Нет записей"
                        : "Неполные сутки"}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows(days).map((row) => (
              <tr key={row.label} data-tone={row.tone}>
                <th scope="row">{row.label}</th>
                {row.cells.map((v, i) => (
                  <td key={days[i].date}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={sheet.summary}>
        <p>
          Всего сна за период<strong>{value(summary.total)}</strong>
        </p>
        <p>
          Средний сон за сутки<strong>{value(summary.average)}</strong>
        </p>
      </div>
      <p className={sheet.note}>
        В итогах учтено {summary.count} из {days.length} суток: записаны ночь,
        окончание каждого сна и следующий отбой. Пропуски обозначены «—».
        Неотмеченный дневной сон автоматически определить нельзя. Ночь относится
        к дате следующего утра.
      </p>
      <ProNotes
        childId={childId}
        notes={notes.map((n) => ({
          id: n.id,
          body: n.body,
          when: dates.format(n.createdAt),
        }))}
      />
    </main>
  );
}
