const ROW_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3'];

/** Placeholder rows shaped like real task cards, shown during the first load. */
export default function TaskListSkeleton() {
  return (
    <ul aria-hidden>
      {ROW_WIDTHS.map((width, index) => (
        <li
          key={index}
          className="flex items-center gap-3 bg-white bg-opacity-60 p-4 mb-4 rounded-lg shadow-lg animate-pulse"
        >
          <div className="w-28 h-20 shrink-0 rounded-md bg-gray-300" />
          <div className="flex flex-col flex-grow gap-2">
            <div className={`h-4 rounded bg-gray-300 ${width}`} />
            <div className="h-3 w-24 rounded bg-gray-200" />
          </div>
        </li>
      ))}
    </ul>
  );
}
