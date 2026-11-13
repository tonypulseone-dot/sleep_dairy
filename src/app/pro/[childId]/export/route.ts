import { currentConsultant } from "@/lib/pro-session";
import { loadConsultantDiary } from "@/lib/consultant-diary";
import { periodSummary, tableRows } from "@/lib/consultant-table";
import { formatDuration } from "@/lib/sleep-day";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  const consultant = await currentConsultant();
  if (!consultant) return new Response("Нужно войти", { status: 401 });
  const { childId } = await params;
  const q = new URL(request.url).searchParams;
  const data = await loadConsultantDiary(consultant.id, childId, {
    from: q.get("from") ?? undefined,
    to: q.get("to") ?? undefined,
    p: q.get("days") ?? undefined,
  });
  if (!data) return new Response("Нет доступа", { status: 404 });
  const summary = periodSummary(data.days);
  const lines = [
    ["Дата", ...data.days.map((d) => d.date)],
    ...tableRows(data.days).map((r) => [r.label, ...r.cells]),
    ["Статус", ...data.days.map((d) => d.status)],
    [],
    [
      "Всего сна за период",
      summary.total === null ? "—" : formatDuration(summary.total),
    ],
    [
      "Средний сон за сутки",
      summary.average === null ? "—" : formatDuration(summary.average),
    ],
    ["Учтено суток", String(summary.count)],
  ];
  const csv =
    "\uFEFF" +
    lines
      .map((row) => row.map((v) => '"' + v.replace(/"/g, '""') + '"').join(";"))
      .join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sleep-${data.period.from}-${data.period.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
