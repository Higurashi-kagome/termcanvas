const GUARDED_STREAMS = new WeakSet<object>();

interface StreamLike {
  on(event: "error", listener: (error: unknown) => void): unknown;
  write: (...args: unknown[]) => unknown;
}

interface GuardDeps {
  scheduleThrow: (error: Error) => void;
}

function isBrokenPipeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    (error as NodeJS.ErrnoException).code === "EPIPE" ||
    /broken pipe/i.test(error.message)
  );
}

export function installBrokenPipeGuards(
  streams: StreamLike[],
  deps: GuardDeps = {
    scheduleThrow: (error) => {
      queueMicrotask(() => {
        throw error;
      });
    },
  },
) {
  for (const stream of streams) {
    if (!stream || GUARDED_STREAMS.has(stream as object)) continue;
    GUARDED_STREAMS.add(stream as object);
    const originalWrite = stream.write.bind(stream);
    stream.write = (...args: unknown[]) => {
      try {
        return originalWrite(...args);
      } catch (error) {
        if (isBrokenPipeError(error)) {
          // Electron-on-Windows can synchronously throw here while logging an
          // earlier failure; treating broken pipes as non-fatal keeps the
          // original error path from cascading into a second crash.
          return false;
        }
        throw error;
      }
    };
    stream.on("error", (error) => {
      if (isBrokenPipeError(error)) {
        return;
      }
      deps.scheduleThrow(
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }
}
