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
  const [showLinearKey, setShowLinearKey] = useState(false);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${draft.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "query { viewer { login } }" }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        data?: { viewer?: { login: string } };
        errors?: Array<{ message: string }>;
      };
      if (data.errors?.length) throw new Error(data.errors[0]?.message ?? "Unknown error");
      const login = data.data?.viewer?.login;
      if (!login) throw new Error("No viewer login in response");
      setTestResult({ ok: true, message: `✓ Authenticated as @${login}` });
    } catch (e) {
      const message =
        e instanceof DOMException && e.name === "AbortError"
          ? "Timeout (10s)"
          : e instanceof Error
            ? e.message
            : String(e);
      setTestResult({ ok: false, message: `✗ ${message}` });
    } finally {
      clearTimeout(timer);
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
                  aria-label={showToken ? "Hide token" : "Show token"}
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
            <h3>Linear</h3>
            <label>
              API Key
              <div className="pat-row">
                <input
                  type={showLinearKey ? "text" : "password"}
                  value={draft.linearApiKey ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, linearApiKey: e.target.value }))}
                  autoComplete="off"
                  placeholder="lin_api_..."
                />
                <button
                  type="button"
                  className="btn btn-ghost pat-toggle"
                  onClick={() => setShowLinearKey((v) => !v)}
                  aria-label={showLinearKey ? "Hide Linear API key" : "Show Linear API key"}
                >
                  {showLinearKey ? "Hide" : "Show"}
                </button>
              </div>
              <small>
                Get your key at https://linear.app/settings/api. Stored only in your browser.
              </small>
            </label>
            <label>
              Team ID (optional)
              <input
                type="text"
                value={draft.linearTeamId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, linearTeamId: e.target.value }))}
                placeholder="Leave blank to use first team on your account"
              />
            </label>
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
