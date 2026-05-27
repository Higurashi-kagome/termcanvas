import { useEffect, useRef, useState } from "react";
import { ListTree } from "lucide-react";
import type {
  PromptJumpItem,
  PromptNavMode,
} from "./sessionReplayPromptNavModel.ts";

interface PromptJumpNavProps {
  items: PromptJumpItem[];
  activePromptId: string | null;
  mode: PromptNavMode;
  onJump: (item: PromptJumpItem) => void;
}

function PromptList({
  items,
  activePromptId,
  onJump,
}: {
  items: PromptJumpItem[];
  activePromptId: string | null;
  onJump: (item: PromptJumpItem) => void;
}) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activePromptId]);

  return (
    <div className="max-h-[360px] overflow-y-auto py-2">
      {items.map((item) => {
        const active = item.id === activePromptId;
        return (
          <button
            key={item.id}
            ref={active ? activeRef : undefined}
            type="button"
            aria-label={`Jump to prompt ${item.turnIndex + 1}`}
            title={item.text}
            onClick={() => onJump(item)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
            style={{
              color: active ? "var(--accent)" : "var(--text-secondary)",
              fontSize: "var(--text-xs)",
            }}
          >
            <span
              className="h-[2px] w-3 shrink-0 rounded-full"
              style={{
                backgroundColor: active ? "var(--accent)" : "var(--text-faint)",
              }}
            />
            <span className="min-w-0 flex-1 truncate">{item.text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PromptJumpNav({
  items,
  activePromptId,
  mode,
  onJump,
}: PromptJumpNavProps) {
  const [open, setOpen] = useState(false);
  if (items.length <= 1) return null;

  if (mode === "button") {
    return (
      <div className="relative">
        <button
          type="button"
          aria-label="Open prompt navigation"
          title="Prompts"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <ListTree size={14} aria-hidden />
        </button>
        {open && (
          <div
            className="absolute right-0 top-full z-20 mt-1 w-[min(320px,calc(100vw-48px))] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-xl"
            data-testid="session-replay-prompt-popover"
          >
            <PromptList
              items={items}
              activePromptId={activePromptId}
              onJump={(item) => {
                onJump(item);
                setOpen(false);
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const panelWidth = mode === "rail" ? "w-[320px]" : "w-[260px]";

  return (
    <div
      className="group absolute right-2 top-1/2 z-10 -translate-y-1/2"
      data-testid="session-replay-prompt-rail"
    >
      <div className="flex max-h-[420px] flex-col items-center gap-2 py-2">
        {items.map((item) => {
          const active = item.id === activePromptId;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={`Jump to prompt ${item.turnIndex + 1}`}
              title={item.text}
              onClick={() => onJump(item)}
              className="h-[2px] w-4 rounded-full transition-colors"
              style={{
                backgroundColor: active ? "var(--accent)" : "var(--text-faint)",
              }}
            />
          );
        })}
      </div>
      <div
        className={`pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-2xl group-hover:block group-hover:pointer-events-auto ${panelWidth}`}
      >
        <PromptList
          items={items}
          activePromptId={activePromptId}
          onJump={onJump}
        />
      </div>
    </div>
  );
}
