import type { ProjectPanelOrderState } from "../types/index.ts";

export const EMPTY_PROJECT_PANEL_ORDER: ProjectPanelOrderState = {
  pinnedProjectIds: [],
  unpinnedProjectIds: [],
};

export type ProjectPanelGroup = "pinned" | "unpinned";

function removeId(ids: readonly string[], projectId: string): string[] {
  return ids.filter((id) => id !== projectId);
}

function dedupeKnownIds(
  ids: readonly string[] | undefined,
  allowed: ReadonlySet<string>,
): string[] {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const id of ids ?? []) {
    if (!allowed.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }

  return next;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function insertAt(
  ids: readonly string[],
  projectId: string,
  targetIndex: number,
): string[] {
  const next = removeId(ids, projectId);
  next.splice(clampIndex(targetIndex, next.length), 0, projectId);
  return next;
}

export function normalizeProjectPanelOrder(
  order: ProjectPanelOrderState | null | undefined,
  projectIds: readonly string[],
): ProjectPanelOrderState {
  const allowed = new Set(projectIds);
  const pinnedProjectIds = dedupeKnownIds(order?.pinnedProjectIds, allowed);
  const pinnedSet = new Set(pinnedProjectIds);
  const unpinnedProjectIds = dedupeKnownIds(
    order?.unpinnedProjectIds,
    allowed,
  ).filter((id) => !pinnedSet.has(id));
  const used = new Set([...pinnedProjectIds, ...unpinnedProjectIds]);
  const missing = projectIds.filter((id) => !used.has(id));

  return {
    pinnedProjectIds,
    unpinnedProjectIds: [...unpinnedProjectIds, ...missing],
  };
}

export function orderProjectIdsForPanel(
  projectIds: readonly string[],
  order: ProjectPanelOrderState | null | undefined,
): string[] {
  const normalized = normalizeProjectPanelOrder(order, projectIds);
  return [...normalized.pinnedProjectIds, ...normalized.unpinnedProjectIds];
}

export function pinProjectPanelItem(
  order: ProjectPanelOrderState,
  projectId: string,
): ProjectPanelOrderState {
  return {
    pinnedProjectIds: [...removeId(order.pinnedProjectIds, projectId), projectId],
    unpinnedProjectIds: removeId(order.unpinnedProjectIds, projectId),
  };
}

export function unpinProjectPanelItem(
  order: ProjectPanelOrderState,
  projectId: string,
): ProjectPanelOrderState {
  return {
    pinnedProjectIds: removeId(order.pinnedProjectIds, projectId),
    unpinnedProjectIds: [
      ...removeId(order.unpinnedProjectIds, projectId),
      projectId,
    ],
  };
}

export function reorderProjectPanelGroup(
  order: ProjectPanelOrderState,
  group: ProjectPanelGroup,
  projectId: string,
  targetIndex: number,
): ProjectPanelOrderState {
  if (group === "pinned") {
    return {
      ...order,
      pinnedProjectIds: insertAt(
        order.pinnedProjectIds,
        projectId,
        targetIndex,
      ),
    };
  }

  return {
    ...order,
    unpinnedProjectIds: insertAt(
      order.unpinnedProjectIds,
      projectId,
      targetIndex,
    ),
  };
}

export function moveProjectPanelItem(
  order: ProjectPanelOrderState,
  projectId: string,
  targetGroup: ProjectPanelGroup,
  targetIndex: number,
): ProjectPanelOrderState {
  const isPinned = order.pinnedProjectIds.includes(projectId);
  const currentGroup: ProjectPanelGroup = isPinned ? "pinned" : "unpinned";

  if (currentGroup === targetGroup) {
    return reorderProjectPanelGroup(order, targetGroup, projectId, targetIndex);
  }

  if (targetGroup === "pinned") {
    return {
      pinnedProjectIds: insertAt(order.pinnedProjectIds, projectId, targetIndex),
      unpinnedProjectIds: removeId(order.unpinnedProjectIds, projectId),
    };
  }

  return {
    pinnedProjectIds: removeId(order.pinnedProjectIds, projectId),
    unpinnedProjectIds: insertAt(
      order.unpinnedProjectIds,
      projectId,
      targetIndex,
    ),
  };
}
