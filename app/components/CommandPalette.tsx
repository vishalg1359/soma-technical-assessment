"use client"
import { useEffect, useMemo, useRef, useState } from 'react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

/**
 * Cmd+K: one search box over every view, action, and task. Arrow keys move,
 * Enter runs, Escape closes; the mouse is optional throughout.
 */
export default function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? commands.filter((command) => command.label.toLowerCase().includes(trimmed))
      : commands;
    return filtered.slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const run = (index: number) => {
    const command = matches[index];
    if (!command) return;
    command.run();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Command palette"
    >
      <div
        className="pop card w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={'Search tasks and commands\u2026'}
          aria-label="Search tasks and commands"
          className="w-full border-b border-[var(--border)] bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--ink-3)]"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, matches.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
            }
            if (event.key === 'Enter') run(active);
            if (event.key === 'Escape') onClose();
          }}
        />

        <ul className="max-h-80 overflow-y-auto py-1">
          {matches.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">No matches.</li>
          )}

          {matches.map((command, index) => (
            <li key={command.id}>
              <button
                onMouseEnter={() => setActive(index)}
                onClick={() => run(index)}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  index === active ? 'bg-[var(--surface-2)]' : ''
                }`}
              >
                <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
                  {command.group}
                </span>
                <span className="flex-grow truncate">{command.label}</span>
                {command.hint && (
                  <span className="shrink-0 text-[11px] text-[var(--ink-3)]">{command.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
