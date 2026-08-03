"use client"
import { forwardRef, useMemo, useState } from 'react';
import { parseQuickAdd } from '@/lib/quick-add';
import { TodoDraft } from '../hooks/useTodos';

interface Props {
  onAdd: (draft: TodoDraft) => Promise<boolean>;
  now: Date;
}

/**
 * One line in, one task out: "seal the deck friday 2d".
 *
 * The date and estimate the parser recognised land in real controls next to
 * the input, so the shortcut is a shortcut -- you can always see what it
 * decided and change it before the task exists, or ignore the typing trick
 * entirely and just use the fields.
 */
const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd({ onAdd, now }, ref) {
  const [value, setValue] = useState('');
  const [dueOverride, setDueOverride] = useState<string | null>(null);
  const [durationOverride, setDurationOverride] = useState<number | null>(null);

  const parsed = useMemo(() => parseQuickAdd(value, now), [value, now]);
  // A field the user touched wins over whatever the parser reads next.
  const dueDate = dueOverride ?? parsed.dueDate ?? '';
  const durationDays = durationOverride ?? parsed.durationDays;
  const canSubmit = parsed.title.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    // Fire and forget: the list adds the row immediately and rolls it back if
    // the write fails, so the input is free for the next task straight away.
    void onAdd({
      title: parsed.title,
      dueDate: dueDate === '' ? null : dueDate,
      durationDays,
    });
    setValue('');
    setDueOverride(null);
    setDurationOverride(null);
  };

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <span className="pl-1 text-[var(--ink-3)]" aria-hidden>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </span>

        <input
          ref={ref}
          type="text"
          aria-label="Add a task"
          placeholder={'Add a task \u2014 try \u201cseal the deck friday 2d\u201d'}
          className="w-full flex-grow bg-transparent text-sm outline-none placeholder:text-[var(--ink-3)] sm:w-auto"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') {
              setValue('');
              setDueOverride(null);
              setDurationOverride(null);
              event.currentTarget.blur();
            }
          }}
        />

        <label className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <span className="sr-only sm:not-sr-only">Due</span>
          <input
            type="date"
            aria-label="Due date for the new task"
            className="field w-[8.5rem] px-2 py-1 text-xs"
            value={dueDate}
            onChange={(event) => setDueOverride(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <span className="sr-only sm:not-sr-only">Est</span>
          <input
            type="number"
            min={1}
            max={365}
            aria-label="Estimate in days for the new task"
            className="field w-14 px-2 py-1 text-xs"
            value={durationDays}
            onChange={(event) => {
              const days = Number(event.target.value);
              setDurationOverride(Number.isFinite(days) && days > 0 ? Math.floor(days) : 1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
          />
          <span className="text-[var(--ink-3)]">d</span>
        </label>

        <button onClick={submit} disabled={!canSubmit} className="btn btn-primary shrink-0">
          Add
        </button>
      </div>

      {value.trim() !== '' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-xs text-[var(--ink-3)]">
          <span className="text-[var(--ink-2)]">{parsed.title || 'Needs a title'}</span>
          {parsed.matched.due && <span className="tag">read {'\u201c'}{parsed.matched.due}{'\u201d'} as a date</span>}
          {parsed.matched.duration && (
            <span className="tag">read {'\u201c'}{parsed.matched.duration}{'\u201d'} as an estimate</span>
          )}
          <span className="ml-auto flex items-center gap-1">
            <kbd className="kbd">{'\u21b5'}</kbd> to add
          </span>
        </div>
      )}
    </div>
  );
});

export default QuickAdd;
