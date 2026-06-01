import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { listIgnoredChildren } from "../electron/ignored-children.ts";

function makeTempRepo(): string {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ignored-children-"));
  execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
  fs.writeFileSync(
    path.join(repoDir, ".gitignore"),
    "node_modules/\n.worktrees/\n",
    "utf8",
  );
  return repoDir;
}

function writeFile(filePath: string, content = "x"): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

test("listIgnoredChildren returns only direct ignored children for a top-level ignored directory", async () => {
  const repoDir = makeTempRepo();
  try {
    writeFile(path.join(repoDir, "node_modules", ".bin", "esbuild"));
    writeFile(path.join(repoDir, "node_modules", "@scope", "pkg", "index.js"));
    writeFile(path.join(repoDir, "node_modules", "vite.js"));

    const children = await listIgnoredChildren(repoDir, "node_modules/");

    assert.deepEqual(children, [
      "node_modules/.bin/",
      "node_modules/@scope/",
      "node_modules/vite.js",
    ]);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test("listIgnoredChildren supports nested ignored directories without git ls-files directory prefix errors", async () => {
  const repoDir = makeTempRepo();
  try {
    writeFile(
      path.join(repoDir, ".worktrees", "feat-a", "node_modules", "pkg", "index.js"),
    );
    writeFile(path.join(repoDir, ".worktrees", "feat-a", "README.md"));
    writeFile(path.join(repoDir, ".worktrees", "feat-a", "src", "main.ts"));

    const children = await listIgnoredChildren(repoDir, ".worktrees/feat-a/");

    assert.deepEqual(children, [
      ".worktrees/feat-a/node_modules/",
      ".worktrees/feat-a/README.md",
      ".worktrees/feat-a/src/",
    ]);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test("listIgnoredChildren returns an empty list when the parent directory is missing", async () => {
  const repoDir = makeTempRepo();
  try {
    const children = await listIgnoredChildren(repoDir, "node_modules/");
    assert.deepEqual(children, []);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});
