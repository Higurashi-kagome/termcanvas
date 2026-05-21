export interface SessionInfo {
  sessionId: string;
  projectDir: string;
  filePath: string;
  isLive: boolean;
  isManaged: boolean;
  status: "idle" | "generating" | "tool_running" | "turn_complete" | "error";
  currentTool?: string;
  startedAt: string;
  lastActivityAt: string;
  messageCount: number;
  tokenTotal: number;
}

export interface SessionHistoryNode {
  sessionId: string;
  provider: "claude" | "codex" | "kimi";
  projectDir: string;
  filePath: string;
  firstPrompt: string;
  startedAt: string;
  lastActivityAt: string;
  treeLastActivityAt: string;
  parentSessionId?: string;
  rootSessionId: string;
  depth: number;
  relationshipSource: "confirmed" | "none";
  hasChildren: boolean;
  childCount: number;
  children: SessionHistoryNode[];
}

export interface SessionHistoryProjectTree {
  projectDir: string;
  roots: SessionHistoryNode[];
  sessionCount: number;
  rootCount: number;
  latestActivityAt: string;
}

export interface SessionHistoryScopeProject {
  projectPath: string;
  worktreePaths: string[];
}

export interface SessionHistoryWorktreeGroup {
  worktreePath: string;
  worktreeLabel: string;
  tree: SessionHistoryProjectTree;
}

export interface SessionHistoryProjectGroup {
  projectPath: string;
  projectLabel: string;
  projectTree: SessionHistoryProjectTree | null;
  worktrees: SessionHistoryWorktreeGroup[];
  latestActivityAt: string;
}

export interface SessionHistoryChangedEvent {
  reason:
    | "session_attached"
    | "session_detached"
    | "session_scan_changed";
  projectDirs: string[];
}

export interface TimelineEvent {
  index: number;
  timestamp: string;
  type: "user_prompt" | "assistant_text" | "thinking" | "tool_use" | "tool_result" | "turn_complete" | "error";
  toolName?: string;
  filePath?: string;
  textPreview: string;
  tokenDelta?: number;
}

export interface ReplayTimeline {
  sessionId: string;
  projectDir: string;
  filePath: string;
  events: TimelineEvent[];
  editIndices: Array<{ index: number; filePath: string }>;
  totalTokens: number;
  startedAt: string;
  endedAt: string;
}
