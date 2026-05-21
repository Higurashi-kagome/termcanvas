import { create } from "zustand";

export const LEFT_PANEL_UI_STATE_STORAGE_KEY =
  "termcanvas:left-panel-ui-state:v1";

interface LeftPanelUiStateData {
  version: 1;
  sessions: {
    projectCollapsedByPath: Record<string, boolean>;
    worktreeCollapsedByPath: Record<string, boolean>;
  };
  history: {
    projectCollapsedByPath: Record<string, boolean>;
  };
}

interface PruneArgs {
  sessionProjectPaths: readonly string[];
  sessionWorktreePaths: readonly string[];
  historyProjectPaths: readonly string[];
}

interface LeftPanelUiStateStore extends LeftPanelUiStateData {
  isSessionProjectCollapsed: (projectPath: string) => boolean;
  isSessionWorktreeCollapsed: (worktreePath: string) => boolean;
  isHistoryProjectCollapsed: (projectPath: string) => boolean;
  toggleSessionProject: (projectPath: string) => void;
  toggleSessionWorktree: (worktreePath: string) => void;
  toggleHistoryProject: (projectPath: string) => void;
  prune: (args: PruneArgs) => void;
}

const DEFAULT_DATA: LeftPanelUiStateData = {
  version: 1,
  sessions: {
    projectCollapsedByPath: {},
    worktreeCollapsedByPath: {},
  },
  history: {
    projectCollapsedByPath: {},
  },
};

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};

  const out: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (typeof raw === "boolean") out[key] = raw;
  }
  return out;
}

function readStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  const candidate = (
    globalThis as {
      localStorage?: { getItem?: unknown; setItem?: unknown };
    }
  ).localStorage;

  if (
    candidate &&
    typeof candidate.getItem === "function" &&
    typeof candidate.setItem === "function"
  ) {
    return candidate as Pick<Storage, "getItem" | "setItem">;
  }

  return null;
}

function loadState(): LeftPanelUiStateData {
  const storage = readStorage();
  if (!storage) return DEFAULT_DATA;

  try {
    const raw = storage.getItem(LEFT_PANEL_UI_STATE_STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 1) return DEFAULT_DATA;

    const sessions =
      parsed.sessions && typeof parsed.sessions === "object"
        ? (parsed.sessions as Record<string, unknown>)
        : {};
    const history =
      parsed.history && typeof parsed.history === "object"
        ? (parsed.history as Record<string, unknown>)
        : {};

    return {
      version: 1,
      sessions: {
        projectCollapsedByPath: sanitizeBooleanRecord(
          sessions.projectCollapsedByPath,
        ),
        worktreeCollapsedByPath: sanitizeBooleanRecord(
          sessions.worktreeCollapsedByPath,
        ),
      },
      history: {
        projectCollapsedByPath: sanitizeBooleanRecord(
          history.projectCollapsedByPath,
        ),
      },
    };
  } catch {
    return DEFAULT_DATA;
  }
}

function persistState(data: LeftPanelUiStateData): void {
  const storage = readStorage();
  if (!storage) return;

  try {
    storage.setItem(LEFT_PANEL_UI_STATE_STORAGE_KEY, JSON.stringify(data));
  } catch {
  }
}

function toggleRecordValue(
  record: Record<string, boolean>,
  key: string,
): Record<string, boolean> {
  return { ...record, [key]: !record[key] };
}

function pruneRecord(
  record: Record<string, boolean>,
  allowed: ReadonlySet<string>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(record)) {
    if (allowed.has(key)) out[key] = value;
  }
  return out;
}

const initialState = loadState();

export const useLeftPanelUiStateStore = create<LeftPanelUiStateStore>(
  (set, get) => ({
    ...initialState,

    isSessionProjectCollapsed: (projectPath) =>
      get().sessions.projectCollapsedByPath[projectPath] === true,

    isSessionWorktreeCollapsed: (worktreePath) =>
      get().sessions.worktreeCollapsedByPath[worktreePath] === true,

    isHistoryProjectCollapsed: (projectPath) =>
      get().history.projectCollapsedByPath[projectPath] === true,

    toggleSessionProject: (projectPath) => {
      set((state) => {
        const next: LeftPanelUiStateData = {
          version: 1,
          sessions: {
            ...state.sessions,
            projectCollapsedByPath: toggleRecordValue(
              state.sessions.projectCollapsedByPath,
              projectPath,
            ),
          },
          history: state.history,
        };
        persistState(next);
        return next;
      });
    },

    toggleSessionWorktree: (worktreePath) => {
      set((state) => {
        const next: LeftPanelUiStateData = {
          version: 1,
          sessions: {
            ...state.sessions,
            worktreeCollapsedByPath: toggleRecordValue(
              state.sessions.worktreeCollapsedByPath,
              worktreePath,
            ),
          },
          history: state.history,
        };
        persistState(next);
        return next;
      });
    },

    toggleHistoryProject: (projectPath) => {
      set((state) => {
        const next: LeftPanelUiStateData = {
          version: 1,
          sessions: state.sessions,
          history: {
            projectCollapsedByPath: toggleRecordValue(
              state.history.projectCollapsedByPath,
              projectPath,
            ),
          },
        };
        persistState(next);
        return next;
      });
    },

    prune: ({
      sessionProjectPaths,
      sessionWorktreePaths,
      historyProjectPaths,
    }) => {
      set((state) => {
        const next: LeftPanelUiStateData = {
          version: 1,
          sessions: {
            projectCollapsedByPath: pruneRecord(
              state.sessions.projectCollapsedByPath,
              new Set(sessionProjectPaths),
            ),
            worktreeCollapsedByPath: pruneRecord(
              state.sessions.worktreeCollapsedByPath,
              new Set(sessionWorktreePaths),
            ),
          },
          history: {
            projectCollapsedByPath: pruneRecord(
              state.history.projectCollapsedByPath,
              new Set(historyProjectPaths),
            ),
          },
        };
        persistState(next);
        return next;
      });
    },
  }),
);
