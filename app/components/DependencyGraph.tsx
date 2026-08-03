"use client"
import { ScheduledTask } from '@/lib/scheduling';

interface Props {
  tasks: ScheduledTask[];
  edges: Array<{ from: number; to: number }>;
  criticalPath: number[];
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 52;
const COLUMN_GAP = 70;
const ROW_GAP = 18;
const PADDING = 16;

/**
 * Layered DAG drawing. Tasks sit in the column matching their depth (which the
 * scheduler already computed via topological order), so every edge points
 * strictly left-to-right and no arrow ever travels backwards.
 */
export default function DependencyGraph({ tasks, edges, criticalPath }: Props) {
  if (tasks.length === 0) return null;

  const columns = new Map<number, ScheduledTask[]>();
  for (const task of tasks) {
    const column = columns.get(task.depth) ?? [];
    column.push(task);
    columns.set(task.depth, column);
  }

  const positions = new Map<number, { x: number; y: number }>();
  columns.forEach((column, depth) => {
    column.forEach((task, row) => {
      positions.set(task.id, {
        x: PADDING + depth * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  const width = PADDING * 2 + columns.size * NODE_WIDTH + (columns.size - 1) * COLUMN_GAP;
  const tallest = Math.max(...Array.from(columns.values(), (column) => column.length));
  const height = PADDING * 2 + tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP;

  const criticalEdge = new Set(
    criticalPath.slice(0, -1).map((id, index) => `${id}->${criticalPath[index + 1]}`)
  );

  return (
    <section className="rounded-lg bg-white shadow-lg p-4 mb-4 overflow-x-auto">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800">Dependency graph</h2>
        <span className="text-xs text-gray-500">
          <span className="inline-block w-3 h-[2px] bg-red-500 align-middle mr-1.5" />
          critical path
        </span>
      </div>

      <svg width={width} height={height} role="img" aria-label="Task dependency graph">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#9ca3af" />
          </marker>
          <marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill="#ef4444" />
          </marker>
        </defs>

        {edges.map(({ from, to }) => {
          const start = positions.get(from);
          const end = positions.get(to);
          if (!start || !end) return null;

          const x1 = start.x + NODE_WIDTH;
          const y1 = start.y + NODE_HEIGHT / 2;
          const x2 = end.x;
          const y2 = end.y + NODE_HEIGHT / 2;
          const midpoint = (x1 + x2) / 2;
          const critical = criticalEdge.has(`${from}->${to}`);

          return (
            <path
              key={`${from}->${to}`}
              d={`M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={critical ? '#ef4444' : '#9ca3af'}
              strokeWidth={critical ? 2 : 1.25}
              markerEnd={`url(#${critical ? 'arrow-critical' : 'arrow'})`}
            />
          );
        })}

        {tasks.map((task) => {
          const position = positions.get(task.id)!;
          return (
            <g key={task.id} transform={`translate(${position.x}, ${position.y})`}>
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill={task.isCritical ? '#fef2f2' : '#f9fafb'}
                stroke={task.isCritical ? '#ef4444' : '#d1d5db'}
                strokeWidth={task.isCritical ? 1.75 : 1}
              />
              <text x={12} y={21} fill="#111827" fontSize={12}>
                {task.title.length > 20 ? `${task.title.slice(0, 19)}\u2026` : task.title}
              </text>
              <text x={12} y={38} fill="#6b7280" fontSize={10}>
                day {task.earliestStart}
                {'\u2013'}
                {task.earliestFinish}
                {task.slack > 0 ? ` \u00b7 ${task.slack}d slack` : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
