/** "CSC 225" → "CSC", for the course badge circle. */
export function courseBadge(code: string) {
  return code.split(' ')[0].slice(0, 4);
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A local date as "YYYY-MM-DD", the API's date format. */
export function toIsoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" as a local date (not UTC midnight, which can be the day before here). */
export function fromIsoDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "7 Nov", or "7 Nov 2027" when it isn't this year. */
export function formatDay(day: string) {
  const d = fromIsoDay(day);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year}`;
}
