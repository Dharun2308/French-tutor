const DAY_MS = 86_400_000;

function dateParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Convert a midnight wall-clock date in an IANA zone to its UTC instant. */
function zonedMidnight(year: number, month: number, day: number, timezone: string): Date {
  const desired = Date.UTC(year, month - 1, day);
  let candidate = desired;

  // Two passes handle offsets and the DST boundary without a timezone dependency.
  for (let i = 0; i < 2; i++) {
    const rendered = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const get = (type: string) => Number(rendered.find((p) => p.type === type)?.value);
    const actualAsUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second")
    );
    candidate += desired - actualAsUtc;
  }
  return new Date(candidate);
}

/** Monday 00:00 in the user's timezone, represented as a UTC Date. */
export function startOfUserWeek(now: Date, timezone: string): Date {
  try {
    const local = dateParts(now, timezone);
    const calendarDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
    const daysSinceMonday = (calendarDay.getUTCDay() + 6) % 7;
    const monday = new Date(calendarDay.getTime() - daysSinceMonday * DAY_MS);
    return zonedMidnight(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
      timezone
    );
  } catch {
    const utcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysSinceMonday = (utcDay.getUTCDay() + 6) % 7;
    return new Date(utcDay.getTime() - daysSinceMonday * DAY_MS);
  }
}
