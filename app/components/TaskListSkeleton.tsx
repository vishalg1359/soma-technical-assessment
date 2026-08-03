const ROW_WIDTHS = ['w-2/5', 'w-1/2', 'w-1/3', 'w-2/5'];

export default function TaskListSkeleton() {
  return (
    <ul aria-hidden className="space-y-2">
      {ROW_WIDTHS.map((width, index) => (
        <li key={index} className="card animate-pulse px-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="h-[18px] w-[18px] shrink-0 rounded-full bg-[var(--surface-2)]" />
            <div className="h-9 w-12 shrink-0 rounded-md bg-[var(--surface-2)]" />
            <div className="flex flex-grow flex-col gap-1.5">
              <div className={`h-3.5 rounded bg-[var(--surface-2)] ${width}`} />
              <div className="h-2.5 w-32 rounded bg-[var(--surface-2)]" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
