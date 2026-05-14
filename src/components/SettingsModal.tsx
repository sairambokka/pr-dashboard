import { useEffect, useRef, useState } from "react";

import type { Settings } from "../lib/storage";

interface TestResult {
  ok: boolean;
  message: string;
}

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const patRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    patRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleTokenChange(value: string) {
    setDraft((d) => ({ ...d, token: value }));
    setTestResult(null);
  }

  function handleOwnerChange(value: string) {
    setDraft((d) => ({ ...d, owner: value }));
    setTestResult(null);
  }

  function handleRepoChange(value: string) {
    setDraft((d) => ({ ...d, repo: value }));
    setTestResult(null);
  }

  async function testConnection() {
    setTestResult({ ok: false, message: "Testing…" });
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${draft.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "query { viewer { login } }" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        data?: { viewer?: { login?: string } };
        errors?: { message?: string }[];
      };
      if (data.errors) throw new Error(data.errors[0]?.message ?? "Unknown error");
      setTestResult({ ok: true, message: `✓ Authenticated as @${data.data?.viewer?.login ?? "?"}` });
    } catch (e) {
      setTestResult({ ok: false, message: `✗ ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="modal-header">
          <h2 id="settings-title">Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-group">
            <h3>GitHub</h3>
            <label>
              Personal Access Token
              <div className="pat-row">
                <input
                  ref={patRef}
                  type={showToken ? "text" : "password"}
                  value={draft.token}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  placeholder="github_pat_…"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-ghost pat-toggle"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? "Hide" : "Show"}
                </button>
              </div>
              <small>
                Fine-grained PAT with the repo&apos;s <code>Pull requests: Read</code> permission.
                Stored only in your browser localStorage.
              </small>
            </label>
            <label>
              Repo owner
              <input
                type="text"
                value={draft.owner}
                onChange={(e) => handleOwnerChange(e.target.value)}
                placeholder="corca-ai"
              />
            </label>
            <label>
              Repo name
              <input
                type="text"
                value={draft.repo}
                onChange={(e) => handleRepoChange(e.target.value)}
                placeholder="corca-app"
              />
            </label>
            <div className="test-connection-row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void testConnection()}
                disabled={!draft.token}
              >
                Test connection
              </button>
              {testResult && (
                <span className={`test-result ${testResult.ok ? "ok" : "err"}`}>
                  {testResult.message}
                </span>
              )}
            </div>
          </section>

          <section className="settings-group">
            <h3>Polling</h3>
            <label>
              Interval (seconds)
              <input
                type="number"
                min={15}
                value={draft.intervalSec}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    intervalSec: Math.max(15, Number(e.target.value) || 60),
                  }))
                }
              />
            </label>
          </section>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
