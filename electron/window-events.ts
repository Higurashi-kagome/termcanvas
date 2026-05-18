export interface WindowSendTarget {
  isDestroyed?: () => boolean;
  webContents?: {
    isDestroyed?: () => boolean;
    send: (channel: string, ...args: unknown[]) => void;
  };
}

export function canSendToWindow(
  win: WindowSendTarget | null | undefined,
): win is WindowSendTarget & {
  webContents: NonNullable<WindowSendTarget["webContents"]>;
} {
  if (!win) return false;
  if (typeof win.isDestroyed === "function" && win.isDestroyed()) return false;
  if (!win.webContents) return false;
  if (
    typeof win.webContents.isDestroyed === "function" &&
    win.webContents.isDestroyed()
  ) {
    return false;
  }
  return true;
}

function isRecoverableWindowSendError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "EPIPE" ||
    /broken pipe/i.test(error.message) ||
    /object has been destroyed/i.test(error.message)
  );
}

export function sendToWindow(
  win: WindowSendTarget | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  if (!canSendToWindow(win)) return false;
  try {
    win.webContents.send(channel, ...args);
    return true;
  } catch (error) {
    // Swallow only the transient "window went away / pipe broke" cases that
    // happen during shutdown. Everything else should still surface.
    if (isRecoverableWindowSendError(error)) {
      return false;
    }
    throw error;
  }
}
