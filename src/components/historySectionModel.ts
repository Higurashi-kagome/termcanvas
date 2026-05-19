import type {
  SessionHistoryNode,
  SessionHistoryProjectGroup,
  SessionHistoryProjectTree,
  SessionHistoryWorktreeGroup,
} from "../../shared/sessions";

export function shouldRefreshHistorySection(
  projectDirs: string[],
  changedProjectDirs: string[],
): boolean {
  if (projectDirs.length === 0 || changedProjectDirs.length === 0) {
    return false;
  }

  const scope = new Set(projectDirs.map((dir) => dir.trim()).filter(Boolean));
  if (scope.size === 0) {
    return false;
  }

  return changedProjectDirs.some((dir) => scope.has(dir.trim()));
}

export interface GroupableHistoryEntry {
  sessionId: string;
  projectDir: string;
  lastActivityAt: string;
}

export interface HistoryProjectGroup<T extends GroupableHistoryEntry> {
  projectDir: string;
  entries: T[];
  /** Most-recent activity within the group, used to sort groups. */
  latestActivityAt: string;
}

/**
 * Group history entries by `projectDir`, ordering groups by the most
 * recent activity in each group and entries within a group newest-
 * first. Stable for entries with identical timestamps so paginated
 * loads don't visibly reshuffle on refresh.
 *
 * Grouping is intentionally client-side: it shares the existing
 * `listSessionsPage` IPC and avoids a per-project fetch storm. The
 * tradeoff is that a paginated tail can land mid-group — the user
 * sees "Project A (3 of 12)" and clicks "Load more" to fill it in —
 * which is acceptable because the server already sorts by mtime, so
 * the rows that appear first ARE the ones the user is likely to
 * recognize.
 */
export function groupHistoryByProject<T extends GroupableHistoryEntry>(
  entries: T[],
): HistoryProjectGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.projectDir);
    if (bucket) bucket.push(entry);
    else buckets.set(entry.projectDir, [entry]);
  }

  const groups: HistoryProjectGroup<T>[] = [];
  for (const [projectDir, bucketEntries] of buckets) {
    bucketEntries.sort((a, b) => {
      const at = new Date(a.lastActivityAt).getTime();
      const bt = new Date(b.lastActivityAt).getTime();
      return bt - at;
    });
    groups.push({
      projectDir,
      entries: bucketEntries,
      latestActivityAt: bucketEntries[0]?.lastActivityAt ?? "",
    });
  }
  groups.sort((a, b) => {
    const at = new Date(a.latestActivityAt).getTime();
    const bt = new Date(b.latestActivityAt).getTime();
    return bt - at;
  });
  return groups;
}

/**
 * Filter out entries whose sessionId is in `hidden`. Pure helper so
 * the grouping → filtering pipeline is unit-testable without a DOM.
 */
export function filterHiddenEntries<T extends GroupableHistoryEntry>(
  entries: T[],
  hidden: ReadonlySet<string>,
): T[] {
  if (hidden.size === 0) return entries;
  return entries.filter((entry) => !hidden.has(entry.sessionId));
}

export function resolvePinnedHistoryRoot(
  roots: SessionHistoryNode[],
  sessionId: string,
): string | null {
  for (const root of roots) {
    if (containsHistoryNode(root, sessionId)) {
      return root.sessionId;
    }
  }
  return null;
}

export function hideHistorySubtree(
  hidden: ReadonlySet<string>,
  roots: SessionHistoryNode[],
  targetSessionId: string,
): Set<string> {
  const next = new Set(hidden);
  const target = findHistoryNode(roots, targetSessionId);
  if (!target) return next;
  walkHistoryNode(target, (node) => next.add(node.sessionId));
  return next;
}

export function collectVisibleHistoryRoots(
  roots: SessionHistoryNode[],
  limit: number,
): SessionHistoryNode[] {
  return roots.slice(0, Math.max(0, limit));
}

export function filterHiddenProjectTree(
  tree: SessionHistoryProjectTree | null,
  hidden: ReadonlySet<string>,
): SessionHistoryProjectTree | null {
  if (!tree) return null;

  const roots = tree.roots
    .map((root) => filterHistoryNode(root, hidden))
    .filter((root): root is SessionHistoryNode => root !== null);

  if (roots.length === 0) {
    return null;
  }

  return {
    ...tree,
    roots,
    rootCount: roots.length,
    latestActivityAt: roots[0]?.treeLastActivityAt ?? "",
  };
}

export function buildVisibleHistoryGroups(
  groups: SessionHistoryProjectGroup[],
  hidden: ReadonlySet<string> = new Set(),
): SessionHistoryProjectGroup[] {
  return groups
    .map((group) => {
      const projectTree = filterHiddenProjectTree(group.projectTree, hidden);
      const worktrees = group.worktrees
        .map((worktree) => {
          const tree = filterHiddenProjectTree(worktree.tree, hidden);
          if (!tree) return null;
          return { ...worktree, tree };
        })
        .filter((worktree): worktree is SessionHistoryWorktreeGroup => worktree !== null);

      if (!projectTree && worktrees.length === 0) return null;

      return {
        ...group,
        projectTree,
        worktrees,
      };
    })
    .filter((group): group is SessionHistoryProjectGroup => group !== null);
}

export type VisibleHistoryGroupSection =
  | {
      kind: "project";
      latestActivityAt: string;
      projectTree: SessionHistoryProjectTree;
    }
  | {
      kind: "worktree";
      latestActivityAt: string;
      worktree: SessionHistoryWorktreeGroup;
    };

export function buildVisibleHistoryGroupSections(
  group: SessionHistoryProjectGroup,
): VisibleHistoryGroupSection[] {
  const sections: VisibleHistoryGroupSection[] = [];
  if (group.projectTree) {
    sections.push({
      kind: "project",
      latestActivityAt: group.projectTree.latestActivityAt,
      projectTree: group.projectTree,
    });
  }

  for (const worktree of group.worktrees) {
    sections.push({
      kind: "worktree",
      latestActivityAt: worktree.tree.latestActivityAt,
      worktree,
    });
  }

  sections.sort((a, b) => b.latestActivityAt.localeCompare(a.latestActivityAt));
  return sections;
}

export type LimitedVisibleHistoryGroupSection =
  | {
      kind: "project";
      latestActivityAt: string;
      projectTree: SessionHistoryProjectTree;
      visibleRoots: SessionHistoryNode[];
    }
  | {
      kind: "worktree";
      latestActivityAt: string;
      worktree: SessionHistoryWorktreeGroup;
    };

export function countHistoryGroupTopLevelItems(
  group: SessionHistoryProjectGroup,
): number {
  return (group.projectTree?.roots.length ?? 0) + group.worktrees.length;
}

export function buildLimitedVisibleHistoryGroupSections(
  group: SessionHistoryProjectGroup,
  limit: number,
): {
  sections: LimitedVisibleHistoryGroupSection[];
  hiddenCount: number;
} {
  const sections = buildVisibleHistoryGroupSections(group);
  const cappedLimit = Math.max(0, limit);
  let remaining = cappedLimit;
  const visibleSections: LimitedVisibleHistoryGroupSection[] = [];

  for (const section of sections) {
    if (remaining <= 0) break;

    if (section.kind === "project") {
      const visibleRoots = collectVisibleHistoryRoots(
        section.projectTree.roots,
        remaining,
      );
      if (visibleRoots.length === 0) continue;
      visibleSections.push({
        ...section,
        visibleRoots,
      });
      remaining -= visibleRoots.length;
      continue;
    }

    visibleSections.push(section);
    remaining -= 1;
  }

  const visibleCount = visibleSections.reduce(
    (sum, section) =>
      sum + (section.kind === "project" ? section.visibleRoots.length : 1),
    0,
  );

  return {
    sections: visibleSections,
    hiddenCount: Math.max(0, countHistoryGroupTopLevelItems(group) - visibleCount),
  };
}

function containsHistoryNode(
  node: SessionHistoryNode,
  sessionId: string,
): boolean {
  if (node.sessionId === sessionId) return true;
  return node.children.some((child) => containsHistoryNode(child, sessionId));
}

function findHistoryNode(
  roots: SessionHistoryNode[],
  sessionId: string,
): SessionHistoryNode | null {
  for (const root of roots) {
    if (root.sessionId === sessionId) return root;
    const nested = findHistoryNode(root.children, sessionId);
    if (nested) return nested;
  }
  return null;
}

function walkHistoryNode(
  node: SessionHistoryNode,
  visitor: (node: SessionHistoryNode) => void,
): void {
  visitor(node);
  for (const child of node.children) {
    walkHistoryNode(child, visitor);
  }
}

function filterHistoryNode(
  node: SessionHistoryNode,
  hidden: ReadonlySet<string>,
): SessionHistoryNode | null {
  if (hidden.has(node.sessionId)) {
    return null;
  }

  const children = node.children
    .map((child) => filterHistoryNode(child, hidden))
    .filter((child): child is SessionHistoryNode => child !== null);

  const treeLastActivityAt = children.reduce(
    (latest, child) =>
      new Date(child.treeLastActivityAt).getTime() >
      new Date(latest).getTime()
        ? child.treeLastActivityAt
        : latest,
    node.lastActivityAt,
  );

  return {
    ...node,
    children,
    hasChildren: children.length > 0,
    childCount: children.length,
    treeLastActivityAt,
  };
}
