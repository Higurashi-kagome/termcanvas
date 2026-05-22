import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_PROJECT_PANEL_ORDER,
  moveProjectPanelItem,
  normalizeProjectPanelOrder,
  orderProjectIdsForPanel,
  pinProjectPanelItem,
  reorderProjectPanelGroup,
  unpinProjectPanelItem,
} from "../src/stores/projectPanelOrder.ts";

test("normalizeProjectPanelOrder removes stale ids, dedupes, and appends missing ids to the unpinned tail", () => {
  const order = normalizeProjectPanelOrder(
    {
      pinnedProjectIds: ["project-2", "missing", "project-2"],
      unpinnedProjectIds: ["project-1", "project-1"],
    },
    ["project-1", "project-2", "project-3"],
  );

  assert.deepEqual(order, {
    pinnedProjectIds: ["project-2"],
    unpinnedProjectIds: ["project-1", "project-3"],
  });
});

test("pinProjectPanelItem moves a project into pinned tail and unpinProjectPanelItem moves it into unpinned tail", () => {
  const pinned = pinProjectPanelItem(
    {
      pinnedProjectIds: ["project-9"],
      unpinnedProjectIds: ["project-1", "project-2"],
    },
    "project-1",
  );

  assert.deepEqual(pinned, {
    pinnedProjectIds: ["project-9", "project-1"],
    unpinnedProjectIds: ["project-2"],
  });

  const unpinned = unpinProjectPanelItem(pinned, "project-9");
  assert.deepEqual(unpinned, {
    pinnedProjectIds: ["project-1"],
    unpinnedProjectIds: ["project-2", "project-9"],
  });
});

test("reorderProjectPanelGroup only reorders inside the requested group", () => {
  const order = reorderProjectPanelGroup(
    {
      pinnedProjectIds: ["project-2", "project-3"],
      unpinnedProjectIds: ["project-1", "project-4", "project-5"],
    },
    "unpinned",
    "project-5",
    0,
  );

  assert.deepEqual(order, {
    pinnedProjectIds: ["project-2", "project-3"],
    unpinnedProjectIds: ["project-5", "project-1", "project-4"],
  });
});

test("moveProjectPanelItem moves items across groups and inserts at the requested index", () => {
  const moveUnpinnedAcrossPinned = moveProjectPanelItem(
    {
      pinnedProjectIds: ["project-2", "project-3"],
      unpinnedProjectIds: ["project-1", "project-4"],
    },
    "project-4",
    "pinned",
    1,
  );

  assert.deepEqual(moveUnpinnedAcrossPinned, {
    pinnedProjectIds: ["project-2", "project-4", "project-3"],
    unpinnedProjectIds: ["project-1"],
  });

  const movePinnedAcrossUnpinned = moveProjectPanelItem(
    {
      pinnedProjectIds: ["project-2", "project-3"],
      unpinnedProjectIds: ["project-1", "project-4"],
    },
    "project-2",
    "unpinned",
    1,
  );

  assert.deepEqual(movePinnedAcrossUnpinned, {
    pinnedProjectIds: ["project-3"],
    unpinnedProjectIds: ["project-1", "project-2", "project-4"],
  });
});

test("orderProjectIdsForPanel returns pinned ids first and then unpinned ids", () => {
  const order = orderProjectIdsForPanel(
    ["project-1", "project-2", "project-3"],
    {
      pinnedProjectIds: ["project-3"],
      unpinnedProjectIds: ["project-2", "project-1"],
    },
  );

  assert.deepEqual(order, ["project-3", "project-2", "project-1"]);
  assert.deepEqual(EMPTY_PROJECT_PANEL_ORDER, {
    pinnedProjectIds: [],
    unpinnedProjectIds: [],
  });
});
