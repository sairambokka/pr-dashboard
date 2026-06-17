import { useEffect, useState } from "react";

import type { Settings } from "../lib/storage";
import { authConfigured, beginLogin } from "../lib/auth";

interface Props {
  settings: Settings;
  viewerLogin: string;
  authError: string | null;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, viewerLogin, authError, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [showLinearKey, setShowLinearKey] = useState(false);

  const signedIn = Boolean(draft.token);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function signOut() {
    setDraft((d) => ({ ...d, token: "" }));
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
          <h2 id="settings-title" style={{ transform: "rotate(-1deg)" }}>Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-group">
            <h3>GitHub</h3>
            <div className="auth-row">
              {signedIn ? (
                <>
                  <span className="test-result ok">
                    ✓ Signed in{viewerLogin ? ` as @${viewerLogin}` : ""}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={signOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => beginLogin()}
                  disabled={!authConfigured()}
                >
                  Sign in with GitHub
                </button>
              )}
            </div>
            {!authConfigured() && (
              <small className="test-result err">
                OAuth not configured — set <code>VITE_GH_CLIENT_ID</code> and{" "}
                <code>VITE_AUTH_WORKER_URL</code> at build time.
              </small>
            )}
            {authError && <small className="test-result err">✗ {authError}</small>}
            <small>
              Authorizes read access to your pull requests via GitHub OAuth. The access token
              is stored only in your browser localStorage.
            </small>
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
            <h3>Activity</h3>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.hideBots ?? true}
                onChange={(e) => setDraft((d) => ({ ...d, hideBots: e.target.checked }))}
              />
              <span>Hide bot activity (Dependabot, github-actions, etc.)</span>
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
