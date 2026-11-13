import { and, asc, eq, gte, lte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accessGrants, children, parents, sleeps } from "@/db/schema";
import { localDate, shiftDate } from "./sleep-day";
import { diaryColumns, diaryPeriod } from "./consultant-table";
export async function loadConsultantDiary(
  consultantId: string,
  childId: string,
  query: { from?: string; to?: string; p?: string },
) {
  if (!/^[0-9a-f-]{36}$/i.test(childId)) return null;
  const [access] = await db
    .select()
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.childId, childId),
        eq(accessGrants.consultantId, consultantId),
        isNull(accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (!access) return null;
  const [child] = await db
    .select()
    .from(children)
    .where(eq(children.id, childId));
  if (!child) return null;
  const [parent] = await db
    .select()
    .from(parents)
    .where(eq(parents.id, child.parentId));
  const window = {
    dayBoundary: child.dayBoundaryMinutes,
    nightFrom: child.nightFromMinutes,
    timeZone: parent.timeZone,
  };
  const now = new Date();
  const period = diaryPeriod(
    query.from,
    query.to,
    localDate(now, window.timeZone),
    Number(query.p),
  );
  const rows = await db
    .select()
    .from(sleeps)
    .where(
      and(
        eq(sleeps.childId, childId),
        gte(sleeps.sleepDay, period.from),
        lte(sleeps.sleepDay, shiftDate(period.to, 1)),
      ),
    )
    .orderBy(asc(sleeps.startedAt));
  return {
    access,
    child,
    parent,
    period,
    days: diaryColumns(period.dates, rows, window, now),
  };
}
