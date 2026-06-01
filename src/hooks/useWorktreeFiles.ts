import { useCallback, useEffect } from "react";
import { useWorktreeFilesStore } from "../stores/worktreeFilesStore";

// Stable empty references so consumers reading "no entry" state don't get
// fresh array identities on every render.
const EMPTY: string[] = [];

export function attachWorktreeFocusRefresh(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
  worktreePath: string,
  refresh: (options?: { includeIgnored?: boolean }) => Promise<void>,
): () => void {
  const handleFocus = () => {
    // Returning to the window is our cheap "catch up after missed watcher
    // events" path. Refresh tracked paths only; ignored scans are much more
    // expensive and are handled by the store's TTL / force rules.
    void refresh({ includeIgnored: false });
  };

  target.addEventListener("focus", handleFocus);
  return () => {
    target.removeEventListener("focus", handleFocus);
  };
}

export function useWorktreeFiles(worktreePath: string | null) {
  const paths = useWorktreeFilesStore((s) =>
    worktreePath ? (s.byWorktree[worktreePath]?.paths ?? EMPTY) : EMPTY,
  );
  const ignoredPaths = useWorktreeFilesStore((s) =>
    worktreePath ? (s.byWorktree[worktreePath]?.ignoredPaths ?? EMPTY) : EMPTY,
  );
  const loadedIgnoredDirs = useWorktreeFilesStore((s) =>
    worktreePath
      ? (s.byWorktree[worktreePath]?.loadedIgnoredDirs ?? EMPTY)
      : EMPTY,
  );

  // Acquire/release ref counts the worktree in the store so the watcher
  // subscription is shared across consumers and survives a tab toggle that
  // unmounts and immediately remounts this component.
  useEffect(() => {
    if (!worktreePath) return;
    const store = useWorktreeFilesStore.getState();
    store.acquire(worktreePath);
    return () => {
      useWorktreeFilesStore.getState().release(worktreePath);
    };
  }, [worktreePath]);

  const refresh = useCallback((options?: { includeIgnored?: boolean }) => {
    if (!worktreePath) return Promise.resolve();
    return useWorktreeFilesStore.getState().refresh(worktreePath, options);
  }, [worktreePath]);

  useEffect(() => {
    if (!worktreePath) return;
    // Keep the focus fallback scoped to the currently mounted worktree instead
    // of broadcasting a synthetic directory change to every watched tree.
    return attachWorktreeFocusRefresh(window, worktreePath, refresh);
  }, [worktreePath, refresh]);

  return { paths, ignoredPaths, loadedIgnoredDirs, refresh };
}
