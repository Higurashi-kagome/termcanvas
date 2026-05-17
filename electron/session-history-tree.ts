import type {
  SessionHistoryNode,
  SessionHistoryProjectTree,
} from "../shared/sessions.ts";

export interface HistoryTreeInputEntry {
  sessionId: string;
  provider: "claude" | "codex" | "kimi";
  projectDir: string;
  filePath: string;
  firstPrompt: string;
  startedAt: string;
  lastActivityAt: string;
  estimatedMessageCount: number;
  fileSize: number;
  confirmedParentSessionId?: string;
}

export function buildHistoryProjectTrees(
  entries: HistoryTreeInputEntry[],
): SessionHistoryProjectTree[] {
  const byProject = new Map<string, HistoryTreeInputEntry[]>();
  for (const entry of entries) {
    const bucket = byProject.get(entry.projectDir);
    if (bucket) {
      bucket.push(entry);
    } else {
      byProject.set(entry.projectDir, [entry]);
    }
  }

  return [...byProject.entries()]
    .map(([projectDir, projectEntries]) =>
      buildProjectTree(projectDir, projectEntries),
    )
    .sort((a, b) => compareIsoDesc(a.latestActivityAt, b.latestActivityAt));
}

function buildProjectTree(
  projectDir: string,
  entries: HistoryTreeInputEntry[],
): SessionHistoryProjectTree {
  const nodeMap = new Map<string, SessionHistoryNode>();
  const candidateParents = new Map<string, string>();

  for (const entry of entries) {
    nodeMap.set(entry.sessionId, {
      sessionId: entry.sessionId,
      provider: entry.provider,
      projectDir: entry.projectDir,
      filePath: entry.filePath,
      firstPrompt: entry.firstPrompt,
      startedAt: entry.startedAt,
      lastActivityAt: entry.lastActivityAt,
      treeLastActivityAt: entry.lastActivityAt,
      parentSessionId: undefined,
      rootSessionId: entry.sessionId,
      depth: 0,
      relationshipSource: "none",
      hasChildren: false,
      childCount: 0,
      children: [],
    });
  }

  for (const entry of entries) {
    const parentId = entry.confirmedParentSessionId;
    if (!parentId) continue;

    const node = nodeMap.get(entry.sessionId);
    const parent = nodeMap.get(parentId);
    if (!node || !parent) continue;
    if (parent.projectDir !== node.projectDir) continue;
    candidateParents.set(node.sessionId, parent.sessionId);
  }

  const invalidCycleNodes = findCycleNodes(candidateParents);

  for (const [childId, parentId] of candidateParents) {
    if (invalidCycleNodes.has(childId)) continue;
    const node = nodeMap.get(childId);
    const parent = nodeMap.get(parentId);
    if (!node || !parent) continue;
    node.parentSessionId = parent.sessionId;
    node.relationshipSource = "confirmed";
    parent.children.push(node);
  }

  const roots = [...nodeMap.values()].filter((node) => !node.parentSessionId);
  for (const root of roots) {
    finalizeNode(root, root.sessionId, 0);
  }
  roots.sort((a, b) => compareIsoDesc(a.treeLastActivityAt, b.treeLastActivityAt));

  return {
    projectDir,
    roots,
    sessionCount: entries.length,
    rootCount: roots.length,
    latestActivityAt: roots[0]?.treeLastActivityAt ?? "",
  };
}

function finalizeNode(
  node: SessionHistoryNode,
  rootSessionId: string,
  depth: number,
): string {
  node.rootSessionId = rootSessionId;
  node.depth = depth;
  node.children.sort((a, b) => compareIsoDesc(a.lastActivityAt, b.lastActivityAt));
  node.hasChildren = node.children.length > 0;
  node.childCount = node.children.length;

  let latest = node.lastActivityAt;
  for (const child of node.children) {
    const childLatest = finalizeNode(child, rootSessionId, depth + 1);
    if (compareIsoDesc(childLatest, latest) < 0) {
      latest = childLatest;
    }
  }

  node.treeLastActivityAt = latest;
  return latest;
}

function compareIsoDesc(left: string, right: string): number {
  return new Date(right).getTime() - new Date(left).getTime();
}

function findCycleNodes(
  candidateParents: ReadonlyMap<string, string>,
): Set<string> {
  const invalid = new Set<string>();
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];

  function visit(nodeId: string): void {
    const currentState = state.get(nodeId);
    if (currentState === "done") return;
    if (currentState === "visiting") {
      const cycleStart = path.lastIndexOf(nodeId);
      if (cycleStart >= 0) {
        for (const cycleNode of path.slice(cycleStart)) {
          invalid.add(cycleNode);
        }
      }
      return;
    }

    state.set(nodeId, "visiting");
    path.push(nodeId);
    const parentId = candidateParents.get(nodeId);
    if (parentId) {
      visit(parentId);
    }
    path.pop();
    state.set(nodeId, "done");
  }

  for (const nodeId of candidateParents.keys()) {
    visit(nodeId);
  }

  return invalid;
}
