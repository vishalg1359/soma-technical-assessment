"use client"
import { useCallback, useEffect, useRef, useState } from 'react';
import { TodoWithDependencies } from '@/lib/types';
import { useToast } from '../components/Toaster';

const IMAGE_POLL_MS = 1500;

export interface TodoDraft {
  title: string;
  dueDate: string | null;
  durationDays: number;
}

export type TodoPatch = Partial<Pick<TodoWithDependencies, 'title' | 'completed' | 'durationDays'>> & {
  dueDate?: string | null;
};

const isAwaitingImage = (todo: TodoWithDependencies) =>
  todo.imageStatus === 'pending' || todo.imageStatus === 'resolving';

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body && typeof body.error === 'string' ? body.error : fallback;
}

/**
 * Owns the task list and every mutation on it.
 *
 * Writes are optimistic: the UI moves on the click and rolls back if the server
 * disagrees, because a planner that pauses on every keystroke stops feeling
 * like a list and starts feeling like a form.
 */
export function useTodos() {
  const [todos, setTodos] = useState<TodoWithDependencies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextPendingId = useRef(0);
  const { notify } = useToast();

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Request failed');

      const payload = await res.json();
      // Guard the shape: a misrouted or errored endpoint should surface a
      // message, not crash the render with `todos.map is not a function`.
      if (!Array.isArray(payload)) throw new Error('Unexpected response shape');

      setTodos(payload);
      setLoadError(null);
    } catch {
      setLoadError('Could not reach the server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Poll only while an image search is still outstanding, then stop. The timer
  // deliberately outlives each render -- it is started and stopped by whether
  // any image is still pending, not by the effect re-running -- so tearing it
  // down belongs in an unmount-only effect rather than in this one's cleanup.
  useEffect(() => {
    const waiting = todos.some(isAwaitingImage);

    if (waiting && !pollTimer.current) {
      pollTimer.current = setInterval(reload, IMAGE_POLL_MS);
    }
    if (!waiting && pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, [todos, reload]);

  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    },
    []
  );

  const addTodo = useCallback(
    async (draft: TodoDraft): Promise<boolean> => {
      // The row appears on the keystroke, under a temporary negative id that
      // cannot collide with a real one, and is swapped for the saved task when
      // the server answers. Waiting on the round trip to show it is the
      // difference between a list and a form.
      //
      // A counter, not a timestamp: two tasks added inside the same millisecond
      // would share a `-Date.now()`, which collides as a React key and makes one
      // server response replace both rows.
      const pendingId = --nextPendingId.current;
      const pending: TodoWithDependencies = {
        id: pendingId,
        title: draft.title,
        dueDate: toDate(draft.dueDate),
        durationDays: draft.durationDays,
        completed: false,
        imageUrl: null,
        imageAlt: null,
        imageCredit: null,
        imageStatus: 'pending',
        imageCheckedAt: null,
        createdAt: new Date(),
        dependencyIds: [],
      };
      setTodos((current) => [pending, ...current]);

      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) {
          setTodos((current) => current.filter((todo) => todo.id !== pendingId));
          notify(await readError(res, 'Could not add that task.'), { tone: 'error' });
          return false;
        }

        const created: TodoWithDependencies = await res.json();
        setTodos((current) => current.map((todo) => (todo.id === pendingId ? created : todo)));
        return true;
      } catch {
        setTodos((current) => current.filter((todo) => todo.id !== pendingId));
        notify('Could not add that task.', { tone: 'error' });
        return false;
      }
    },
    [notify]
  );

  const updateTodo = useCallback(
    async (id: number, patch: TodoPatch, options?: { undo?: boolean }) => {
      let previous: TodoWithDependencies | undefined;
      setTodos((current) =>
        current.map((todo) => {
          if (todo.id !== id) return todo;
          previous = todo;
          return { ...todo, ...patch, dueDate: 'dueDate' in patch ? toDate(patch.dueDate) : todo.dueDate };
        })
      );

      try {
        const res = await fetch(`/api/todos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(await readError(res, 'Could not save that change.'));

        const saved: TodoWithDependencies = await res.json();
        setTodos((current) => current.map((todo) => (todo.id === id ? saved : todo)));

        if (options?.undo && previous) {
          const restore = previous;
          notify(patch.completed ? 'Task completed.' : 'Task reopened.', {
            action: {
              label: 'Undo',
              run: () => void updateTodo(id, { completed: restore.completed }),
            },
          });
        }
      } catch (error) {
        if (previous) {
          const restore = previous;
          setTodos((current) => current.map((todo) => (todo.id === id ? restore : todo)));
        }
        notify(error instanceof Error ? error.message : 'Could not save that change.', {
          tone: 'error',
        });
      }
    },
    [notify]
  );

  /**
   * Puts a deleted task back with the whole shape of its place in the graph:
   * the blockers it waited on *and* the tasks that were waiting on it. Deleting
   * cascades edges away in both directions, so restoring only the first kind
   * hands back a task that no longer blocks anything -- the list looks right
   * and the schedule is quietly wrong.
   *
   * It returns with a new id: nothing user-facing depends on the old one, and
   * the alternative is a delete you cannot take back.
   *
   * Order matters. A completed task must be marked complete *before* the tasks
   * it blocked are re-attached, because the API refuses an edge that would put
   * a finished task behind unfinished work.
   */
  const restore = useCallback(
    async (removed: TodoWithDependencies, dependentIds: number[]) => {
      try {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: removed.title,
            dueDate: removed.dueDate ? new Date(removed.dueDate).toISOString().slice(0, 10) : null,
            durationDays: removed.durationDays,
          }),
        });
        if (!res.ok) throw new Error('Request failed');

        const created: TodoWithDependencies = await res.json();
        const edge = (dependentId: number, dependencyId: number) =>
          fetch(`/api/todos/${dependentId}/dependencies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dependencyId }),
          });

        const blockers = await Promise.all(
          removed.dependencyIds.map((dependencyId) => edge(created.id, dependencyId))
        );

        if (removed.completed) {
          await fetch(`/api/todos/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: true }),
          });
        }

        const blocked = await Promise.all(
          dependentIds.map((dependentId) => edge(dependentId, created.id))
        );

        await reload();

        // A task can be deleted while this is in flight, so a restore can come
        // back incomplete. Say so rather than leaving a silently thinner graph.
        const lost = [...blockers, ...blocked].filter((response) => !response.ok).length;
        if (lost > 0) {
          notify(`Restored \u201c${removed.title}\u201d, but ${lost} link could not be put back.`, {
            tone: 'error',
          });
        }
      } catch {
        notify('Could not restore that task.', { tone: 'error' });
      }
    },
    [notify, reload]
  );

  const deleteTodo = useCallback(
    async (id: number) => {
      const previous = todos;
      const removed = todos.find((todo) => todo.id === id);
      // Captured before the delete: afterwards the cascade has erased them.
      const dependentIds = todos
        .filter((todo) => todo.dependencyIds.includes(id))
        .map((todo) => todo.id);
      setTodos((current) => current.filter((todo) => todo.id !== id));

      try {
        const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Request failed');

        if (removed) {
          notify(`Deleted \u201c${removed.title}\u201d.`, {
            action: { label: 'Undo', run: () => void restore(removed, dependentIds) },
          });
        }
        await reload();
      } catch {
        setTodos(previous);
        notify('Could not delete that task.', { tone: 'error' });
      }
    },
    [todos, notify, reload, restore]
  );

  /**
   * Optimistic like every other write. The whole schedule is derived from these
   * ids on the client, so adding a blocker redraws the graph, the critical path
   * and every start date on the spot -- and puts them all back if the server
   * refuses the edge, which it does for cycles and for finished tasks.
   */
  const changeDependency = useCallback(
    async (dependentId: number, dependencyId: number, method: 'POST' | 'DELETE') => {
      const apply = (ids: number[]) =>
        method === 'POST'
          ? ids.includes(dependencyId)
            ? ids
            : [...ids, dependencyId]
          : ids.filter((id) => id !== dependencyId);

      let previous: number[] | undefined;
      setTodos((current) =>
        current.map((todo) => {
          if (todo.id !== dependentId) return todo;
          previous = todo.dependencyIds;
          return { ...todo, dependencyIds: apply(todo.dependencyIds) };
        })
      );

      const rollback = () => {
        if (!previous) return;
        const restored = previous;
        setTodos((current) =>
          current.map((todo) =>
            todo.id === dependentId ? { ...todo, dependencyIds: restored } : todo
          )
        );
      };

      try {
        const res = await fetch(`/api/todos/${dependentId}/dependencies`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dependencyId }),
        });
        if (!res.ok) {
          rollback();
          notify(await readError(res, 'Could not update dependencies.'), { tone: 'error' });
        }
      } catch {
        rollback();
        notify('Could not update dependencies.', { tone: 'error' });
      }
    },
    [notify]
  );

  return {
    todos,
    isLoading,
    loadError,
    reload,
    addTodo,
    updateTodo,
    deleteTodo,
    changeDependency,
  };
}

/** The list holds dates the way the API returns them, so a patch must match. */
const toDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;
