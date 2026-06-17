import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchViewerLogin } from "./lib/github";
import { loadSettings, saveSettings, type Settings } from "./lib/storage";
import { useRoute, goHome } from "./lib/router";
import { handleCallback, beginLogin } from "./lib/auth";
import { CheatsheetOverlay } from "./components/CheatsheetOverlay";
import { SettingsModal } from "./components/SettingsModal";
import { LandingPage } from "./components/LandingPage";
import { RepoHome } from "./components/RepoHome";
import { RepoWorkspace } from "./components/RepoWorkspace";
import "./App.css";

const REPO_HOME_POLL_MS = 60_000;

export default function App() {
  const route = useRoute();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Exchange OAuth code for token on first load after GitHub redirect
  useEffect(() => {
    void handleCallback()
      .then((token) => {
        if (!token) return;
        setSettings((prev) => {
          const next = { ...prev, token };
          saveSettings(next);
          return next;
        });
      })
      .catch((e: unknown) => {
        setAuthError(e instanceof Error ? e.message : String(e));
        setShowSettings(true);
      });
  }, []);

  // Fetch viewer login once so RepoHome can render
  const { data: viewerLogin } = useQuery({
    queryKey: ["viewerLogin", settings.token],
    queryFn: () => fetchViewerLogin(settings.token),
    enabled: Boolean(settings.token),
    staleTime: 5 * 60_000,
  });

  // Determine which view to render
  const hasToken = Boolean(settings.token);

  // Shared modals rendered at app level so they work on every view
  const sharedModals = (
    <>
      {showSettings && (
        <SettingsModal
          settings={settings}
          viewerLogin={viewerLogin ?? ""}
          authError={authError}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showCheatsheet && (
        <CheatsheetOverlay open={showCheatsheet} onClose={() => setShowCheatsheet(false)} />
      )}
    </>
  );

  // Not signed in — show landing page (LandingPage renders its own topbar)
  if (!hasToken) {
    return (
      <>
        {sharedModals}
        <LandingPage onSignIn={beginLogin} />
      </>
    );
  }

  // Repo workspace route — the main working view
  if (route.name === "repo") {
    return (
      <>
        {sharedModals}
        <div className="app">
          {/* Brand / home link lives at App level so it works on all authenticated views */}
          <div className="topbar-brand-row" style={{ position: "absolute", top: 0, left: 0, padding: "12px 16px", zIndex: 10 }}>
            <button
              className="brand -rotate-1"
              style={{ background: "none", border: "none", cursor: "pointer" }}
              onClick={goHome}
              aria-label="Go to mission control home"
            >
              <span className="brand-mark" aria-hidden />
              PR.DASHBOARD
            </button>
          </div>
          <RepoWorkspace
            token={settings.token}
            owner={route.owner}
            repo={route.repo}
            tab={route.tab}
            settings={settings}
            setShowSettings={setShowSettings}
            intervalMs={settings.intervalSec * 1000}
            onCheatsheet={() => setShowCheatsheet(true)}
          />
        </div>
      </>
    );
  }

  // Home / callback (callback hash is cleaned up by handleCallback before re-render)
  // Default authenticated view is RepoHome (mission control)
  return (
    <>
      {sharedModals}
      <div className="app">
        <header className="topbar">
          <div className="topbar-row">
            <div className="brand -rotate-1">
              <span className="brand-mark" aria-hidden />
              PR.DASHBOARD
            </div>
            {viewerLogin && <span className="user-tag">{viewerLogin}</span>}
            <div className="topbar-actions">
              <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            </div>
          </div>
        </header>
        <RepoHome
          token={settings.token}
          viewerLogin={viewerLogin ?? ""}
          intervalMs={REPO_HOME_POLL_MS}
        />
      </div>
    </>
  );
}
