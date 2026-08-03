"use client"

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['J', 'K'], label: 'Move between tasks' },
  { keys: ['X'], label: 'Complete or reopen' },
  { keys: ['E'], label: 'Rename in place' },
  { keys: ['\u21b5'], label: 'Expand the selected task' },
  { keys: ['\u21e7', '\u232b'], label: 'Delete the selected task' },
  { keys: ['C'], label: 'Add a task' },
  { keys: ['/'], label: 'Search' },
  { keys: ['1', '\u2026', '5'], label: 'Switch view' },
  { keys: ['G'], label: 'Show or hide the graph' },
  { keys: ['\u2318', 'K'], label: 'Command palette' },
  { keys: ['?'], label: 'This list' },
  { keys: ['esc'], label: 'Close, cancel, deselect' },
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="Keyboard shortcuts"
    >
      <div
        className="pop card w-full max-w-md p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-medium">Keyboard shortcuts</h2>

        <dl className="grid gap-2 text-[13px]">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex items-center gap-3">
              <dt className="flex w-24 shrink-0 gap-1">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className="kbd">
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd className="text-[var(--ink-2)]">{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
