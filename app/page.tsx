"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScheduledTask, computeSchedule } from '@/lib/scheduling';
import { TodoWithDependencies } from '@/lib/types';
import { SortId, VIEWS, ViewId, ViewItem, countByView, selectTasks, summarise } from '@/lib/views';
import CommandPalette, { Command } from './components/CommandPalette';
import DependencyGraph from './components/DependencyGraph';
import QuickAdd from './components/QuickAdd';
import ShortcutsHelp from './components/ShortcutsHelp';
import Sidebar from './components/Sidebar';
import TaskListSkeleton from './components/TaskListSkeleton';
import TaskRow from './components/TaskRow';
import { useTodos } from './hooks/useTodos';

const MINUTE_MS = 60 * 1000;

// Shared empty arrays: a fresh `[]` per row is a new prop identity every render.
const NO_BLOCKERS: string[] = [];
const NO_CANDIDATES: TodoWithDependencies[] = [];

const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'smart', label: 'Most urgent' },
  { id: 'due', label: 'Due date' },
  { id: 'created', label: 'Recently added' },
  { id: 'title', label: 'Title' },
];

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

export default function Home() {
  const { todos, isLoading, loadError, reload, addTodo, updateTodo, deleteTodo, changeDependency } =
    useTodos();

  const [view, setView] = useState<ViewId>('all');
  const [sort, setSort] = useState<SortId>('smart');
  const [query, setQuery] = useState('');
  const [showGraph, setShowGraph] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [imagesEnabled, setImagesEnabled] = useState(true);
  // Re-render on a timer so a task due today turns red at midnight without a reload.
  const [now, setNow] = useState(() => new Date());

  const quickAdd = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  // Whether Pexels is configured, asked of the server: the key itself never
  // reaches the browser.
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((config) => setImagesEnabled(config.imagesEnabled !== false))
      .catch(() => setImagesEnabled(false));
  }, []);

  /**
   * The server rejects cycles, so this should always succeed -- but rendering
   * must never crash on unexpected data, so a cycle degrades to "no schedule".
   */
  const schedule = useMemo(() => {
    try {
      return computeSchedule(
        todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          durationDays: todo.durationDays,
          dueDate: todo.dueDate,
          completed: todo.completed,
          dependencyIds: todo.dependencyIds,
        })),
        now
      );
    } catch {
      return null;
    }
  }, [todos, now]);

  const scheduleById = useMemo(() => {
    const map = new Map<number, ScheduledTask>();
    for (const task of schedule?.tasks ?? []) map.set(task.id, task);
    return map;
  }, [schedule]);

  const titleById = useMemo(() => new Map(todos.map((todo) => [todo.id, todo.title])), [todos]);

  // The list works on tasks joined to their schedule, so a view like "critical"
  // is a filter over derived facts rather than a second source of truth.
  const items = useMemo(
    () =>
      todos.map((todo) => {
        const task = scheduleById.get(todo.id);
        const item: ViewItem & { todoId: number } = {
          id: todo.id,
          todoId: todo.id,
          title: todo.title,
          completed: todo.completed,
          dueDate: todo.dueDate,
          createdAt: todo.createdAt,
          isCritical: task?.isCritical ?? false,
          missesDueDate: task?.missesDueDate ?? false,
          earliestStart: task?.earliestStart ?? 0,
        };
        return item;
      }),
    [todos, scheduleById]
  );

  const counts = useMemo(() => countByView(items, now), [items, now]);
  const visible = useMemo(
    () => selectTasks(items, { view, query, sort, now }),
    [items, view, query, sort, now]
  );
  const todoById = useMemo(() => new Map(todos.map((todo) => [todo.id, todo])), [todos]);

  /**
   * The graph is a picture of the work that is left. Finished tasks still shape
   * the schedule -- their dependents keep the start dates they earned -- but
   * drawing them clutters the diagram with work nobody has to look at again.
   */
  const graph = useMemo(() => {
    if (!schedule) return null;

    const open = schedule.tasks.filter((task) => !task.completed);
    if (open.length === 0) return null;

    const shown = new Set(open.map((task) => task.id));
    return {
      tasks: open,
      edges: todos.flatMap((todo) =>
        todo.dependencyIds
          .filter((dependencyId) => shown.has(dependencyId) && shown.has(todo.id))
          .map((dependencyId) => ({ from: dependencyId, to: todo.id }))
      ),
      criticalPath: schedule.criticalPath.filter((id) => shown.has(id)),
    };
  }, [schedule, todos]);

  // Keep the selection on something that still exists and is still on screen.
  useEffect(() => {
    if (selectedId !== null && !visible.some((item) => item.id === selectedId)) {
      setSelectedId(visible[0]?.id ?? null);
    }
  }, [visible, selectedId]);

  const move = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((item) => item.id === selectedId);
      const next = index === -1 ? 0 : Math.min(Math.max(index + delta, 0), visible.length - 1);
      setSelectedId(visible[next].id);
    },
    [visible, selectedId]
  );

  /**
   * Blockers that are still open, per task. A dependency that only moved a date
   * around would be a suggestion; this is what makes it a dependency.
   *
   * Built once per change instead of per row: every row needs its own list, and
   * computing it during the render loop walks the task list once per task.
   */
  const blockedByTitles = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const todo of todos) {
      const open: string[] = [];
      for (const dependencyId of todo.dependencyIds) {
        const blocker = todoById.get(dependencyId);
        if (blocker && !blocker.completed) open.push(blocker.title);
      }
      map.set(todo.id, open);
    }
    return map;
  }, [todos, todoById]);

  /**
   * Only the opened row offers a dropdown, so only the opened row needs the list
   * of tasks it could depend on -- building one per row is the same scan
   * repeated for every task on screen.
   */
  const expandedCandidates = useMemo(() => {
    if (expandedId === null) return NO_CANDIDATES;
    const todo = todoById.get(expandedId);
    if (!todo || todo.completed) return NO_CANDIDATES;

    const already = new Set(todo.dependencyIds);
    return todos.filter(
      (candidate) =>
        // A task still being written has no id to point an edge at, and finished
        // work cannot block anything: the edge would be satisfied on creation.
        candidate.id > 0 &&
        !candidate.completed &&
        candidate.id !== todo.id &&
        !already.has(candidate.id)
    );
  }, [expandedId, todoById, todos]);

  const toggleCompleted = useCallback(
    (id: number) => {
      const todo = todoById.get(id);
      if (!todo) return;
      // The API refuses this too, but the keyboard should not fire off a write
      // it already knows will come back 409.
      if (!todo.completed && (blockedByTitles.get(id)?.length ?? 0) > 0) return;
      void updateTodo(id, { completed: !todo.completed }, { undo: true });
    },
    [todoById, updateTodo, blockedByTitles]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setHelpOpen(false);
        setEditingId(null);
        if (isTypingTarget(event.target)) (event.target as HTMLElement).blur();
        return;
      }

      // Everything below is a bare letter, so it must not fire mid-sentence.
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (paletteOpen || helpOpen) return;

      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'k':
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        // A selected row can still be saving, in which case there is nothing
        // on the server to act on yet.
        case 'x':
          if (selectedId !== null && selectedId > 0) toggleCompleted(selectedId);
          break;
        case 'e':
          if (selectedId !== null && selectedId > 0) setEditingId(selectedId);
          break;
        case 'Enter':
          if (selectedId !== null) setExpandedId((id) => (id === selectedId ? null : selectedId));
          break;
        case 'Backspace':
        case 'Delete':
          // Shift-guarded: a bare Backspace is too easy to hit by accident for
          // something destructive, even with undo behind it.
          if (event.shiftKey && selectedId !== null && selectedId > 0) void deleteTodo(selectedId);
          break;
        case 'c':
          event.preventDefault();
          quickAdd.current?.focus();
          break;
        case '/':
          event.preventDefault();
          search.current?.focus();
          break;
        case 'g':
          setShowGraph((shown) => !shown);
          break;
        case '?':
          setHelpOpen(true);
          break;
        default:
          if (/^[1-5]$/.test(event.key)) setView(VIEWS[Number(event.key) - 1].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move, selectedId, toggleCompleted, deleteTodo, paletteOpen, helpOpen]);

  const commands = useMemo<Command[]>(
    () => [
      ...VIEWS.map((entry, index) => ({
        id: `view-${entry.id}`,
        label: `Go to ${entry.label}`,
        hint: String(index + 1),
        group: 'View',
        run: () => setView(entry.id),
      })),
      {
        id: 'toggle-graph',
        label: showGraph ? 'Hide the dependency graph' : 'Show the dependency graph',
        hint: 'G',
        group: 'View',
        run: () => setShowGraph((shown) => !shown),
      },
      ...SORTS.map((entry) => ({
        id: `sort-${entry.id}`,
        label: `Sort by ${entry.label.toLowerCase()}`,
        group: 'Sort',
        run: () => setSort(entry.id),
      })),
      {
        id: 'add',
        label: 'Add a task',
        hint: 'C',
        group: 'Action',
        run: () => setTimeout(() => quickAdd.current?.focus(), 0),
      },
      {
        id: 'shortcuts',
        label: 'Show keyboard shortcuts',
        hint: '?',
        group: 'Action',
        run: () => setHelpOpen(true),
      },
      ...todos.map((todo) => ({
        id: `todo-${todo.id}`,
        label: todo.title,
        hint: todo.completed ? 'done' : undefined,
        group: 'Task',
        run: () => {
          setView(todo.completed ? 'done' : 'all');
          setQuery('');
          setSelectedId(todo.id);
          setExpandedId(todo.id);
        },
      })),
    ],
    [todos, showGraph]
  );

  const viewMeta = VIEWS.find((entry) => entry.id === view)!;

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <Sidebar
        view={view}
        counts={counts}
        showGraph={showGraph}
        onSelectView={setView}
        onToggleGraph={() => setShowGraph((shown) => !shown)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <main className="flex-grow overflow-y-auto sm:h-screen">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{viewMeta.label}</h2>
              <p className="mt-0.5 text-[13px] text-[var(--ink-3)]">
                {schedule ? summarise(items, schedule.projectDuration, now) : 'Schedule unavailable.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  ref={search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter"
                  aria-label="Filter tasks"
                  className="field w-32 pr-7 sm:w-40"
                />
                <kbd className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  /
                </kbd>
              </div>

              <select
                className="field"
                value={sort}
                aria-label="Sort tasks"
                onChange={(event) => setSort(event.target.value as SortId)}
              >
                {SORTS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className="mb-4">
            <QuickAdd ref={quickAdd} onAdd={addTodo} now={now} />
          </div>

          {loadError && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              <span className="flex-grow">{loadError}</span>
              <button onClick={() => void reload()} className="font-medium hover:underline">
                Retry
              </button>
            </div>
          )}

          {!imagesEnabled && (
            <p className="mb-4 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--ink-3)]">
              Image previews are off. Add <code className="text-[var(--ink-2)]">PEXELS_API_KEY</code> to{' '}
              <code className="text-[var(--ink-2)]">.env</code> and restart to illustrate your tasks.
            </p>
          )}

          {showGraph && graph && (
            <DependencyGraph
              tasks={graph.tasks}
              edges={graph.edges}
              criticalPath={graph.criticalPath}
            />
          )}

          {isLoading && <TaskListSkeleton />}

          {!isLoading && visible.length === 0 && (
            <EmptyState
              view={view}
              query={query}
              hasTasks={todos.length > 0}
              onAdd={() => quickAdd.current?.focus()}
              onClearQuery={() => setQuery('')}
            />
          )}

          <ul className="space-y-2">
            {visible.map((item) => {
              const todo = todoById.get(item.id)!;
              return (
                <TaskRow
                  key={todo.id}
                  todo={todo}
                  task={scheduleById.get(todo.id)}
                  now={now}
                  selected={selectedId === todo.id}
                  expanded={expandedId === todo.id}
                  editing={editingId === todo.id}
                  titleById={titleById}
                  blockedBy={blockedByTitles.get(todo.id) ?? NO_BLOCKERS}
                  candidates={expandedId === todo.id ? expandedCandidates : NO_CANDIDATES}
                  onSelect={() => setSelectedId(todo.id)}
                  onToggleExpanded={() =>
                    setExpandedId((id) => (id === todo.id ? null : todo.id))
                  }
                  onToggleCompleted={() => toggleCompleted(todo.id)}
                  onDelete={() => void deleteTodo(todo.id)}
                  onEdit={(patch) => void updateTodo(todo.id, patch)}
                  onStartEditing={() => setEditingId(todo.id)}
                  onStopEditing={() => setEditingId(null)}
                  onAddDependency={(dependencyId) =>
                    void changeDependency(todo.id, dependencyId, 'POST')
                  }
                  onRemoveDependency={(dependencyId) =>
                    void changeDependency(todo.id, dependencyId, 'DELETE')
                  }
                />
              );
            })}
          </ul>
        </div>
      </main>

      {paletteOpen && (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      )}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** Every empty list says why it is empty and offers the way out of it. */
function EmptyState({
  view,
  query,
  hasTasks,
  onAdd,
  onClearQuery,
}: {
  view: ViewId;
  query: string;
  hasTasks: boolean;
  onAdd: () => void;
  onClearQuery: () => void;
}) {
  if (query.trim() !== '') {
    return (
      <div className="card px-6 py-10 text-center">
        <p className="text-sm text-[var(--ink-2)]">Nothing matches “{query}”.</p>
        <button onClick={onClearQuery} className="mt-2 text-xs text-[var(--accent-ink)] hover:underline">
          Clear the filter
        </button>
      </div>
    );
  }

  const copy: Record<ViewId, { title: string; hint: string }> = {
    all: hasTasks
      ? { title: 'Everything is done.', hint: 'Nice. Add the next thing whenever you like.' }
      : { title: 'Nothing here yet.', hint: 'Try “seal the deck friday 2d” — dates and estimates are read from the sentence.' },
    today: { title: 'Nothing due today.', hint: 'Anything late would show up here too.' },
    upcoming: { title: 'Nothing scheduled.', hint: 'Give a task a due date and it lands here.' },
    critical: { title: 'No task is critical.', hint: 'Chain a few tasks together and the longest path appears here.' },
    done: { title: 'Nothing finished yet.', hint: 'Completed tasks collect here.' },
  };

  return (
    <div className="card px-6 py-10 text-center">
      <p className="text-sm text-[var(--ink-2)]">{copy[view].title}</p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">{copy[view].hint}</p>
      <button onClick={onAdd} className="btn btn-primary mt-4">
        Add a task
      </button>
    </div>
  );
}
