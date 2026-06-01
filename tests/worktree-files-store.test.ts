import test from "node:test";
import assert from "node:assert/strict";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createTermcanvasMock(options?: {
  listAllFiles?: (dirPath: string) => Promise<{ paths: string[] }>;
  listIgnoredFiles?: (dirPath: string) => Promise<string[]>;
}) {
  const dirListeners = new Set<(dirPath: string) => void>();
  const gitListeners = new Set<(dirPath: string) => void>();

  return {
    fs: {
      watchDir: async (_dirPath: string) => {},
      unwatchDir: async (_dirPath: string) => {},
      onDirChanged: (callback: (dirPath: string) => void) => {
        dirListeners.add(callback);
        return () => {
          dirListeners.delete(callback);
        };
      },
      listAllFiles:
        options?.listAllFiles ??
        (async (_dirPath: string) => ({ paths: ["tracked.txt"] })),
      listIgnoredFiles:
        options?.listIgnoredFiles ??
        (async (_dirPath: string) => ["node_modules/"]),
    },
    git: {
      onChanged: (callback: (dirPath: string) => void) => {
        gitListeners.add(callback);
        return () => {
          gitListeners.delete(callback);
        };
      },
    },
  };
}

function seedWorktreeEntry(useWorktreeFilesStore: {
  setState: (state: unknown) => void;
}) {
  useWorktreeFilesStore.setState({
    byWorktree: {
      "/repo": {
        ignoredPaths: [],
        loadId: 0,
        paths: [],
        refCount: 1,
        status: "idle",
      },
    },
  });
}

test("worktree file refresh skips ignored scans while the cache is fresh", async () => {
  let listAllCalls = 0;
  let listIgnoredCalls = 0;
  const windowMock = {
    termcanvas: createTermcanvasMock({
      listAllFiles: async (_dirPath: string) => {
        listAllCalls += 1;
        return { paths: ["tracked.txt"] };
      },
      listIgnoredFiles: async (_dirPath: string) => {
        listIgnoredCalls += 1;
        return ["node_modules/"];
      },
    }),
  };

  Object.assign(globalThis, { window: windowMock });

  const { useWorktreeFilesStore } = await import(
    `../src/stores/worktreeFilesStore.ts?ttl-${Date.now()}`
  );

  seedWorktreeEntry(useWorktreeFilesStore);

  await (useWorktreeFilesStore.getState().refresh as (
    worktreePath: string,
  ) => Promise<void>)("/repo");
  await (useWorktreeFilesStore.getState().refresh as (
    worktreePath: string,
  ) => Promise<void>)("/repo");

  assert.equal(listAllCalls, 2);
  assert.equal(listIgnoredCalls, 1);
});

test("worktree file refresh coalesces concurrent requests into a single flight", async () => {
  let listAllCalls = 0;
  let listIgnoredCalls = 0;
  const firstTracked = createDeferred<{ paths: string[] }>();
  const windowMock = {
    termcanvas: createTermcanvasMock({
      listAllFiles: async (_dirPath: string) => {
        listAllCalls += 1;
        if (listAllCalls === 1) {
          return firstTracked.promise;
        }
        return { paths: ["tracked-2.txt"] };
      },
      listIgnoredFiles: async (_dirPath: string) => {
        listIgnoredCalls += 1;
        return ["node_modules/"];
      },
    }),
  };

  Object.assign(globalThis, { window: windowMock });

  const { useWorktreeFilesStore } = await import(
    `../src/stores/worktreeFilesStore.ts?single-flight-${Date.now()}`
  );

  seedWorktreeEntry(useWorktreeFilesStore);

  const refresh = useWorktreeFilesStore.getState().refresh as (
    worktreePath: string,
    options?: Record<string, unknown>,
  ) => Promise<void>;

  const first = refresh("/repo", { forceIgnored: true });
  const second = refresh("/repo", { includeIgnored: false });

  assert.equal(listAllCalls, 1);
  assert.equal(listIgnoredCalls, 0);

  firstTracked.resolve({ paths: ["tracked-1.txt"] });
  await Promise.all([first, second]);

  assert.equal(listAllCalls, 2);
  assert.equal(listIgnoredCalls, 1);
});

test("worktree file store can append ignored children for a single directory", async () => {
  const windowMock = {
    termcanvas: createTermcanvasMock(),
  };

  Object.assign(globalThis, { window: windowMock });

  const { useWorktreeFilesStore } = await import(
    `../src/stores/worktreeFilesStore.ts?ignored-children-${Date.now()}`
  );

  useWorktreeFilesStore.setState({
    byWorktree: {
      "/repo": {
        ignoredPaths: ["node_modules/"],
        ignoredRefreshedAt: Date.now(),
        loadId: 0,
        loadedIgnoredDirs: [],
        paths: [],
        refCount: 1,
        status: "loaded",
      },
    },
  });

  (
    useWorktreeFilesStore.getState() as {
      resolveIgnoredChildren: (
        worktreePath: string,
        parentPath: string,
        children: string[],
      ) => void;
    }
  ).resolveIgnoredChildren("/repo", "node_modules/", [
    "node_modules/.bin/",
    "node_modules/react/",
  ]);

  assert.deepEqual(
    useWorktreeFilesStore.getState().byWorktree["/repo"]?.ignoredPaths,
    ["node_modules/", "node_modules/.bin/", "node_modules/react/"],
  );
  assert.deepEqual(
    useWorktreeFilesStore.getState().byWorktree["/repo"]?.loadedIgnoredDirs,
    ["node_modules/"],
  );
});
