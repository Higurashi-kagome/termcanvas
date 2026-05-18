import { normalizePathForComparison } from "./path-comparison.ts";

/**
 * Normalize project/worktree paths before matching session history entries to
 * canvas state.
 *
 * History files and in-app worktrees may spell the same Windows path with
 * different slash styles (`E:\repo\app` vs `E:/repo/app`) or drive-letter
 * casing. We collapse those formatting differences so resume/history lookups
 * key off the real location instead of the raw string shape.
 */
export function normalizeProjectPathForMatch(projectDir: string): string {
  const platform = isWindowsLikePath(projectDir) ? "win32" : "darwin";
  const normalized = normalizePathForComparison(projectDir, platform);
  return platform === "win32"
    ? normalized.replace(/\\/g, "/")
    : normalized;
}

function isWindowsLikePath(projectDir: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(projectDir) || projectDir.includes("\\");
}
