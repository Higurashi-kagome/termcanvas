import { normalizeProjectPathForMatch } from "../../shared/project-path-match.ts";
import type { ProjectData, TerminalType } from "../types/index.ts";

export interface ReplayResumeTarget {
  provider: TerminalType;
  projectId: string;
  worktreeId: string;
  sessionId: string;
  usesProjectFallback: boolean;
}

export function resolveReplayResumeTarget(
  projects: ProjectData[],
  input: {
    provider: TerminalType | null;
    projectDir: string;
    sessionId: string;
  },
): ReplayResumeTarget | null {
  if (!input.provider) return null;

  const targetProjectDir = normalizeProjectPathForMatch(input.projectDir);
  if (!targetProjectDir) return null;

  for (const project of projects) {
    for (const worktree of project.worktrees) {
      if (normalizeProjectPathForMatch(worktree.path) === targetProjectDir) {
        return {
          provider: input.provider,
          projectId: project.id,
          worktreeId: worktree.id,
          sessionId: input.sessionId,
          usesProjectFallback: false,
        };
      }
    }
  }

  for (const project of projects) {
    const projectPath = normalizeProjectPathForMatch(project.path);
    if (!isDeletedProjectWorktreePath(targetProjectDir, projectPath)) {
      continue;
    }

    const projectRootWorktree =
      project.worktrees.find(
        (worktree) =>
          worktree.isPrimary === true ||
          normalizeProjectPathForMatch(worktree.path) === projectPath,
      ) ?? null;
    if (!projectRootWorktree) return null;

    return {
      provider: input.provider,
      projectId: project.id,
      worktreeId: projectRootWorktree.id,
      sessionId: input.sessionId,
      usesProjectFallback: true,
    };
  }

  return null;
}

function isDeletedProjectWorktreePath(
  targetProjectDir: string,
  projectPath: string,
): boolean {
  if (!targetProjectDir || !projectPath) return false;

  const prefix = `${projectPath}/.worktrees/`;
  if (!targetProjectDir.startsWith(prefix)) return false;

  const relative = targetProjectDir.slice(prefix.length);
  return relative.length > 0 && !relative.includes("/");
}
