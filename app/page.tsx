"use client"
import { Todo } from '@prisma/client';
import { useCallback, useEffect, useState } from 'react';
import { getDueStatus } from '@/lib/dates';

const MINUTE_MS = 60 * 1000;

const DUE_STATE_CLASS = {
  overdue: 'text-red-600 font-semibold',
  today: 'text-amber-600 font-medium',
  upcoming: 'text-gray-500',
} as const;

export default function Home() {
  const [newTodo, setNewTodo] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Re-render on a timer so a task due today turns red at midnight without a reload.
  const [now, setNow] = useState(() => new Date());

  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Request failed');
      setTodos(await res.json());
    } catch {
      setError('Could not load your todos.');
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo, dueDate: newDueDate || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not add that todo.');
        return;
      }
      setNewTodo('');
      setNewDueDate('');
      fetchTodos();
    } catch {
      setError('Could not add that todo.');
    }
  };

  const handleDeleteTodo = async (id: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Request failed');
      fetchTodos();
    } catch {
      setError('Could not delete that todo.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-red-500 flex flex-col items-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-center text-white mb-8">Things To Do App</h1>

        <div className="flex mb-2">
          <input
            type="text"
            className="flex-grow p-3 rounded-l-full focus:outline-none text-gray-700"
            placeholder="Add a new todo"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
          />
          <button
            onClick={handleAddTodo}
            className="bg-white text-indigo-600 p-3 rounded-r-full hover:bg-gray-100 transition duration-300"
          >
            Add
          </button>
        </div>

        <div className="flex items-center gap-2 mb-2 text-white">
          <label htmlFor="due-date" className="text-sm">
            Due date
          </label>
          <input
            id="due-date"
            type="date"
            className="p-2 rounded text-gray-700"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
          />
          {newDueDate && (
            <button
              onClick={() => setNewDueDate('')}
              className="text-sm underline opacity-80 hover:opacity-100"
            >
              Clear
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-white bg-red-700 bg-opacity-80 rounded p-2">
            {error}
          </p>
        )}

        <ul className="mt-4">
          {todos.map((todo) => {
            const due = todo.dueDate ? getDueStatus(todo.dueDate, now) : null;
            return (
              <li
                key={todo.id}
                className="flex justify-between items-center bg-white bg-opacity-90 p-4 mb-4 rounded-lg shadow-lg"
              >
                <div className="flex flex-col">
                  <span className="text-gray-800">{todo.title}</span>
                  {due && todo.dueDate && (
                    <time
                      dateTime={new Date(todo.dueDate).toISOString().slice(0, 10)}
                      className={`text-sm ${DUE_STATE_CLASS[due.state]}`}
                    >
                      {due.label}
                    </time>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  className="text-red-500 hover:text-red-700 transition duration-300"
                  aria-label={`Delete ${todo.title}`}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
