import test from "node:test";
import assert from "node:assert/strict";

test(
  "notifyThemeChanged sends SIGWINCH to the PTY child on unix platforms",
  { skip: process.platform === "win32" },
  async () => {
    const { PtyManager } = await import(
      `../electron/pty-manager.ts?sigwinch=${Date.now()}`,
    );
    const manager = new PtyManager() as PtyManager & {
      instances: Map<number, { pid?: number }>;
    };
    manager.instances.set(7, { pid: 4321 });

    const originalKill = process.kill;
    const calls: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    (process as typeof process & {
      kill: (pid: number, signal: NodeJS.Signals) => boolean;
    }).kill = ((pid: number, signal: NodeJS.Signals) => {
      calls.push({ pid, signal });
      return true;
    }) as typeof process.kill;

    try {
      manager.notifyThemeChanged(7);
    } finally {
      process.kill = originalKill;
    }

    assert.deepEqual(calls, [{ pid: 4321, signal: "SIGWINCH" }]);
  },
);

test("notifyThemeChanged ignores unknown PTYs", async () => {
  const { PtyManager } = await import(
    `../electron/pty-manager.ts?unknown=${Date.now()}`,
  );
  const manager = new PtyManager();
  manager.notifyThemeChanged(999);
  assert.ok(true);
});

test("resize ignores PTYs that already exited", async () => {
  const { PtyManager } = await import(
    `../electron/pty-manager.ts?resize-unknown=${Date.now()}`,
  );
  const manager = new PtyManager();
  manager.resize(999, 120, 40);
  assert.ok(true);
});

test("resize swallows exited PTY errors and evicts the stale instance", async () => {
  const { PtyManager } = await import(
    `../electron/pty-manager.ts?resize-exited=${Date.now()}`,
  );
  const manager = new PtyManager() as PtyManager & {
    instances: Map<number, { pid: number; resize: (cols: number, rows: number) => void }>;
    outputBuffers: Map<number, string[]>;
  };
  manager.instances.set(7, {
    pid: 0,
    resize() {
      throw new Error("Cannot resize a pty that has already exited");
    },
  });
  manager.outputBuffers.set(7, ["old output"]);

  assert.doesNotThrow(() => {
    manager.resize(7, 120, 40);
  });
  assert.equal(manager.instances.has(7), false);
  assert.equal(manager.outputBuffers.has(7), false);
});

test("destroy uses PTY native kill on Windows instead of negative PID process kill", async () => {
  const { PtyManager } = await import(
    `../electron/pty-manager.ts?destroy-win32=${Date.now()}`,
  );
  const manager = new PtyManager() as PtyManager & {
    instances: Map<number, { pid: number; kill: () => void }>;
    outputBuffers: Map<number, string[]>;
    deps: { platform: NodeJS.Platform };
  };

  let nativeKillCalls = 0;
  manager.instances.set(7, {
    pid: 4321,
    kill() {
      nativeKillCalls += 1;
    },
  });
  manager.outputBuffers.set(7, ["old output"]);
  manager.deps.platform = "win32";

  const originalKill = process.kill;
  const processKillCalls: Array<{ pid: number; signal?: NodeJS.Signals | 0 }> = [];
  (process as typeof process & {
    kill: (pid: number, signal?: NodeJS.Signals | 0) => boolean;
  }).kill = ((pid: number, signal?: NodeJS.Signals | 0) => {
    processKillCalls.push({ pid, signal });
    if (signal === 0) {
      const error = new Error("missing process") as NodeJS.ErrnoException;
      error.code = "ESRCH";
      throw error;
    }
    return true;
  }) as typeof process.kill;

  try {
    await manager.destroy(7);
  } finally {
    process.kill = originalKill;
  }

  assert.equal(nativeKillCalls, 1);
  assert.deepEqual(processKillCalls, []);
  assert.equal(manager.instances.has(7), false);
  assert.equal(manager.outputBuffers.has(7), false);
});

test("resize fallback uses PTY native kill on Windows when resize throws", async () => {
  const { PtyManager } = await import(
    `../electron/pty-manager.ts?resize-win32-kill=${Date.now()}`,
  );
  const manager = new PtyManager() as PtyManager & {
    instances: Map<number, { pid: number; resize: () => void; kill: () => void }>;
    outputBuffers: Map<number, string[]>;
    deps: { platform: NodeJS.Platform };
  };

  let nativeKillCalls = 0;
  manager.instances.set(7, {
    pid: 4321,
    resize() {
      throw new Error("Cannot resize a pty that has already exited");
    },
    kill() {
      nativeKillCalls += 1;
    },
  });
  manager.outputBuffers.set(7, ["old output"]);
  manager.deps.platform = "win32";

  const originalKill = process.kill;
  const processKillCalls: Array<{ pid: number; signal?: NodeJS.Signals | 0 }> = [];
  (process as typeof process & {
    kill: (pid: number, signal?: NodeJS.Signals | 0) => boolean;
  }).kill = ((pid: number, signal?: NodeJS.Signals | 0) => {
    processKillCalls.push({ pid, signal });
    return true;
  }) as typeof process.kill;

  try {
    assert.doesNotThrow(() => {
      manager.resize(7, 120, 40);
    });
  } finally {
    process.kill = originalKill;
  }

  assert.equal(nativeKillCalls, 1);
  assert.deepEqual(processKillCalls, []);
  assert.equal(manager.instances.has(7), false);
  assert.equal(manager.outputBuffers.has(7), false);
});

test(
  "create retries transient PTY spawn failures before surfacing an error",
  { skip: process.platform === "win32" },
  async () => {
    let attempts = 0;
    const { PtyManager } = await import(
      `../electron/pty-manager.ts?retry=${Date.now()}`,
    );
    const manager = new PtyManager({
      buildLaunchSpec: async () => ({
        cwd: process.cwd(),
        file: "/bin/sh",
        args: [],
        env: {},
      }),
      spawn: ((..._args: unknown[]) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("posix_spawnp failed.");
        }
        return { pid: 9876 };
      }) as typeof import("node-pty").spawn,
    });
    const id = await manager.create({
      cwd: process.cwd(),
    });

    assert.equal(id, 1);
    assert.equal(manager.getPid(id), 9876);
    assert.equal(attempts, 2);
  },
);

test("create retries transient Windows PTY spawn failures", async () => {
  let attempts = 0;
  const { PtyManager } = await import(
    `../electron/pty-manager.ts?retry-win32=${Date.now()}`,
  );
  const manager = new PtyManager({
    buildLaunchSpec: async () => ({
      cwd: process.cwd(),
      file: "pwsh.exe",
      args: [],
      env: {},
    }),
    spawn: ((..._args: unknown[]) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("ConnectNamedPipe failed: The pipe is being closed.");
      }
      return { pid: 9876 };
    }) as typeof import("node-pty").spawn,
    platform: "win32",
  });

  const id = await manager.create({
    cwd: process.cwd(),
  });

  assert.equal(id, 1);
  assert.equal(manager.getPid(id), 9876);
  assert.equal(attempts, 2);
});
