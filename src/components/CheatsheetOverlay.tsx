import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CheatsheetOverlay({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <header className="modal-header">
          <h2>Keyboard shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <table className="cheatsheet-table">
            <tbody>
              <tr>
                <td>
                  <kbd>R</kbd>
                </td>
                <td>Refresh active tab</td>
              </tr>
              <tr>
                <td>
                  <kbd>1</kbd>
                </td>
                <td>PRs tab</td>
              </tr>
              <tr>
                <td>
                  <kbd>2</kbd>
                </td>
                <td>Activity tab</td>
              </tr>
              <tr>
                <td>
                  <kbd>3</kbd>
                </td>
                <td>Insights tab</td>
              </tr>
              <tr>
                <td>
                  <kbd>4</kbd>
                </td>
                <td>Linear tab</td>
              </tr>
              <tr>
                <td>
                  <kbd>,</kbd>
                </td>
                <td>Open settings</td>
              </tr>
              <tr>
                <td>
                  <kbd>?</kbd>
                </td>
                <td>Show this cheatsheet</td>
              </tr>
              <tr>
                <td>
                  <kbd>Esc</kbd>
                </td>
                <td>Close modals</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
