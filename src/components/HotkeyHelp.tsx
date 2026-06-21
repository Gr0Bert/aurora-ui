import { useEffect } from "react";

// Keep in sync with the handlers in App, ThreadView, and DebugDrawer.
const SECTIONS: { label: string; rows: [string, string][] }[] = [
  {
    label: "Global",
    rows: [
      ["n", "New thread"],
      ["J / K", "Next / previous thread"],
      ["`", "Toggle sidebar"],
      ["?", "Toggle this help"],
      ["Esc", "Blur input / close drawer"],
    ],
  },
  {
    label: "Thread",
    rows: [
      ["/", "Focus the composer"],
      ["Enter", "Send message"],
      ["Shift+Enter", "New line"],
      ["d", "Toggle debug drawer"],
      ["j / k", "Select previous / next run"],
    ],
  },
  {
    label: "Debug drawer",
    rows: [
      ["j / k", "Move between journal rows"],
      ["Enter", "Expand row / toggle subrun"],
      ["[ / ]", "Previous / next revision"],
      ["r / R", "Resume / restart run"],
      ["s", "Stop run"],
      ["y / x", "Approve / deny first task"],
    ],
  },
];

export function HotkeyHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="hotkey-overlay" onClick={onClose}>
      <div className="hotkey-panel" onClick={(e) => e.stopPropagation()}>
        <div className="hotkey-panel-header">
          <span>Keyboard shortcuts</span>
          <button className="hotkey-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {SECTIONS.map((section) => (
          <div className="hotkey-section" key={section.label}>
            <div className="hotkey-section-label">{section.label}</div>
            {section.rows.map(([keys, desc]) => (
              <div className="hotkey-row" key={keys}>
                <kbd>{keys}</kbd>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
