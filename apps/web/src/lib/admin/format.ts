// Formatting for the admin pages. Times are shown in Lagos time, whatever the viewer's clock says.

const TZ = "Africa/Lagos";

export const usd = (v: number) => `$${v.toFixed(2)}`;

export function lagosDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

export function greeting(iso: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  return hour < 12 ? "Good morning, " : hour < 17 ? "Good afternoon, " : "Good evening, ";
}
