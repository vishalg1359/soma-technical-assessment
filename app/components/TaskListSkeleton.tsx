const ROW_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3'];

/** Placeholder rows shaped like real task cards, shown during the first load. */
export default function TaskListSkeleton() {
  return (
    <ul aria-hidden className="space-y-4">
      {ROW_WIDTHS.map((width, index) => (
        <li
          key={index}
          className="rounded-lg bg-white shadow-lg animate-pulse"
        >
          <div className="flex items-start gap-3 p-4">
            <div className="h-20 w-28 shrink-0 rounded-md bg-gray-200" />
            <div className="flex flex-grow flex-col gap-2">
              <div className={`h-4 rounded bg-gray-200 ${width}`} />
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-3 w-40 rounded bg-gray-100" />
            </div>
          </div>
          <div className="border-t border-gray-200 px-4 py-2">
            <div className="h-3 w-32 rounded bg-gray-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
