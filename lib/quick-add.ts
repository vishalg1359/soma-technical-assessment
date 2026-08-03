const MS_PER_DAY = 24 * 60 * 60 * 1000;

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

export interface QuickAdd {
  /** What is left after the date and estimate are lifted out. */
  title: string;
  /** `YYYY-MM-DD`, the format `<input type="date">` and the API both speak. */
  dueDate: string | null;
  durationDays: number;
  /** The exact substrings that were consumed, so the input can highlight them. */
  matched: { due?: string; duration?: string };
}

/**
 * One matcher per phrase we understand. Each returns the calendar day offset
 * from today, so every rule is expressed in the viewer's local calendar and
 * none of them do their own date arithmetic.
 */
const DUE_RULES: Array<{ pattern: RegExp; offset: (match: RegExpMatchArray, today: Date) => number | null }> = [
  { pattern: /\btoday\b/i, offset: () => 0 },
  { pattern: /\btomorrow\b|\btmr\b/i, offset: () => 1 },
  { pattern: /\bnext week\b/i, offset: () => 7 },
  { pattern: /\bin (\d{1,3}) days?\b/i, offset: (match) => Number(match[1]) },
  { pattern: /\bin a week\b/i, offset: () => 7 },
  {
    // "friday" / "fri" / "next friday" -- always the next occurrence, never today.
    pattern: new RegExp(`\\b(?:next\\s+)?(${WEEKDAYS.map((day) => `${day}|${day.slice(0, 3)}`).join('|')})\\b`, 'i'),
    offset: (match, today) => {
      const name = match[1].toLowerCase();
      const target = WEEKDAYS.findIndex((day) => day === name || day.slice(0, 3) === name);
      const ahead = (target - today.getDay() + 7) % 7;
      return ahead === 0 ? 7 : ahead;
    },
  },
  {
    // "aug 12" / "12 aug" / "august 12th"
    pattern: new RegExp(
      `\\b(?:(${MONTHS.map((month) => `${month}|${month.slice(0, 3)}`).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?` +
        `|(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.map((month) => `${month}|${month.slice(0, 3)}`).join('|')}))\\b`,
      'i'
    ),
    offset: (match, today) => {
      const name = (match[1] ?? match[4]).toLowerCase();
      const day = Number(match[2] ?? match[3]);
      const month = MONTHS.findIndex((label) => label === name || label.slice(0, 3) === name);
      if (month < 0 || day < 1 || day > 31) return null;

      // Bare month/day means the next time that date comes round.
      const thisYear = Date.UTC(today.getFullYear(), month, day);
      const startOfToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      const target = thisYear < startOfToday ? Date.UTC(today.getFullYear() + 1, month, day) : thisYear;

      // Guards against "feb 31", which Date silently rolls forward.
      if (new Date(target).getUTCDate() !== day) return null;
      return Math.round((target - startOfToday) / MS_PER_DAY);
    },
  },
];

/** "3d", "3 days", "takes 3 days" -- the estimate the scheduler works from. */
const DURATION_RULE = /\b(?:takes\s+)?(\d{1,3})\s*(?:d\b|days?\b)/i;

/**
 * Parse a single line of natural input into the fields a task needs, so adding
 * work never costs more than a sentence: "ship the deck friday 3d".
 *
 * Deliberately conservative -- anything it doesn't recognise stays in the title
 * rather than being guessed at, and every match is reported back so the UI can
 * show what it took.
 */
export function parseQuickAdd(input: string, today: Date = new Date()): QuickAdd {
  let rest = input;
  const matched: QuickAdd['matched'] = {};
  let dueDate: string | null = null;
  let durationDays = 1;

  // Dates are lifted first: "in 3 days" is a deadline, and reading the estimate
  // first would eat the "3 days" out of it.
  for (const rule of DUE_RULES) {
    const match = rest.match(rule.pattern);
    if (!match) continue;

    const offset = rule.offset(match, today);
    if (offset === null) continue;

    dueDate = dayOffsetToInput(offset, today);
    matched.due = match[0];
    rest = rest.replace(match[0], ' ');
    break;
  }

  const duration = rest.match(DURATION_RULE);
  if (duration) {
    const days = Number(duration[1]);
    if (days > 0 && days <= 365) {
      durationDays = days;
      matched.duration = duration[0];
      rest = rest.replace(duration[0], ' ');
    }
  }

  return {
    title: rest.replace(/\s+/g, ' ').trim(),
    dueDate,
    durationDays,
    matched,
  };
}

/** A whole-day offset from today as the `YYYY-MM-DD` an input element expects. */
export function dayOffsetToInput(offset: number, today: Date = new Date()): string {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(start + offset * MS_PER_DAY).toISOString().slice(0, 10);
}
