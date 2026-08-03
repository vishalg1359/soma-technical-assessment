export const MAX_DURATION_DAYS = 365;
export const MAX_TITLE_LENGTH = 200;

/** Estimates are whole days. Empty means the default of one day. */
export function parseDurationInput(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;

  const duration = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(duration)) throw new Error('Duration must be a whole number of days');
  if (duration < 0) throw new Error('Duration cannot be negative');
  if (duration > MAX_DURATION_DAYS) throw new Error(`Duration cannot exceed ${MAX_DURATION_DAYS} days`);

  return duration;
}

export function parseTitleInput(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('Title is required');
  const title = value.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title cannot exceed ${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}
