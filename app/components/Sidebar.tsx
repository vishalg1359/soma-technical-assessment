"use client"
import { VIEWS, ViewId } from '@/lib/views';

interface Props {
  view: ViewId;
  counts: Record<ViewId, number>;
  showGraph: boolean;
  onSelectView: (view: ViewId) => void;
  onToggleGraph: () => void;
  onOpenPalette: () => void;
}

export default function Sidebar({
  view,
  counts,
  showGraph,
  onSelectView,
  onToggleGraph,
  onOpenPalette,
}: Props) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-[var(--border)] p-4 sm:h-screen sm:w-60 sm:border-b-0 sm:border-r sm:p-5">
      <div>
        <h1 className="text-sm font-semibold tracking-tight">Things to do</h1>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">Schedules itself</p>
      </div>

      <button
        onClick={onOpenPalette}
        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-3)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-2)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
          />
        </svg>
        Search or jump
        <kbd className="kbd ml-auto">{'\u2318'}K</kbd>
      </button>

      <nav className="flex flex-col gap-0.5">
        {VIEWS.map((entry, index) => (
          <button
            key={entry.id}
            onClick={() => onSelectView(entry.id)}
            title={entry.hint}
            aria-current={view === entry.id}
            className={`group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              view === entry.id
                ? 'bg-[var(--surface-2)] text-[var(--ink)]'
                : 'text-[var(--ink-2)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="flex-grow">{entry.label}</span>
            <span className="text-[11px] tabular-nums text-[var(--ink-3)]">
              {counts[entry.id] || ''}
            </span>
            <kbd className="kbd opacity-0 transition-opacity group-hover:opacity-100">
              {index + 1}
            </kbd>
          </button>
        ))}
      </nav>

      <button
        onClick={onToggleGraph}
        className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
          showGraph
            ? 'bg-[var(--surface-2)] text-[var(--ink)]'
            : 'text-[var(--ink-2)] hover:bg-[var(--surface)] hover:text-[var(--ink)]'
        }`}
      >
        <span className="flex-grow">Dependency graph</span>
        <kbd className="kbd">G</kbd>
      </button>

      <dl className="mt-auto hidden gap-1.5 text-[11px] text-[var(--ink-3)] sm:grid">
        <Shortcut keys="J K" label="move" />
        <Shortcut keys="X" label="complete" />
        <Shortcut keys="E" label="rename" />
        <Shortcut keys="C" label="add task" />
        <Shortcut keys="?" label="all shortcuts" />
      </dl>
    </aside>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="flex gap-1">
        {keys.split(' ').map((key) => (
          <kbd key={key} className="kbd">
            {key}
          </kbd>
        ))}
      </dt>
      <dd>{label}</dd>
    </div>
  );
}
