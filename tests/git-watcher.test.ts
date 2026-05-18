import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import { GitFileWatcher } from "../electron/git-watcher.ts";

function waitFor(
  label: string,
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for watcher callback: ${label}`));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("GitFileWatcher detects repository presence and separates diff vs log refresh signals", async () => {
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), "git-watcher-test-"));
  const watcher = new GitFileWatcher();
  const presenceEvents: boolean[] = [];
  let diffEvents = 0;
  let logEvents = 0;

  try {
    watcher.watch(worktreePath, {
      onChanged: () => {
        diffEvents += 1;
      },
      onLogChanged: () => {
        logEvents += 1;
      },
      onPresenceChanged: (isRepo) => {
        presenceEvents.push(isRepo);
      },
    });

    execSync("git init -b main", {
      cwd: worktreePath,
      stdio: "pipe",
    });
    execSync('git config user.name "Test User"', {
      cwd: worktreePath,
      stdio: "pipe",
    });
    execSync('git config user.email "test@example.com"', {
      cwd: worktreePath,
      stdio: "pipe",
    });
    await waitFor("presence:true", () => presenceEvents.includes(true));

    const gitDir = path.join(worktreePath, ".git");
    // `git init` can keep `.git` busy long enough that the watcher's debounced
    // log callback arrives well after repository presence flips to true on
    // heavily loaded Windows CI hosts. Let that initial burst settle before
    // asserting the explicit COMMIT_EDITMSG signal.
    await sleep(1500);
    const initialLogEvents = logEvents;
    fs.writeFileSync(path.join(gitDir, "COMMIT_EDITMSG"), "new message\n");
    await waitFor("log", () => logEvents > initialLogEvents, 20000);

    fs.writeFileSync(path.join(worktreePath, "tracked.txt"), "tracked\n");
    execSync("git add tracked.txt", {
      cwd: worktreePath,
      stdio: "pipe",
    });
    await waitFor("diff", () => diffEvents > 0);

    fs.rmSync(gitDir, { recursive: true, force: true });
    await waitFor("presence:false", () => presenceEvents.includes(false));
  } finally {
    watcher.unwatch(worktreePath);
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }

  assert.equal(presenceEvents[0], true);
  assert.equal(logEvents > 0, true);
  assert.equal(diffEvents > 0, true);
  assert.equal(presenceEvents.includes(false), true);
});
