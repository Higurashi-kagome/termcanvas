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

test("keeps persisted expansion state when prune runs before projects restore", async () => {
  const persisted = {
    version: 1,
    sessions: {
      projectCollapsedByPath: { "/repo": true },
      worktreeCollapsedByPath: { "/repo/.worktrees/a": true },
    },
    history: {
      projectCollapsedByPath: { "/repo": true },
    },
  };
  const { data } = installLocalStorage({
    "termcanvas:left-panel-ui-state:v1": JSON.stringify(persisted),
  });
  const {
    LEFT_PANEL_UI_STATE_STORAGE_KEY,
    useLeftPanelUiStateStore,
  } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.prune({
    sessionProjectPaths: [],
    sessionWorktreePaths: [],
    historyProjectPaths: [],
  });

  assert.equal(store.isSessionProjectCollapsed("/repo"), true);
  assert.equal(store.isSessionWorktreeCollapsed("/repo/.worktrees/a"), true);
  assert.equal(store.isHistoryProjectCollapsed("/repo"), true);
  assert.deepEqual(
    JSON.parse(data.get(LEFT_PANEL_UI_STATE_STORAGE_KEY) ?? "{}"),
    persisted,
  );
});

test("uses paths rather than runtime ids for session collapse state", async () => {
  installLocalStorage();
  const { useLeftPanelUiStateStore } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleSessionProject("/repo");
  store.toggleSessionWorktree("/repo/.worktrees/feature");

  assert.equal(store.isSessionProjectCollapsed("/repo"), true);
  assert.equal(store.isSessionProjectCollapsed("project-runtime-id"), false);
  assert.equal(
    store.isSessionWorktreeCollapsed("/repo/.worktrees/feature"),
    true,
  );
  assert.equal(store.isSessionWorktreeCollapsed("worktree-runtime-id"), false);
});

test("history persistence is limited to top-level project groups", async () => {
  const { data } = installLocalStorage();
  const {
    LEFT_PANEL_UI_STATE_STORAGE_KEY,
    useLeftPanelUiStateStore,
  } = await loadFreshStore();

  const store = useLeftPanelUiStateStore.getState();
  store.toggleHistoryProject("/repo");

  assert.equal(store.isHistoryProjectCollapsed("/repo"), true);
  assert.equal(
    store.isHistoryProjectCollapsed("/repo/.worktrees/feature"),
    false,
  );

  const persisted = JSON.parse(
    data.get(LEFT_PANEL_UI_STATE_STORAGE_KEY) ?? "{}",
  );
  assert.deepEqual(Object.keys(persisted.history), [
    "projectCollapsedByPath",
  ]);
});
