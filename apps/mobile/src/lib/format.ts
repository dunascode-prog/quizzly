/** "CSC 225" → "CSC", for the course badge circle. */
export function courseBadge(code: string) {
  return code.split(' ')[0].slice(0, 4);
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
