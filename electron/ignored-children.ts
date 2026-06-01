import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

function normalizeDirectoryPath(input: string): string {
  return input.endsWith("/") ? input : `${input}/`;
}

function toRelativePosixPath(rootPath: string, targetPath: string): string {
  return path.relative(rootPath, targetPath).split(path.sep).join("/");
}

function toGitCheckIgnorePath(relPath: string, isDirectory: boolean): string {
  // `git check-ignore` distinguishes directories by the trailing slash; keep
  // the canonical file-tree form so ignored folders round-trip correctly.
  return isDirectory ? `${relPath}/` : relPath;
}

async function runGitCheckIgnore(
  repoPath: string,
  pathsToCheck: readonly string[],
): Promise<Set<string>> {
  if (pathsToCheck.length === 0) return new Set<string>();

  const stdin = pathsToCheck.join("\0") + "\0";

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = execFile(
      "git",
      ["check-ignore", "-z", "--stdin"],
      {
        cwd: repoPath,
        timeout: 10000,
        maxBuffer: 64 * 1024 * 1024,
      },
      (err, out, stderr) => {
        // git check-ignore exits 1 when nothing matches; treat that as a
        // successful empty result.
        const exitCode = (err as NodeJS.ErrnoException & { code?: number })?.code;
        if (err && exitCode !== 1) {
          reject(stderr || err);
          return;
        }
        resolve(out);
      },
    );

    if (child.stdin) {
      child.stdin.end(stdin, "utf8");
    }
  });

  const ignored = new Set<string>();
  for (const item of stdout.split("\0")) {
    if (!item) continue;
    ignored.add(item);
  }
  return ignored;
}

export async function listIgnoredChildren(
  repoPath: string,
  parentPath: string,
): Promise<string[]> {
  const canonicalParent = normalizeDirectoryPath(parentPath);
  const parentDiskPath = path.join(
    repoPath,
    canonicalParent.split("/").join(path.sep),
  );

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(parentDiskPath, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return [];
    }
    throw err;
  }

  // Only inspect the directory's immediate children. The previous
  // `git ls-files -- <prefix>` approach enumerated the entire ignored subtree
  // just to recover this one level, which is exactly what made expanding
  // `node_modules/` or `.worktrees/` take seconds.
  const candidates = entries
    .filter((entry) => entry.name !== "." && entry.name !== "..")
    .map((entry) => {
      const relPath = `${canonicalParent}${entry.name}`;
      const isDirectory = entry.isDirectory();
      return {
        displayPath: isDirectory ? `${relPath}/` : relPath,
        gitPath: toGitCheckIgnorePath(relPath, isDirectory),
      };
    });

  const ignored = await runGitCheckIgnore(
    repoPath,
    candidates.map((candidate) => candidate.gitPath),
  );

  return candidates
    .filter((candidate) => ignored.has(candidate.gitPath))
    .map((candidate) => candidate.displayPath)
    .sort((left, right) => left.localeCompare(right));
}

export { normalizeDirectoryPath, toGitCheckIgnorePath, toRelativePosixPath };
