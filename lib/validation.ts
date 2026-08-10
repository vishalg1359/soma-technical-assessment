export const MAX_DURATION_DAYS = 365;
export const MAX_TITLE_LENGTH = 200;

/**
 * The id in a route path, as a positive integer.
 *
 * Deliberately stricter than `parseInt`, which stops at the first character it
 * cannot read and so accepts "12abc", "12.9" and " 12" as task 12 -- three
 * spellings of one row, each a distinct URL. Only the canonical decimal form
 * is a valid id.
 */
export function parseRouteId(value: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** Estimates are whole days. Empty means the default of one day. */
export function parseDurationInput(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;

  // Only numbers and numeric strings. Bare `Number()` would also take `[7]`,
  // `true` and `" 5 "`, which are never a user typing an estimate.
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Duration must be a whole number of days');
  }

  // Zero is allowed on purpose: a milestone is a real task that takes no time.
  const duration = Number(value);
  if (!Number.isInteger(duration)) throw new Error('Duration must be a whole number of days');
  if (duration < 0) throw new Error('Duration cannot be negative');
  if (duration > MAX_DURATION_DAYS) throw new Error(`Duration cannot exceed ${MAX_DURATION_DAYS} days`);

  return duration;
}

export function parseTitleInput(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Title is required');

  // A title is one line of text. Control characters and pasted newlines are
  // stripped rather than stored: they survive escaping, but they break how a
  // title sorts, searches and reads back, and a tab is not a word boundary
  // anyone typed on purpose.
  const title = value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (title === '') throw new Error('Title is required');
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}
