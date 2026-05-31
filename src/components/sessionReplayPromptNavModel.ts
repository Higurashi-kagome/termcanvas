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

function normalizePromptNavText(text: string): string {
  // Prompt rail wants the user-facing question, not transport-only wrappers.
  return text
    .replace(/<subagent_notification>[\s\S]*?<\/subagent_notification>/gi, "")
    .replace(/^\s*<image\b[^>]*>\s*/gi, "")
    .trim();
}

function isPromptNavNoise(text: string): boolean {
  if (!text) return true;
  if (/^<subagent_notification>[\s\S]*<\/subagent_notification>$/i.test(text)) {
    return true;
  }
  if (/^<image\b[^>]*>\s*$/i.test(text)) {
    return true;
  }
  return false;
}

export function buildPromptJumpItems(
  turns: ReplayPromptTurnInput[],
): PromptJumpItem[] {
  const items: PromptJumpItem[] = [];
  let previousKey: string | null = null;
  for (const turn of turns) {
    if (!turn.userEvent) continue;
    const rawText = turn.userEvent.textPreview.trim();
    if (isPromptNavNoise(rawText)) continue;
    const text = normalizePromptNavText(rawText);
    if (!text) continue;

    // Old Codex rollouts can record the same user turn twice in adjacent events.
    const dedupeKey = `${turn.userEvent.timestamp}\n${text}`;
    if (dedupeKey === previousKey) continue;

    items.push({
      id: `prompt-${turn.userEvent.index}`,
      eventIndex: turn.userEvent.index,
      turnIndex: items.length,
      text,
      timestamp: turn.userEvent.timestamp,
    });
    previousKey = dedupeKey;
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
