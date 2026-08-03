"use client"
import { useEffect, useRef, useState } from 'react';
import { formatDueDate, getDueStatus } from '@/lib/dates';
import { ScheduledTask, dayOffsetToDate } from '@/lib/scheduling';
import { TodoWithDependencies } from '@/lib/types';
import { TodoPatch } from '../hooks/useTodos';
import TaskImage from './TaskImage';

interface Props {
  todo: TodoWithDependencies;
  task: ScheduledTask | undefined;
  now: Date;
  selected: boolean;
  expanded: boolean;
  editing: boolean;
  titleById: Map<number, string>;
  /** Titles of blockers that are still open; while any exist this can't be finished. */
  blockedBy: string[];
  candidates: TodoWithDependencies[];
  onSelect: () => void;
  onToggleExpanded: () => void;
  onToggleCompleted: () => void;
  onDelete: () => void;
  onEdit: (patch: TodoPatch) => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onAddDependency: (dependencyId: number) => void;
  onRemoveDependency: (dependencyId: number) => void;
}

const DUE_TONE = {
  overdue: 'text-red-400',
  today: 'text-amber-400',
  upcoming: 'text-[var(--ink-2)]',
} as const;

const toInputDate = (value: string | Date | null) =>
  value ? new Date(value).toISOString().slice(0, 10) : '';

export default function TaskRow({
  todo,
  task,
  now,
  selected,
  expanded,
  editing,
  titleById,
  blockedBy,
  candidates,
  onSelect,
  onToggleExpanded,
  onToggleCompleted,
  onDelete,
  onEdit,
  onStartEditing,
  onStopEditing,
  onAddDependency,
  onRemoveDependency,
}: Props) {
  const due = todo.dueDate ? getDueStatus(todo.dueDate, now) : null;
  const row = useRef<HTMLLIElement>(null);
  // Optimistic rows carry a temporary negative id until the server answers;
  // they read normally but cannot be edited into a task that does not exist.
  const saving = todo.id < 0;
  const blocked = !todo.completed && blockedBy.length > 0;
  const blockedReason =
    blockedBy.length === 1
      ? `Waiting on \u201c${blockedBy[0]}\u201d`
      : `Waiting on ${blockedBy.length} unfinished tasks`;

  useEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <li
      ref={row}
      onClick={onSelect}
      className={`row-enter card overflow-hidden transition-all ${
        selected ? 'border-[var(--accent)]/60 ring-1 ring-[var(--accent)]/30' : ''
      } ${task?.missesDueDate && !todo.completed ? 'border-red-500/40' : ''} ${
        todo.completed ? 'opacity-55' : ''
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleCompleted();
          }}
          disabled={saving || blocked}
          title={blocked ? blockedReason : undefined}
          aria-label={todo.completed ? `Reopen ${todo.title}` : `Complete ${todo.title}`}
          aria-pressed={todo.completed}
          aria-disabled={blocked}
          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
            todo.completed
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : blocked
                ? 'cursor-not-allowed border-dashed border-[var(--border-strong)] text-[var(--ink-3)]'
                : 'border-[var(--border-strong)] hover:border-emerald-400'
          }`}
        >
          {blocked && (
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeWidth={3}
                d="M6 12h12"
              />
            </svg>
          )}
          {todo.completed && (
            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {!expanded && !todo.completed && (
          <TaskImage
            status={todo.imageStatus}
            url={todo.imageUrl}
            alt={todo.imageAlt}
            credit={todo.imageCredit}
            title={todo.title}
            variant="thumb"
          />
        )}

        <div className="flex min-w-0 flex-grow flex-col gap-0.5">
          {editing ? (
            <InlineTitle
              value={todo.title}
              onCommit={(title) => {
                if (title !== todo.title) onEdit({ title });
                onStopEditing();
              }}
              onCancel={onStopEditing}
            />
          ) : (
            <button
              onDoubleClick={onStartEditing}
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
                onToggleExpanded();
              }}
              className={`truncate text-left text-sm ${
                todo.completed ? 'text-[var(--ink-3)] line-through' : ''
              }`}
            >
              {todo.title}
            </button>
          )}

          {!todo.completed && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--ink-3)]">
              {saving && <span className="animate-pulse">saving{'\u2026'}</span>}
              {due && <span className={DUE_TONE[due.state]}>{due.label}</span>}

              {task && (
                <span>
                  {task.earliestStart === 0
                    ? 'can start now'
                    : `starts ${formatDueDate(dayOffsetToDate(task.earliestStart, now))}`}
                </span>
              )}
              {task && <span>{task.durationDays}d</span>}
              {task && task.slack > 0 && <span>{task.slack}d slack</span>}

              {blocked ? (
                <span className="text-[var(--ink-2)]">{blockedReason.toLowerCase()}</span>
              ) : (
                todo.dependencyIds.length > 0 && <span>blocked by {todo.dependencyIds.length}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {task?.isCritical && (
            <span className="tag border-amber-500/40 text-amber-400">critical</span>
          )}
          {task?.missesDueDate && !todo.completed && (
            <span className="tag border-red-500/40 text-red-400">can{'\u2019'}t make it</span>
          )}

          <button
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onToggleExpanded();
            }}
            disabled={saving}
            aria-label={expanded ? `Collapse ${todo.title}` : `Expand ${todo.title}`}
            aria-expanded={expanded}
            className="rounded-md p-1 text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)]">
          {!todo.completed && (
            <TaskImage
              status={todo.imageStatus}
              url={todo.imageUrl}
              alt={todo.imageAlt}
              credit={todo.imageCredit}
              title={todo.title}
            />
          )}

          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--ink-3)]">
              Due date
              <input
                type="date"
                className="field"
                value={toInputDate(todo.dueDate)}
                onChange={(event) => onEdit({ dueDate: event.target.value || null })}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-[var(--ink-3)]">
              Estimate (days)
              <input
                type="number"
                min={0}
                max={365}
                className="field"
                value={todo.durationDays}
                onChange={(event) => {
                  const days = Number(event.target.value);
                  if (Number.isInteger(days) && days >= 0 && days <= 365) {
                    onEdit({ durationDays: days });
                  }
                }}
              />
            </label>

            <div className="sm:col-span-2">
              <p className="mb-1.5 text-xs text-[var(--ink-3)]">Blocked by</p>
              <div className="flex flex-wrap items-center gap-2">
                {todo.dependencyIds.length === 0 && (
                  <span className="text-xs text-[var(--ink-3)]">nothing {'\u2014'} can start as soon as you like</span>
                )}

                {todo.dependencyIds.map((dependencyId) => (
                  <span key={dependencyId} className="tag pr-1">
                    {titleById.get(dependencyId) ?? `#${dependencyId}`}
                    <button
                      onClick={() => onRemoveDependency(dependencyId)}
                      className="px-1 text-[var(--ink-3)] transition-colors hover:text-red-400"
                      aria-label={`Remove dependency ${titleById.get(dependencyId) ?? dependencyId}`}
                    >
                      {'\u00d7'}
                    </button>
                  </span>
                ))}

                {/* Finished work takes no new blockers -- the API says so too. */}
                {!todo.completed && candidates.length > 0 && (
                  <select
                    className="field px-2 py-1 text-xs"
                    value=""
                    aria-label={`Add a dependency to ${todo.title}`}
                    onChange={(event) => {
                      if (event.target.value) onAddDependency(Number(event.target.value));
                    }}
                  >
                    <option value="">+ add a blocker</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {task && !todo.completed && (
              <p className="text-xs text-[var(--ink-3)] sm:col-span-2">
                Earliest finish {formatDueDate(dayOffsetToDate(task.earliestFinish, now))}
                {task.slack > 0
                  ? ` \u00b7 ${task.slack} day${task.slack === 1 ? '' : 's'} of slack`
                  : ' \u00b7 no slack: any delay here delays the project'}
                {task.missesDueDate && ' \u00b7 that is after its due date'}
              </p>
            )}

            <div className="flex justify-end sm:col-span-2">
              <button
                onClick={onDelete}
                className="btn text-[var(--ink-3)] transition-colors hover:text-red-400"
              >
                Delete task
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** Rename in place: Enter commits, Escape puts the old title back. */
function InlineTitle({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.select();
  }, []);

  return (
    <input
      ref={input}
      className="field w-full py-1 text-sm"
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => (draft.trim() ? onCommit(draft.trim()) : onCancel())}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter' && draft.trim()) onCommit(draft.trim());
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}
