import { useEffect } from "react";

interface Handlers {
  onRefresh?: () => void;
  onTab?: (tab: "prs" | "activity" | "insights" | "linear") => void;
  onSettings?: () => void;
  onCheatsheet?: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "r":
        case "R":
          handlers.onRefresh?.();
          e.preventDefault();
          break;
        case "1":
          handlers.onTab?.("prs");
          e.preventDefault();
          break;
        case "2":
          handlers.onTab?.("activity");
          e.preventDefault();
          break;
        case "3":
          handlers.onTab?.("insights");
          e.preventDefault();
          break;
        case "4":
          handlers.onTab?.("linear");
          e.preventDefault();
          break;
        case ",":
          handlers.onSettings?.();
          e.preventDefault();
          break;
        case "?":
          handlers.onCheatsheet?.();
          e.preventDefault();
          break;
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handlers]);
}
