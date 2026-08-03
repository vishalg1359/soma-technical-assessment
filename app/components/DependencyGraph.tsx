"use client"
import { ScheduledTask } from '@/lib/scheduling';

interface Props {
  tasks: ScheduledTask[];
  edges: Array<{ from: number; to: number }>;
  criticalPath: number[];
}

const NODE_WIDTH = 158;
const NODE_HEIGHT = 54;
const COLUMN_GAP = 72;
const ROW_GAP = 16;
const PADDING = 16;

const CRITICAL = '#f59e0b';
const EDGE = '#3b414f';

/**
 * Layered DAG drawing of the work that is left. Tasks sit in the column
 * matching their depth (which the scheduler already computed via topological
 * order), so every edge points strictly left-to-right and no arrow ever
 * travels backwards.
 */
export default function DependencyGraph({ tasks, edges, criticalPath }: Props) {
  if (tasks.length === 0) return null;

  const columns = new Map<number, ScheduledTask[]>();
  for (const task of tasks) {
    const column = columns.get(task.depth) ?? [];
    column.push(task);
    columns.set(task.depth, column);
  }

  // Depths can have gaps once finished work is left out, so columns are ranked
  // rather than indexed by depth -- otherwise the drawing keeps an empty lane.
  const ranks = new Map(
    Array.from(columns.keys())
      .sort((a, b) => a - b)
      .map((depth, rank) => [depth, rank])
  );

  const positions = new Map<number, { x: number; y: number }>();
  columns.forEach((column, depth) => {
    column.forEach((task, row) => {
      positions.set(task.id, {
        x: PADDING + ranks.get(depth)! * (NODE_WIDTH + COLUMN_GAP),
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
    <section className="card mb-6 overflow-x-auto p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Dependency graph</h2>
        <span className="flex items-center gap-3 text-[11px] text-[var(--ink-3)]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-3" style={{ background: CRITICAL }} />
            critical path
          </span>
        </span>
      </div>

      <svg width={width} height={height} role="img" aria-label="Task dependency graph">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill={EDGE} />
          </marker>
          <marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L7,3 z" fill={CRITICAL} />
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
              stroke={critical ? CRITICAL : EDGE}
              strokeWidth={critical ? 2 : 1.25}
              markerEnd={`url(#${critical ? 'arrow-critical' : 'arrow'})`}
            />
          );
        })}

        {tasks.map((task) => {
          const position = positions.get(task.id)!;
          const accent = task.isCritical ? CRITICAL : null;

          return (
            <g key={task.id} transform={`translate(${position.x}, ${position.y})`}>
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill="#1b1e25"
                stroke={accent ?? '#333844'}
                strokeWidth={accent ? 1.5 : 1}
              />
              {accent && <rect width={3} height={NODE_HEIGHT} rx={1.5} fill={accent} />}

              <text x={14} y={22} fill="#e8eaef" fontSize={12}>
                {task.title.length > 20 ? `${task.title.slice(0, 19)}\u2026` : task.title}
              </text>
              <text x={14} y={39} fill="#6f7684" fontSize={10}>
                {`day ${task.earliestStart}\u2013${task.earliestFinish}${
                  task.slack > 0 ? ` \u00b7 ${task.slack}d slack` : ''
                }`}
              </text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
