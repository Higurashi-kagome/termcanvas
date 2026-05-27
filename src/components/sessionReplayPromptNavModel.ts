import type { TimelineEvent } from "../../shared/sessions.ts";

export interface ReplayPromptTurnInput {
  startIndex: number;
  userEvent: TimelineEvent | null;
}

export interface PromptJumpItem {
  id: string;
  eventIndex: number;
  turnIndex: number;
  text: string;
  timestamp: string;
}

export type PromptNavMode = "rail" | "railCompact" | "button";

const RAIL_MODE_MIN_WIDTH = 980;
const RAIL_COMPACT_MODE_MIN_WIDTH = 760;

export function buildPromptJumpItems(
  turns: ReplayPromptTurnInput[],
): PromptJumpItem[] {
  const items: PromptJumpItem[] = [];
  for (const turn of turns) {
    if (!turn.userEvent) continue;
    items.push({
      id: `prompt-${turn.userEvent.index}`,
      eventIndex: turn.userEvent.index,
      turnIndex: items.length,
      text: turn.userEvent.textPreview,
      timestamp: turn.userEvent.timestamp,
    });
  }
  return items;
}

export function shouldRenderPromptJumpNav(items: PromptJumpItem[]): boolean {
  return items.length > 1;
}

export function getPromptNavMode(containerWidth: number): PromptNavMode {
  if (containerWidth >= RAIL_MODE_MIN_WIDTH) return "rail";
  if (containerWidth >= RAIL_COMPACT_MODE_MIN_WIDTH) return "railCompact";
  return "button";
}
