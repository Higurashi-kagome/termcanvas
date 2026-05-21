# Keep Session History Panel State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist left-panel expansion state so the Sessions tab remembers project/worktree expansion and the History tab remembers top-level project expansion across app restarts.

**Architecture:** Add one focused Zustand store for left-panel UI state backed by `localStorage`. Replace the current in-memory Sessions tree collapse store usage with path-keyed persisted state, and wire only the History top-level project group collapse state to the new store. Keep History worktree groups, session-tree nodes, `show more`, `pin`, and `hide` behavior unchanged.

**Tech Stack:** TypeScript, React 19, Zustand, Electron renderer `localStorage`, Node `test` with `assert/strict`, `tsx --test`.

---

### File Structure

- Create: `src/stores/leftPanelUiStateStore.ts`

  Owns the persisted state schema, localStorage read/write, validation, default behavior, toggle APIs, and pruning helpers for left-panel expansion state.

- Create: `tests/left-panel-ui-state-store.test.ts`

  Unit tests for storage loading, corrupt storage fallback, path-keyed toggles, defaults, and pruning behavior.

- Modify: `src/components/ProjectTree.tsx`

  Replace `useSessionPanelCollapseStore` with the new path-keyed store for Sessions tab project/worktree expansion state.

- Modify: `src/components/SessionsPanel.tsx`

  In `HistorySection`, persist only top-level history project group collapse state through the new store. Leave worktree group expansion, session-node expansion, and `show more` as component-local state.

- Modify: `package.json`

  Add `tests/left-panel-ui-state-store.test.ts` to the `test` script so the new regression tests run in the standard suite.

- Optional delete after integration: `src/stores/sessionPanelCollapseStore.ts`

  Remove only if no imports remain after `ProjectTree` is migrated.

### Execution Preflight

- [ ] **Step 1: Verify current branch and clean state**

Run:

```powershell
rtk git status
git branch --show-current
```

Expected:

```text
* feat/keep-session-state
clean — nothing to commit
```

- [ ] **Step 2: Merge the latest `origin/main`**

Run:

```powershell
git fetch origin main
git merge origin/main
```

Expected:

```text
Merge made by the 'ort' strategy.
```

If Git reports conflicts, resolve only files related to the current branch and `origin/main`. Keep the `origin/main` history worktree grouping behavior intact.

- [ ] **Step 3: Confirm HistorySection is on the post-main API**

Run:

```powershell
Select-String -Path src\components\SessionsPanel.tsx -Pattern 'scopeProjects|expandedWorktreeGroups|SessionHistoryProjectGroup'
```

Expected: output includes all three names. The later tasks assume the History tab uses project/worktree scoped history groups from `origin/main`.

### Task 1: Left Panel UI State Store

**Files:**

- Create: `src/stores/leftPanelUiStateStore.ts`

- Test: `tests/left-panel-ui-state-store.test.ts`

- Modify: `package.json`

- [ ] **Step 1: Write the failing store tests**

Create `tests/left-panel-ui-state-store.test.ts` with this content:

```ts
import test from "node:test";
import assert from "node:assert/strict";

type StorageMap = Map<string, string>;

function installLocalStorage(seed: Record<string, string> = {}) {
  const data: StorageMap = new Map(Object.entries(seed));
  const storage = {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });

  return { data, storage };
}

async function loadFreshStore() {
  const modulePath =
    "../src/stores/leftPanelUiStateStore.ts?test=" +
    Date.now() +
    Math.random();
  return import(modulePath) as Promise<
    typeof import("../src/stores/leftPanelUiStateStore.ts")
  >;
}

test("defaults to expanded when no persisted state exists", async () => {
  installLocalStorage();
  const { useLeftPanelUiStateStore } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();

  assert.equal(store.isSessionProjectCollapsed("/repo"), false);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/a"), false);
  assert.equal(store.isHistoryProjectCollapsed("/repo"), false);
});

test("toggles sessions project and worktree state by path and persists it", async () => {
  const { data } = installLocalStorage();
  const {
    LEFT_PANEL_UI_STATE_STORAGE_KEY,
    useLeftPanelUiStateStore,
  } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleSessionProject("/repo");
  store.toggleSessionWorktree("/repo/.worktrees/a");

  assert.equal(store.isSessionProjectCollapsed("/repo"), true);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/a"), true);

  const raw = data.get(LEFT_PANEL_UI_STATE_STORAGE_KEY);
  assert.ok(raw, "store should write to localStorage");
  assert.deepEqual(JSON.parse(raw), {
    version: 1,
    sessions: {
      projectCollapsedByPath: { "/repo": true },
      worktreeCollapsedByPath: { "/repo/.worktrees/a": true },
    },
    history: {
      projectCollapsedByPath: {},
    },
  });
});

test("toggles history project state without persisting history internals", async () => {
  const { data } = installLocalStorage();
  const {
    LEFT_PANEL_UI_STATE_STORAGE_KEY,
    useLeftPanelUiStateStore,
  } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleHistoryProject("/repo");

  assert.equal(store.isHistoryProjectCollapsed("/repo"), true);

  const raw = data.get(LEFT_PANEL_UI_STATE_STORAGE_KEY);
  assert.ok(raw, "store should write to localStorage");
  assert.deepEqual(JSON.parse(raw).history, {
    projectCollapsedByPath: { "/repo": true },
  });
  assert.equal("expandedNodeIdsByProjectDir" in JSON.parse(raw).history, false);
  assert.equal("groupLimitByProjectDir" in JSON.parse(raw).history, false);
});

test("loads persisted state and ignores unsupported values", async () => {
  installLocalStorage({
    "termcanvas:left-panel-ui-state:v1": JSON.stringify({
      version: 1,
      sessions: {
        projectCollapsedByPath: {
          "/repo": true,
          "/expanded": false,
          "/bad": "yes",
        },
        worktreeCollapsedByPath: {
          "/repo/.worktrees/a": true,
          "/repo/.worktrees/b": false,
          "/bad-worktree": 1,
        },
      },
      history: {
        projectCollapsedByPath: {
          "/repo": true,
          "/expanded-history": false,
          "/bad-history": null,
        },
        expandedNodeIdsByProjectDir: { "/repo": ["ignored"] },
      },
    }),
  });

  const { useLeftPanelUiStateStore } = await loadFreshStore();
  const store = useLeftPanelUiStateStore.getState();

  assert.equal(store.isSessionProjectCollapsed("/repo"), true);
  assert.equal(store.isSessionProjectCollapsed("/expanded"), false);
  assert.equal(store.isSessionProjectCollapsed("/bad"), false);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/a"), true);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/b"), false);
  assert.equal(store.isSessionWorktreeCollapsed("/bad-worktree"), false);
  assert.equal(store.isHistoryProjectCollapsed("/repo"), true);
  assert.equal(store.isHistoryProjectCollapsed("/expanded-history"), false);
  assert.equal(store.isHistoryProjectCollapsed("/bad-history"), false);
});

test("falls back to defaults when persisted JSON is corrupt", async () => {
  installLocalStorage({
    "termcanvas:left-panel-ui-state:v1": "{not json",
  });

  const { useLeftPanelUiStateStore } = await loadFreshStore();
  const store = useLeftPanelUiStateStore.getState();

  assert.equal(store.isSessionProjectCollapsed("/repo"), false);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/a"), false);
  assert.equal(store.isHistoryProjectCollapsed("/repo"), false);
});

test("prunes state for paths that no longer exist", async () => {
  const { data } = installLocalStorage();
  const {
    LEFT_PANEL_UI_STATE_STORAGE_KEY,
    useLeftPanelUiStateStore,
  } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleSessionProject("/repo");
  store.toggleSessionProject("/old");
  store.toggleSessionWorktree("/repo/.worktrees/a");
  store.toggleSessionWorktree("/old/.worktrees/a");
  store.toggleHistoryProject("/repo");
  store.toggleHistoryProject("/old");

  store.prune({
    sessionProjectPaths: ["/repo"],
    sessionWorktreePaths: ["/repo/.worktrees/a"],
    historyProjectPaths: ["/repo"],
  });

  assert.equal(store.isSessionProjectCollapsed("/repo"), true);
  assert.equal(store.isSessionProjectCollapsed("/old"), false);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/a"), true);
  assert.equal(store.isSessionWorktreeCollapsed("/old/.worktrees/a"), false);
  assert.equal(store.isHistoryProjectCollapsed("/repo"), true);
  assert.equal(store.isHistoryProjectCollapsed("/old"), false);

  const raw = data.get(LEFT_PANEL_UI_STATE_STORAGE_KEY);
  assert.ok(raw, "prune should persist trimmed state");
  assert.deepEqual(JSON.parse(raw), {
    version: 1,
    sessions: {
      projectCollapsedByPath: { "/repo": true },
      worktreeCollapsedByPath: { "/repo/.worktrees/a": true },
    },
    history: {
      projectCollapsedByPath: { "/repo": true },
    },
  });
});
```

- [ ] **Step 2: Add the new test file to the standard test script**

In `package.json`, add the new test file near the other renderer/store tests:

```json
"tests/left-panel-ui-state-store.test.ts"
```

The relevant part of the script should include:

```json
"test": "tsx --test tests/pty-launch.test.ts ... tests/left-panel-ui-state-store.test.ts ..."
```

Place it near `tests/left-panel-repo-store.test.ts` or `tests/preferences-store.test.ts`; exact order is not behaviorally important.

- [ ] **Step 3: Run the new tests and verify they fail**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts
```

Expected: FAIL because `../src/stores/leftPanelUiStateStore.ts` does not exist.

- [ ] **Step 4: Implement the store**

Create `src/stores/leftPanelUiStateStore.ts`:

```ts
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

function readStorage():
  | Pick<Storage, "getItem" | "setItem">
  | null {
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
```

- [ ] **Step 5: Run the focused store tests**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
rtk git add src/stores/leftPanelUiStateStore.ts tests/left-panel-ui-state-store.test.ts package.json
rtk git commit -m 'feat: add left panel ui state store'
```

Expected: commit succeeds.

### Task 2: Sessions Tab Project and Worktree Persistence

**Files:**

- Modify: `src/components/ProjectTree.tsx`

- Optional delete: `src/stores/sessionPanelCollapseStore.ts`

- Test: `tests/left-panel-ui-state-store.test.ts`

- [ ] **Step 1: Add a regression test for path keys surviving runtime id changes**

Append this test to `tests/left-panel-ui-state-store.test.ts`:

```ts
test("uses paths rather than runtime ids for session collapse state", async () => {
  installLocalStorage();
  const { useLeftPanelUiStateStore } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleSessionProject("/repo");
  store.toggleSessionWorktree("/repo/.worktrees/feature");

  assert.equal(store.isSessionProjectCollapsed("/repo"), true);
  assert.equal(store.isSessionProjectCollapsed("project-runtime-id"), false);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/feature"), true);
  assert.equal(store.isSessionWorktreeCollapsed("worktree-runtime-id"), false);
});
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts
```

Expected: PASS. This test exercises the store contract before wiring the React tree.

- [ ] **Step 3: Replace imports in `ProjectTree.tsx`**

Change:

```ts
import { useSessionPanelCollapseStore } from "../stores/sessionPanelCollapseStore";
```

to:

```ts
import { useLeftPanelUiStateStore } from "../stores/leftPanelUiStateStore";
```

- [ ] **Step 4: Wire worktree rows to worktree paths**

In `WorktreeRow`, replace:

```ts
  const toggle = useSessionPanelCollapseStore((s) => s.toggle);
  const collapsed = useSessionPanelCollapseStore((s) =>
    s.isCollapsed(group.worktreeId),
  );
```

with:

```ts
  const toggleSessionWorktree = useLeftPanelUiStateStore(
    (s) => s.toggleSessionWorktree,
  );
  const collapsed = useLeftPanelUiStateStore((s) =>
    s.isSessionWorktreeCollapsed(group.worktreePath),
  );
```

In the worktree row click handler, replace:

```ts
          toggle(group.worktreeId);
```

with:

```ts
          toggleSessionWorktree(group.worktreePath);
```

In the chevron button `onClick`, replace:

```ts
            toggle(group.worktreeId);
```

with:

```ts
            toggleSessionWorktree(group.worktreePath);
```

- [ ] **Step 5: Wire project rows to project paths**

In `ProjectRow`, replace:

```ts
  const toggle = useSessionPanelCollapseStore((s) => s.toggle);
  const collapsed = useSessionPanelCollapseStore((s) =>
    s.isCollapsed(project.projectId),
  );
```

with:

```ts
  const toggleSessionProject = useLeftPanelUiStateStore(
    (s) => s.toggleSessionProject,
  );
  const collapsed = useLeftPanelUiStateStore((s) =>
    s.isSessionProjectCollapsed(project.projectPath),
  );
```

In the project row click handler, replace:

```ts
          toggle(project.projectId);
```

with:

```ts
          toggleSessionProject(project.projectPath);
```

In the chevron button `onClick`, replace:

```ts
            toggle(project.projectId);
```

with:

```ts
            toggleSessionProject(project.projectPath);
```

- [ ] **Step 6: Keep New Worktree creation opening only the input context**

In the project `+` button handler, replace:

```ts
            const store = useSessionPanelCollapseStore.getState();
            if (store.isCollapsed(project.projectId)) {
              store.toggle(project.projectId);
            }
            setCreating(true);
```

with:

```ts
            const store = useLeftPanelUiStateStore.getState();
            if (store.isSessionProjectCollapsed(project.projectPath)) {
              store.toggleSessionProject(project.projectPath);
            }
            setCreating(true);
```

Make the same replacement in the context menu `panel_new_worktree` handler.

This keeps the existing explicit user action behavior: clicking “new worktree” on a collapsed project opens that project so the input can render. Background-discovered new worktrees still do not force their parent project open.

- [ ] **Step 7: Remove the old in-memory store if unused**

Run:

```powershell
rg "sessionPanelCollapseStore|useSessionPanelCollapseStore" src tests
```

Expected after the `ProjectTree.tsx` edits: no references.

If there are no references, delete `src/stores/sessionPanelCollapseStore.ts`.

- [ ] **Step 8: Run typecheck**

Run:

```powershell
rtk tsc
```

Expected: no TypeScript errors related to `ProjectTree.tsx` or deleted imports.

- [ ] **Step 9: Run focused tests**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts tests/session-panel-model.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

Run:

```powershell
rtk git add src/components/ProjectTree.tsx src/stores/sessionPanelCollapseStore.ts tests/left-panel-ui-state-store.test.ts
rtk git commit -m 'feat: persist sessions tree expansion state'
```

If `src/stores/sessionPanelCollapseStore.ts` was deleted, `git add` still stages the deletion.

### Task 3: History Top-Level Project Persistence

**Files:**

- Modify: `src/components/SessionsPanel.tsx`

- Test: `tests/left-panel-ui-state-store.test.ts`

- [ ] **Step 1: Add a test that history only stores top-level project paths**

Append this test to `tests/left-panel-ui-state-store.test.ts`:

```ts
test("history persistence is limited to top-level project groups", async () => {
  const { data } = installLocalStorage();
  const {
    LEFT_PANEL_UI_STATE_STORAGE_KEY,
    useLeftPanelUiStateStore,
  } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleHistoryProject("/repo");

  assert.equal(store.isHistoryProjectCollapsed("/repo"), true);
  assert.equal(store.isHistoryProjectCollapsed("/repo/.worktrees/feature"), false);

  const persisted = JSON.parse(
    data.get(LEFT_PANEL_UI_STATE_STORAGE_KEY) ?? "{}",
  );
  assert.deepEqual(Object.keys(persisted.history), [
    "projectCollapsedByPath",
  ]);
});
```

- [ ] **Step 2: Run the focused store tests**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts
```

Expected: PASS.

- [ ] **Step 3: Import the new store in `SessionsPanel.tsx`**

Add near the other store imports:

```ts
import { useLeftPanelUiStateStore } from "../stores/leftPanelUiStateStore";
```

- [ ] **Step 4: Replace HistorySection top-level project collapse state**

In `HistorySection`, find the component-local state:

```ts
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
```

Replace it with:

```ts
  const isHistoryProjectCollapsed = useLeftPanelUiStateStore(
    (s) => s.isHistoryProjectCollapsed,
  );
  const toggleHistoryProject = useLeftPanelUiStateStore(
    (s) => s.toggleHistoryProject,
  );
```

Remove the old `toggleGroup` callback:

```ts
  const toggleGroup = useCallback((projectDir: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(projectDir)) next.delete(projectDir);
      else next.add(projectDir);
      return next;
    });
  }, []);
```

Add this callback:

```ts
  const toggleProjectGroup = useCallback(
    (projectPath: string) => {
      toggleHistoryProject(projectPath);
    },
    [toggleHistoryProject],
  );
```

- [ ] **Step 5: Use project paths when rendering history project groups**

In the `unpinnedProjectGroups.map((group) => { ... })` block on the post-main file, replace:

```ts
                const isCollapsed = collapsedGroups.has(group.projectPath);
```

with:

```ts
                const isCollapsed = isHistoryProjectCollapsed(group.projectPath);
```

Replace the group header click:

```ts
                      onClick={() => toggleGroup(group.projectPath)}
```

with:

```ts
                      onClick={() => toggleProjectGroup(group.projectPath)}
```

Do not change `expandedWorktreeGroups`, `expandedNodes`, or `groupLimits`.

- [ ] **Step 6: Verify no history internals were moved into persistence**

Run:

```powershell
Select-String -Path src\components\SessionsPanel.tsx -Pattern 'expandedWorktreeGroups|expandedNodes|groupLimits|useState'
```

Expected: `expandedWorktreeGroups`, `expandedNodes`, and `groupLimits` still appear as component-local state.

- [ ] **Step 7: Run typecheck and focused tests**

Run:

```powershell
rtk tsc
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts tests/history-section-model.test.ts
```

Expected: both commands pass.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
rtk git add src/components/SessionsPanel.tsx tests/left-panel-ui-state-store.test.ts
rtk git commit -m 'feat: persist history project expansion state'
```

Expected: commit succeeds.

### Task 4: Prune Dead Expansion Keys From Live Data

**Files:**

- Modify: `src/components/LeftPanel.tsx`

- Modify: `src/components/SessionsPanel.tsx`

- Test: `tests/left-panel-ui-state-store.test.ts`

- [ ] **Step 1: Confirm the store prune test already covers trimming**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts
```

Expected: PASS, including `prunes state for paths that no longer exist`.

- [ ] **Step 2: Prune from `LeftPanel.tsx` for the left sidebar tabs**

Import the new store:

```ts
import { useLeftPanelUiStateStore } from "../stores/leftPanelUiStateStore";
```

Inside `LeftPanel`, add:

```ts
  const pruneLeftPanelUiState = useLeftPanelUiStateStore((s) => s.prune);
```

After `canvasProjectDirs` is computed, add:

```ts
  const canvasWorktreeDirs = useMemo(
    () => projects.flatMap((p) => p.worktrees.map((w) => w.path)),
    [projects],
  );

  useEffect(() => {
    pruneLeftPanelUiState({
      sessionProjectPaths: projects.map((p) => p.path),
      sessionWorktreePaths: canvasWorktreeDirs,
      historyProjectPaths: canvasProjectDirs,
    });
  }, [canvasProjectDirs, canvasWorktreeDirs, projects, pruneLeftPanelUiState]);
```

If `origin/main` changed `canvasProjectDirs` to `historyScopeProjects`, use the equivalent top-level project paths:

```ts
  const historyProjectPaths = useMemo(
    () => projects.map((p) => p.path),
    [projects],
  );
```

Then pass `historyProjectPaths` to `prune`.

- [ ] **Step 3: Prune from `SessionsPanel.tsx` for the overlay/full panel**

Inside `SessionsPanel`, add:

```ts
  const pruneLeftPanelUiState = useLeftPanelUiStateStore((s) => s.prune);
```

After `historyScopeProjects` is computed, add:

```ts
  const sessionProjectPaths = useMemo(
    () => projects.map((project) => project.path),
    [projects],
  );
  const sessionWorktreePaths = useMemo(
    () => projects.flatMap((project) =>
      project.worktrees.map((worktree) => worktree.path),
    ),
    [projects],
  );
  const historyProjectPaths = useMemo(
    () => historyScopeProjects.map((project) => project.projectPath),
    [historyScopeProjects],
  );

  useEffect(() => {
    pruneLeftPanelUiState({
      sessionProjectPaths,
      sessionWorktreePaths,
      historyProjectPaths,
    });
  }, [
    historyProjectPaths,
    pruneLeftPanelUiState,
    sessionProjectPaths,
    sessionWorktreePaths,
  ]);
```

If these arrays cause unnecessary effect churn, keep them memoized exactly as shown.

- [ ] **Step 4: Run typecheck**

Run:

```powershell
rtk tsc
```

Expected: PASS.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts tests/session-panel-model.test.ts tests/history-section-model.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
rtk git add src/components/LeftPanel.tsx src/components/SessionsPanel.tsx
rtk git commit -m 'chore: prune stale left panel expansion state'
```

Expected: commit succeeds.

### Task 5: Final Verification

**Files:**

- Verify only; no expected source changes.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
rtk tsc
```

Expected: PASS.

- [ ] **Step 2: Run focused regression tests**

Run:

```powershell
pnpm exec tsx --test tests/left-panel-ui-state-store.test.ts tests/session-panel-model.test.ts tests/history-section-model.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full standard test suite if time allows**

Run:

```powershell
rtk test pnpm test
```

Expected: PASS. If unrelated long-suite failures appear, record the failing test names and confirm focused tests still pass.

- [ ] **Step 4: Manual renderer smoke test**

Run:

```powershell
pnpm dev
```

Open the app window and verify:

- Sessions tab: collapse a project, switch to History, switch back, project remains collapsed.

- Sessions tab: collapse a worktree, switch tabs, switch back, worktree remains collapsed.

- Restart app: the same project/worktree states restore.

- History tab: collapse a top-level project group, switch tabs, switch back, group remains collapsed.

- Restart app: the same History top-level project group restores collapsed.

- History tab: expand or collapse a worktree group, restart app, that worktree group follows default behavior rather than restoring the previous state.

- History tab: expand a session tree node, restart app, that node follows default behavior rather than restoring the previous state.

- History tab: click `show more`, restart app, the count returns to the default batch.

- [ ] **Step 5: Check final diff**

Run:

```powershell
rtk git status
git diff --stat HEAD
```

Expected: clean working tree after the task commits, or only intentional uncommitted manual-test notes if the user requested no commits.

### Self-Review

- Spec coverage: The plan covers Sessions project state, Sessions worktree state, History top-level project state, localStorage-only persistence, path-based keys, no project-folder writes, corrupt storage fallback, pruning, and explicit non-persistence of History worktree/session/show-more state.

- Placeholder scan: No step relies on unspecified implementation. Code snippets define the new store, tests, imports, and component wiring.

- Type consistency: Store method names are consistent across tests and component integration: `isSessionProjectCollapsed`, `isSessionWorktreeCollapsed`, `isHistoryProjectCollapsed`, `toggleSessionProject`, `toggleSessionWorktree`, `toggleHistoryProject`, and `prune`.
