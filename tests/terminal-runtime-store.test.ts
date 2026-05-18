import test from "node:test";
import assert from "node:assert/strict";

function installRuntimeGlobals() {
  const storage = new Map<string, string>();
  let clipboardText = "";
  const navigator = {
    language: "en-US",
    userAgent: "node-test",
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (value: string) => {
        clipboardText = value;
      },
    },
  };
  const target = new EventTarget();
  const mockWindow = Object.assign(target, {
    navigator,
    termcanvas: undefined as unknown,
    __setClipboardText(value: string) {
      clipboardText = value;
    },
  }) as Window & {
    __setClipboardText: (value: string) => void;
    termcanvas: unknown;
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      clear() {
        storage.clear();
      },
    },
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: navigator,
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: mockWindow,
  });

  return mockWindow;
}

test("terminal host shortcut helpers classify Windows, macOS, and Linux paste/copy chords", async () => {
  installRuntimeGlobals();
  const terminalRuntimeModule = await import(
    "../src/terminal/terminalRuntimeStore.ts"
  ) as unknown as Record<string, unknown>;

  assert.equal(typeof terminalRuntimeModule.isTerminalPasteShortcut, "function");
  assert.equal(typeof terminalRuntimeModule.isTerminalCopyShortcut, "function");

  const isTerminalPasteShortcut =
    terminalRuntimeModule.isTerminalPasteShortcut as (
      event: Pick<
        KeyboardEvent,
        "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
      >,
      platform: "darwin" | "linux" | "win32",
    ) => boolean;
  const isTerminalCopyShortcut =
    terminalRuntimeModule.isTerminalCopyShortcut as (
      event: Pick<
        KeyboardEvent,
        "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
      >,
      platform: "darwin" | "linux" | "win32",
    ) => boolean;

  assert.equal(
    isTerminalPasteShortcut(
      {
        altKey: false,
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: false,
      },
      "win32",
    ),
    true,
  );
  assert.equal(
    isTerminalPasteShortcut(
      {
        altKey: false,
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: true,
      },
      "linux",
    ),
    true,
  );
  assert.equal(
    isTerminalPasteShortcut(
      {
        altKey: false,
        ctrlKey: false,
        key: "v",
        metaKey: true,
        shiftKey: false,
      },
      "darwin",
    ),
    true,
  );
  assert.equal(
    isTerminalPasteShortcut(
      {
        altKey: true,
        ctrlKey: false,
        key: "v",
        metaKey: false,
        shiftKey: false,
      },
      "win32",
    ),
    false,
  );

  assert.equal(
    isTerminalCopyShortcut(
      {
        altKey: false,
        ctrlKey: true,
        key: "c",
        metaKey: false,
        shiftKey: false,
      },
      "win32",
    ),
    true,
  );
  assert.equal(
    isTerminalCopyShortcut(
      {
        altKey: false,
        ctrlKey: true,
        key: "c",
        metaKey: false,
        shiftKey: true,
      },
      "linux",
    ),
    true,
  );
  assert.equal(
    isTerminalCopyShortcut(
      {
        altKey: false,
        ctrlKey: false,
        key: "c",
        metaKey: true,
        shiftKey: false,
      },
      "darwin",
    ),
    true,
  );
  assert.equal(
    isTerminalCopyShortcut(
      {
        altKey: false,
        ctrlKey: true,
        key: "c",
        metaKey: false,
        shiftKey: false,
      },
      "darwin",
    ),
    false,
  );
});

test("terminal clipboard helpers paste text and copy selections through clipboard APIs", async () => {
  const mockWindow = installRuntimeGlobals();
  mockWindow.__setClipboardText("hello from clipboard");
  const { usePreferencesStore } = await import("../src/stores/preferencesStore.ts");
  usePreferencesStore.setState({ terminalSelectionAutoCopyEnabled: false });
  const terminalRuntimeModule = await import(
    "../src/terminal/terminalRuntimeStore.ts"
  ) as unknown as Record<string, unknown>;

  assert.equal(typeof terminalRuntimeModule.pasteTextFromClipboard, "function");
  assert.equal(typeof terminalRuntimeModule.copyTerminalSelection, "function");

  const pasteTextFromClipboard =
    terminalRuntimeModule.pasteTextFromClipboard as (
      xterm: { paste(text: string): void },
    ) => Promise<boolean>;
  const copyTerminalSelection =
    terminalRuntimeModule.copyTerminalSelection as (
      runtime: {
        attachOptions: { onCopy?: () => void } | null;
        meta: { terminal: { id: string } };
      },
      xterm: { getSelection(): string },
    ) => Promise<boolean>;
  const { useTerminalRuntimeStore } = terminalRuntimeModule as {
    useTerminalRuntimeStore: {
      getState(): {
        terminals: Record<string, { copiedNonce: number } | undefined>;
      };
      setState(
        updater:
          | Record<string, unknown>
          | ((state: Record<string, unknown>) => Record<string, unknown>),
      ): void;
    };
  };

  const pastePayloads: string[] = [];
  const pasted = await pasteTextFromClipboard({
    paste(text: string) {
      pastePayloads.push(text);
    },
  });

  assert.equal(pasted, true);
  assert.deepEqual(pastePayloads, ["hello from clipboard"]);

  useTerminalRuntimeStore.setState({
    terminals: {
      "terminal-1": {
        copiedNonce: 0,
        mode: "live",
        previewText: "",
        telemetry: null,
      },
    },
  });

  let copyHookCalls = 0;
  const copied = await copyTerminalSelection(
    {
      attachOptions: {
        onCopy() {
          copyHookCalls += 1;
        },
      },
      meta: {
        terminal: {
          id: "terminal-1",
        },
      },
    },
    {
      getSelection() {
        return "selected text";
      },
    },
  );

  assert.equal(copied, true);
  assert.equal(await navigator.clipboard.readText(), "selected text");
  assert.equal(copyHookCalls, 1);
  assert.equal(
    useTerminalRuntimeStore.getState().terminals["terminal-1"]?.copiedNonce,
    1,
  );
});

test("terminal selection auto copy writes clipboard on mouseup when enabled", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    termcanvas: unknown;
  };
  const { usePreferencesStore } = await import("../src/stores/preferencesStore.ts");
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    attachTerminalContainer,
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
    useTerminalRuntimeStore,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const previousPreferencesState = usePreferencesStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    usePreferencesStore.setState({ terminalSelectionAutoCopyEnabled: true });
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    useTerminalRuntimeStore.setState({
      terminals: {
        "terminal-1": {
          copiedNonce: 0,
          mode: "live",
          previewText: "",
          telemetry: null,
        },
      },
    });

    const host = createFakeContainer();
    const visibleContainer = createFakeContainer();
    visibleContainer.appendChild(host);
    const { xterm, setSelectionText, emitSelectionChange } = createMockXterm();

    runtime.attachedContainer = visibleContainer as unknown as HTMLDivElement;
    runtime.fitAddon = {
      fit() {},
    } as typeof runtime.fitAddon;
    runtime.hostElement = host as unknown as HTMLDivElement;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    attachTerminalContainer(
      "terminal-1",
      visibleContainer as unknown as HTMLDivElement,
    );

    await navigator.clipboard.writeText("previous clipboard");

    host.dispatchEvent("mousedown");
    setSelectionText("copied by selection");
    emitSelectionChange();
    window.dispatchEvent(new Event("mouseup"));

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(await navigator.clipboard.readText(), "copied by selection");
    assert.equal(
      useTerminalRuntimeStore.getState().terminals["terminal-1"]?.copiedNonce,
      1,
    );
  } finally {
    destroyAllTerminalRuntimes();
    usePreferencesStore.setState(previousPreferencesState);
    useProjectStore.setState(previousProjectState);
  }
});

test("terminal selection auto copy does not write clipboard on mouseup when disabled", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    termcanvas: unknown;
  };
  const { usePreferencesStore } = await import("../src/stores/preferencesStore.ts");
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    attachTerminalContainer,
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
    useTerminalRuntimeStore,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const previousPreferencesState = usePreferencesStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    usePreferencesStore.setState({ terminalSelectionAutoCopyEnabled: false });
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    useTerminalRuntimeStore.setState({
      terminals: {
        "terminal-1": {
          copiedNonce: 0,
          mode: "live",
          previewText: "",
          telemetry: null,
        },
      },
    });

    const host = createFakeContainer();
    const visibleContainer = createFakeContainer();
    visibleContainer.appendChild(host);
    const { xterm, setSelectionText, emitSelectionChange } = createMockXterm();

    runtime.attachedContainer = visibleContainer as unknown as HTMLDivElement;
    runtime.fitAddon = {
      fit() {},
    } as typeof runtime.fitAddon;
    runtime.hostElement = host as unknown as HTMLDivElement;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    attachTerminalContainer(
      "terminal-1",
      visibleContainer as unknown as HTMLDivElement,
    );

    await navigator.clipboard.writeText("previous clipboard");

    host.dispatchEvent("mousedown");
    setSelectionText("should not auto copy");
    emitSelectionChange();
    window.dispatchEvent(new Event("mouseup"));

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(await navigator.clipboard.readText(), "previous clipboard");
    assert.equal(
      useTerminalRuntimeStore.getState().terminals["terminal-1"]?.copiedNonce,
      0,
    );
  } finally {
    destroyAllTerminalRuntimes();
    usePreferencesStore.setState(previousPreferencesState);
    useProjectStore.setState(previousProjectState);
  }
});

test("Windows host key handler pastes clipboard text for Ctrl+V and keeps it out of the PTY input path", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    __setClipboardText: (value: string) => void;
    termcanvas: unknown;
  };
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const terminalInputs: string[] = [];

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.__setClipboardText("hello from clipboard");
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input(_ptyId: number, data: string) {
          terminalInputs.push(data);
        },
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    runtime.ptyId = 42;
    const { fitAddon, pastePayloads, triggerKeyEvent, xterm } = createMockXterm();
    runtime.fitAddon = fitAddon as unknown as typeof runtime.fitAddon;
    runtime.hostElement = createFakeContainer() as unknown as HTMLDivElement;
    runtime.attachedContainer = createFakeContainer() as unknown as HTMLDivElement;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    const terminalRuntimeModule = await import(
      "../src/terminal/terminalRuntimeStore.ts"
    ) as unknown as Record<string, unknown>;
    const registerTerminalKeyHandler =
      terminalRuntimeModule.registerTerminalKeyHandler as
        | ((
            runtimeArg: unknown,
            xtermArg: unknown,
          ) => void)
        | undefined;

    assert.equal(typeof registerTerminalKeyHandler, "function");
    registerTerminalKeyHandler?.(runtime, runtime.xterm);

    assert.equal(runtime.inputDisposable !== null, true);
    const shouldPassThrough = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(shouldPassThrough, false);
    assert.deepEqual(pastePayloads, ["hello from clipboard"]);
    assert.deepEqual(terminalInputs, []);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

test("Windows host key handler suppresses the follow-up native paste event after Ctrl+V", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    __setClipboardText: (value: string) => void;
    termcanvas: unknown;
  };
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
    registerTerminalKeyHandler,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.__setClipboardText("hello from clipboard");
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    const { pastePayloads, triggerKeyEvent, triggerPasteEvent, xterm } =
      createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;
    runtime.ptyId = 42;

    registerTerminalKeyHandler(runtime, runtime.xterm);

    const shouldPassThrough = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );
    const nativePasteEvent = triggerPasteEvent("textarea", "hello from clipboard");

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(shouldPassThrough, false);
    assert.equal(nativePasteEvent.defaultPrevented, true);
    assert.deepEqual(pastePayloads, ["hello from clipboard"]);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

test("Windows host key handler copies selection for Ctrl+C but passes through when there is no selection", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    termcanvas: unknown;
  };
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    getTerminalRuntime,
    ensureTerminalRuntime,
    registerTerminalKeyHandler,
    useTerminalRuntimeStore,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    const { setSelectionText, triggerKeyEvent, xterm } = createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;
    runtime.ptyId = 42;

    useTerminalRuntimeStore.setState({
      terminals: {
        "terminal-1": {
          copiedNonce: 0,
          mode: "live",
          previewText: "",
          telemetry: null,
        },
      },
    });

    let onCopyCalls = 0;
    runtime.attachOptions = {
      onCopy() {
        onCopyCalls += 1;
      },
    };

    registerTerminalKeyHandler(runtime, runtime.xterm);

    setSelectionText("selected text");
    const copied = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "c",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(copied, false);
    assert.equal(await navigator.clipboard.readText(), "selected text");
    assert.equal(onCopyCalls, 1);
    assert.equal(
      useTerminalRuntimeStore.getState().terminals["terminal-1"]?.copiedNonce,
      1,
    );

    setSelectionText("");
    const passedThrough = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "c",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    assert.equal(passedThrough, true);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

test("Windows host key handler supports Shift+Insert paste and Ctrl+Insert copy", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    __setClipboardText: (value: string) => void;
    termcanvas: unknown;
  };
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    getTerminalRuntime,
    ensureTerminalRuntime,
    registerTerminalKeyHandler,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.__setClipboardText("insert paste");
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    const { pastePayloads, setSelectionText, triggerKeyEvent, xterm } = createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;
    runtime.ptyId = 42;

    registerTerminalKeyHandler(runtime, runtime.xterm);

    const pasted = triggerKeyEvent(
      {
        ctrlKey: false,
        key: "Insert",
        metaKey: false,
        shiftKey: true,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(pasted, false);
    assert.deepEqual(pastePayloads, ["insert paste"]);

    setSelectionText("copy via insert");
    const copied = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "Insert",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(copied, false);
    assert.equal(await navigator.clipboard.readText(), "copy via insert");
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

test("macOS and Linux host key handlers follow their platform paste conventions", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    __setClipboardText: (value: string) => void;
    termcanvas: unknown;
  };
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    getTerminalRuntime,
    ensureTerminalRuntime,
    registerTerminalKeyHandler,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.__setClipboardText("platform paste");
    mockWindow.termcanvas = {
      app: { platform: "darwin" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    const { pastePayloads, triggerKeyEvent, xterm } = createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;
    runtime.ptyId = 42;

    registerTerminalKeyHandler(runtime, runtime.xterm);

    const macPaste = triggerKeyEvent(
      {
        ctrlKey: false,
        key: "v",
        metaKey: true,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(macPaste, false);
    assert.deepEqual(pastePayloads, ["platform paste"]);

    mockWindow.termcanvas = {
      ...(mockWindow.termcanvas as Record<string, unknown>),
      app: { platform: "linux" },
    };

    const linuxPaste = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: true,
        type: "keydown",
      } as KeyboardEvent,
    );
    const linuxPlainCtrlV = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(linuxPaste, false);
    assert.equal(linuxPlainCtrlV, true);
    assert.deepEqual(pastePayloads, ["platform paste", "platform paste"]);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

test("paste shortcut stays intercepted when clipboard read fails", async () => {
  const mockWindow = installRuntimeGlobals() as Window & {
    termcanvas: unknown;
  };
  const originalReadText = navigator.clipboard.readText;
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    getTerminalRuntime,
    ensureTerminalRuntime,
    registerTerminalKeyHandler,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  let terminalInputCalls = 0;

  destroyAllTerminalRuntimes();

  try {
    navigator.clipboard.readText = async () => {
      throw new Error("clipboard unavailable");
    };

    seedProjectState(useProjectStore);
    mockWindow.termcanvas = {
      app: { platform: "win32" },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {
          terminalInputCalls += 1;
        },
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) return;

    const { pastePayloads, triggerKeyEvent, xterm } = createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;
    runtime.ptyId = 42;

    registerTerminalKeyHandler(runtime, runtime.xterm);

    const shouldPassThrough = triggerKeyEvent(
      {
        ctrlKey: true,
        key: "v",
        metaKey: false,
        shiftKey: false,
        type: "keydown",
      } as KeyboardEvent,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(shouldPassThrough, false);
    assert.deepEqual(pastePayloads, []);
    assert.equal(terminalInputCalls, 0);
  } finally {
    navigator.clipboard.readText = originalReadText;
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

function createTerminal() {
  return {
    id: "terminal-1",
    title: "Terminal",
    type: "shell" as const,
    minimized: false,
    focused: true,
    ptyId: 42,
    status: "running" as const,
    span: { cols: 1, rows: 1 },
  };
}

function seedProjectState(
  useProjectStore: typeof import("../src/stores/projectStore.ts").useProjectStore,
  terminal = createTerminal(),
) {
  useProjectStore.setState({
    focusedProjectId: "project-1",
    focusedWorktreeId: "worktree-1",
    projects: [
      {
        id: "project-1",
        name: "Project One",
        path: "/tmp/project-1",
        position: { x: 0, y: 0 },
        collapsed: false,
        zIndex: 0,
        worktrees: [
          {
            id: "worktree-1",
            name: "main",
            path: "/tmp/project-1",
            position: { x: 0, y: 0 },
            collapsed: false,
            terminals: [terminal],
          },
        ],
      },
    ],
  });
}

function createFakeContainer() {
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const node = {
    children: [] as Array<ReturnType<typeof createFakeContainer>>,
    parentElement: null as ReturnType<typeof createFakeContainer> | null,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const entries = listeners.get(type) ?? [];
      entries.push(toEventListener(listener));
      listeners.set(type, entries);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      const entries = listeners.get(type);
      if (!entries) {
        return;
      }

      const normalized = toEventListener(listener);
      const index = entries.findIndex((entry) => entry === normalized);
      if (index >= 0) {
        entries.splice(index, 1);
      }
      if (entries.length === 0) {
        listeners.delete(type);
      }
    },
    dispatchEvent(eventOrType: Event | string) {
      const event =
        typeof eventOrType === "string"
          ? ({ type: eventOrType } as Event)
          : eventOrType;
      const entries = listeners.get(event.type) ?? [];
      for (const listener of [...entries]) {
        listener(event);
      }
      return true;
    },
    appendChild(child: ReturnType<typeof createFakeContainer>) {
      child.parentElement?.removeChild(child);
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    removeChild(child: ReturnType<typeof createFakeContainer>) {
      this.children = this.children.filter((entry) => entry !== child);
      if (child.parentElement === this) {
        child.parentElement = null;
      }
      return child;
    },
  };

  return node;
}

function createMockXterm() {
  let customKeyHandler: ((event: KeyboardEvent) => boolean) | null = null;
  let selectionText = "";
  let selectionChangeListener: (() => void) | null = null;
  const pastePayloads: string[] = [];
  const element = createFakeEventNode((text: string) => {
    pastePayloads.push(text);
  });
  const textarea = createFakeEventNode((text: string) => {
    pastePayloads.push(text);
  });
  const stats = {
    blurCalls: 0,
    customKeyHandlerRegistrations: 0,
    disposeCalls: 0,
    fitCalls: 0,
    focusCalls: 0,
    inputBindingDisposeCalls: 0,
    loadAddonCalls: 0,
    refreshCalls: 0,
    resizeBindingDisposeCalls: 0,
    selectAllCalls: 0,
    selectionBindingDisposeCalls: 0,
    selectionPointerCleanupCalls: 0,
    selectionSubscriptions: 0,
  };

  const xterm = {
    cols: 80,
    element,
    rows: 24,
    options: {},
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      customKeyHandler = handler;
      stats.customKeyHandlerRegistrations += 1;
    },
    blur() {
      stats.blurCalls += 1;
    },
    dispose() {
      stats.disposeCalls += 1;
    },
    focus() {
      stats.focusCalls += 1;
    },
    getSelection() {
      return selectionText;
    },
    loadAddon() {
      stats.loadAddonCalls += 1;
    },
    onData() {
      return {
        dispose() {
          stats.inputBindingDisposeCalls += 1;
        },
      };
    },
    onResize() {
      return {
        dispose() {
          stats.resizeBindingDisposeCalls += 1;
        },
      };
    },
    onSelectionChange(listener: () => void) {
      selectionChangeListener = listener;
      stats.selectionSubscriptions += 1;
      return {
        dispose() {
          selectionChangeListener = null;
          stats.selectionBindingDisposeCalls += 1;
        },
      };
    },
    paste(text: string) {
      pastePayloads.push(text);
    },
    refresh() {
      stats.refreshCalls += 1;
    },
    selectAll() {
      stats.selectAllCalls += 1;
    },
    scrollToBottom() {},
    textarea,
    write() {},
  };

  const fitAddon = {
    fit() {
      stats.fitCalls += 1;
    },
  };

  return {
    fitAddon,
    emitSelectionChange() {
      selectionChangeListener?.();
    },
    pastePayloads,
    setSelectionText(value: string) {
      selectionText = value;
    },
    stats,
    triggerKeyEvent(event: KeyboardEvent) {
      if (!customKeyHandler) {
        throw new Error("custom key handler was not registered");
      }
      return customKeyHandler(event);
    },
    triggerPasteEvent(target: "element" | "textarea", text: string) {
      return xterm[target].dispatchPaste(text);
    },
    xterm,
  };
}

function createFakeEventNode(onNativePaste: (text: string) => void) {
  const pasteListeners: Array<(event: Event) => void> = [];

  return {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type !== "paste") {
        return;
      }

      pasteListeners.push(toEventListener(listener));
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      if (type !== "paste") {
        return;
      }

      const normalized = toEventListener(listener);
      const index = pasteListeners.findIndex((entry) => entry === normalized);
      if (index >= 0) {
        pasteListeners.splice(index, 1);
      }
    },
    dispatchPaste(text: string) {
      let defaultPrevented = false;
      let immediateStopped = false;
      const event = {
        defaultPrevented: false,
        preventDefault() {
          defaultPrevented = true;
          this.defaultPrevented = true;
        },
        stopImmediatePropagation() {
          immediateStopped = true;
        },
        type: "paste",
      } as Event & { defaultPrevented: boolean };

      for (const listener of [...pasteListeners]) {
        listener(event);
        if (immediateStopped) {
          break;
        }
      }

      if (!defaultPrevented) {
        onNativePaste(text);
      }

      return event;
    },
  };
}

function toEventListener(listener: EventListenerOrEventListenerObject) {
  if (typeof listener === "function") {
    return listener;
  }

  return (event: Event) => listener.handleEvent(event);
}

test("destroyTerminalRuntime clears live pty ids from runtime overlay state", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { useTerminalRuntimeStateStore } = await import(
    "../src/stores/terminalRuntimeStateStore.ts"
  );
  const {
    destroyAllTerminalRuntimes,
    destroyTerminalRuntime,
    ensureTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousState = useProjectStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    mockWindow.termcanvas = {
      terminal: {
        destroy: async () => {},
      },
    };

    destroyTerminalRuntime("terminal-1");

    assert.equal(
      useTerminalRuntimeStateStore.getState().terminals["terminal-1"]?.ptyId,
      null,
    );
  } finally {
    destroyAllTerminalRuntimes();
    useTerminalRuntimeStateStore.getState().reset();
    useProjectStore.setState(previousState);
  }
});

test("projectStore runtime actions update overlay state without mutating the scene tree", async () => {
  installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    resolveTerminalWithRuntimeState,
    useTerminalRuntimeStateStore,
  } = await import("../src/stores/terminalRuntimeStateStore.ts");
  const previousState = useProjectStore.getState();

  try {
    useProjectStore.setState({
      focusedProjectId: "project-1",
      focusedWorktreeId: "worktree-1",
      projects: [
        {
          id: "project-1",
          name: "Project One",
          path: "/tmp/project-1",
          position: { x: 0, y: 0 },
          collapsed: false,
          zIndex: 0,
          worktrees: [
            {
              id: "worktree-1",
              name: "main",
              path: "/tmp/project-1",
              position: { x: 0, y: 0 },
              collapsed: false,
              terminals: [
                {
                  id: "terminal-1",
                  title: "Terminal",
                  type: "shell",
                  minimized: false,
                  focused: true,
                  ptyId: null,
                  status: "idle",
                  span: { cols: 1, rows: 1 },
                },
              ],
            },
          ],
        },
      ],
    });

    const store = useProjectStore.getState();
    store.updateTerminalPtyId("project-1", "worktree-1", "terminal-1", 42);
    store.updateTerminalStatus("project-1", "worktree-1", "terminal-1", "running");
    store.updateTerminalSessionId(
      "project-1",
      "worktree-1",
      "terminal-1",
      "session-live",
    );

    const rawTerminal =
      useProjectStore.getState().projects[0].worktrees[0].terminals[0];
    const liveTerminal = resolveTerminalWithRuntimeState(rawTerminal);

    assert.equal(rawTerminal.ptyId, null);
    assert.equal(rawTerminal.status, "idle");
    assert.equal(rawTerminal.sessionId, undefined);
    assert.equal(liveTerminal.ptyId, 42);
    assert.equal(liveTerminal.status, "running");
    assert.equal(liveTerminal.sessionId, "session-live");
    assert.deepEqual(
      useTerminalRuntimeStateStore.getState().terminals["terminal-1"],
      {
        ptyId: 42,
        status: "running",
        sessionId: "session-live",
      },
    );
  } finally {
    useTerminalRuntimeStateStore.getState().reset();
    useProjectStore.setState(previousState);
  }
});

test("parked runtimes keep the live xterm, dispose live bindings, reuse the host, and clear parked hosts on destroy", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { registerTerminal } = await import("../src/terminal/terminalRegistry.ts");
  const {
    attachTerminalContainer,
    destroyAllTerminalRuntimes,
    destroyTerminalRuntime,
    detachTerminalContainer,
    ensureTerminalRuntime,
    getTerminalRuntime,
    serializeAllTerminalRuntimeBuffers,
    setTerminalRuntimeMode,
    useTerminalRuntimeStore,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousState = useProjectStore.getState();
  const resizeCalls: Array<{ cols: number; ptyId: number; rows: number }> = [];

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    mockWindow.termcanvas = {
      terminal: {
        destroy: async () => {},
        input() {},
        resize(ptyId: number, cols: number, rows: number) {
          resizeCalls.push({ cols, ptyId, rows });
        },
      },
    };

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const host = createFakeContainer();
    const liveContainer = createFakeContainer();
    const parkedContainer = createFakeContainer();
    const visibleContainer = createFakeContainer();
    const { fitAddon, stats, xterm } = createMockXterm();
    const serializeAddon = {
      serialize() {
        return "live buffer";
      },
    };

    liveContainer.appendChild(host);
    runtime.attachedContainer = liveContainer as unknown as HTMLDivElement;
    runtime.fitAddon = fitAddon as unknown as typeof runtime.fitAddon;
    runtime.hostElement = host as unknown as HTMLDivElement;
    runtime.inputDisposable = {
      dispose() {
        stats.inputBindingDisposeCalls += 1;
      },
    };
    runtime.previewAnsi = "preview fallback";
    runtime.resizeDisposable = {
      dispose() {
        stats.resizeBindingDisposeCalls += 1;
      },
    };
    runtime.selectionDisposable = {
      dispose() {
        stats.selectionBindingDisposeCalls += 1;
      },
    } as typeof runtime.selectionDisposable;
    runtime.selectionPointerCleanup = () => {
      stats.selectionPointerCleanupCalls += 1;
    };
    runtime.serializeAddon = serializeAddon as typeof runtime.serializeAddon;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    registerTerminal(
      "terminal-1",
      runtime.xterm as NonNullable<typeof runtime.xterm>,
      serializeAddon as NonNullable<typeof runtime.serializeAddon>,
    );

    setTerminalRuntimeMode("terminal-1", "parked");

    assert.equal(useTerminalRuntimeStore.getState().terminals["terminal-1"]?.mode, "parked");
    assert.equal(runtime.xterm, xterm);
    assert.equal(stats.blurCalls, 1);
    assert.equal(stats.disposeCalls, 0);
    assert.equal(stats.inputBindingDisposeCalls, 1);
    assert.equal(stats.resizeBindingDisposeCalls, 1);
    assert.equal(stats.selectionBindingDisposeCalls, 1);
    assert.equal(stats.selectionPointerCleanupCalls, 1);
    assert.equal(runtime.selectionDisposable, null);
    assert.equal(runtime.selectionPointerCleanup, null);
    assert.equal(host.parentElement, null);
    assert.equal(serializeAllTerminalRuntimeBuffers()["terminal-1"], "live buffer");

    setTerminalRuntimeMode("terminal-1", "live");
    attachTerminalContainer("terminal-1", visibleContainer as unknown as HTMLDivElement);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(runtime.xterm, xterm);
    assert.equal(host.parentElement, visibleContainer);
    assert.equal(stats.disposeCalls, 0);
    assert.equal(stats.selectionSubscriptions, 1);
    assert.ok(runtime.selectionDisposable);
    assert.equal(typeof runtime.selectionPointerCleanup, "function");
    assert.equal(stats.fitCalls >= 1, true);
    assert.deepEqual(resizeCalls.at(-1), {
      cols: 80,
      ptyId: 42,
      rows: 24,
    });

    detachTerminalContainer("terminal-1");
    assert.equal(host.parentElement, null);

    parkedContainer.appendChild(host);
    destroyTerminalRuntime("terminal-1");

    assert.equal(stats.disposeCalls, 1);
    assert.equal(host.parentElement, null);
    assert.equal(runtime.hostElement, null);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousState);
  }
});

test("parked runtimes apply font preference updates without fitting against the parking host", async () => {
  const mockWindow = installRuntimeGlobals();
  const { buildFontFamily } = await import("../src/terminal/fontRegistry.ts");
  const { usePreferencesStore } = await import("../src/stores/preferencesStore.ts");
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
    setTerminalRuntimeMode,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const previousPreferencesState = usePreferencesStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.termcanvas = {
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const { fitAddon, stats, xterm } = createMockXterm();
    runtime.fitAddon = fitAddon as unknown as typeof runtime.fitAddon;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    setTerminalRuntimeMode("terminal-1", "parked");
    usePreferencesStore.getState().setTerminalFontSize(18);
    usePreferencesStore.getState().setTerminalFontFamily("jetbrains-mono");

    assert.equal(runtime.mode, "parked");
    assert.equal(stats.fitCalls, 0);
    assert.equal(runtime.xterm?.options.fontSize, 18);
    assert.equal(runtime.xterm?.options.fontFamily, buildFontFamily("jetbrains-mono"));
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
    usePreferencesStore.setState(previousPreferencesState);
  }
});

test("terminal renderer preference can release and reacquire WebGL on a live runtime", async () => {
  const mockWindow = installRuntimeGlobals();
  const { usePreferencesStore } = await import("../src/stores/preferencesStore.ts");
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { releaseWebGL } = await import("../src/terminal/webglContextPool.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const previousPreferencesState = usePreferencesStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.termcanvas = {
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const { stats, xterm } = createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    usePreferencesStore.getState().setTerminalRenderer("dom");
    usePreferencesStore.getState().setTerminalRenderer("webgl");
    assert.equal(stats.loadAddonCalls, 1);

    usePreferencesStore.getState().setTerminalRenderer("dom");
    usePreferencesStore.getState().setTerminalRenderer("webgl");
    assert.equal(stats.loadAddonCalls, 2);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
    usePreferencesStore.setState(previousPreferencesState);
    releaseWebGL("terminal-1");
  }
});

test("acquireWebGL warns users to switch renderers when WebGL is unavailable", async () => {
  installRuntimeGlobals();
  const { useLocaleStore } = await import("../src/stores/localeStore.ts");
  const { useNotificationStore } = await import("../src/stores/notificationStore.ts");
  const { acquireWebGL, releaseWebGL } = await import("../src/terminal/webglContextPool.ts");
  const previousLocaleState = useLocaleStore.getState();
  const previousNotificationState = useNotificationStore.getState();
  let notified: { message: string; type: "error" | "info" | "warn" } | null = null;

  try {
    useLocaleStore.setState({ locale: "en" });
    useNotificationStore.setState({
      notifications: [],
      notify: (type, message) => {
        notified = { type, message };
      },
    });

    const xterm = {
      cols: 80,
      rows: 24,
      loadAddon() {
        throw new Error("WebGL unsupported");
      },
    };

    assert.equal(acquireWebGL("terminal-1", xterm as never), false);
    assert.deepEqual(notified, {
      type: "warn",
      message:
        "WebGL terminal rendering is unavailable. Switch to DOM in Settings > Appearance.",
    });
  } finally {
    releaseWebGL("terminal-1");
    useLocaleStore.setState(previousLocaleState);
    useNotificationStore.setState(previousNotificationState);
  }
});

test("starting a parked runtime does not fit or resize the hidden terminal host", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
    setTerminalRuntimeMode,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const resizeCalls: Array<{ cols: number; ptyId: number; rows: number }> = [];
  let createCalls = 0;

  destroyAllTerminalRuntimes();

  try {
    const terminal = {
      ...createTerminal(),
      ptyId: null,
    };
    seedProjectState(useProjectStore, terminal);

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal,
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const host = createFakeContainer();
    const liveContainer = createFakeContainer();
    const { fitAddon, stats, xterm } = createMockXterm();
    liveContainer.appendChild(host);
    runtime.attachedContainer = liveContainer as unknown as HTMLDivElement;
    runtime.fitAddon = fitAddon as unknown as typeof runtime.fitAddon;
    runtime.hostElement = host as unknown as HTMLDivElement;
    runtime.serializeAddon = {
      serialize() {
        return "live buffer";
      },
    } as typeof runtime.serializeAddon;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    setTerminalRuntimeMode("terminal-1", "live");
    setTerminalRuntimeMode("terminal-1", "parked");

    mockWindow.termcanvas = {
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
      terminal: {
        create: async () => {
          createCalls += 1;
          return 100 + createCalls;
        },
        destroy: async () => {},
        input() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize(ptyId: number, cols: number, rows: number) {
          resizeCalls.push({ cols, ptyId, rows });
        },
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal,
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(runtime.mode, "parked");
    assert.equal(runtime.attachedContainer, null);
    assert.equal(runtime.ptyId, 101);
    assert.equal(stats.fitCalls, 0);
    assert.deepEqual(resizeCalls, []);
    assert.equal(runtime.inputDisposable, null);
    assert.equal(runtime.resizeDisposable, null);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});

test("selectAllTerminalRuntime selects the focused xterm buffer", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    getTerminalRuntime,
    selectAllTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousState = useProjectStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    mockWindow.termcanvas = {
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const { stats, xterm } = createMockXterm();
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    assert.equal(selectAllTerminalRuntime("terminal-1"), true);
    assert.equal(stats.selectAllCalls, 1);
    assert.equal(selectAllTerminalRuntime("missing-terminal"), false);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousState);
  }
});

test("focusTerminalRuntime focuses without refresh", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useCanvasStore } = await import("../src/stores/canvasStore.ts");
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    focusTerminalRuntime,
    getTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const previousCanvasState = useCanvasStore.getState();

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore);
    useCanvasStore.setState({
      isAnimating: false,
      viewport: { x: 0, y: 0, scale: 0.6 },
    });

    mockWindow.termcanvas = {
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
      session: {
        onTurnComplete() {
          return () => {};
        },
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const { stats, xterm } = createMockXterm();
    runtime.rendererMode = "webgl";
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    assert.equal(focusTerminalRuntime("terminal-1"), true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(stats.focusCalls, 1);
    assert.equal(stats.refreshCalls, 0);
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
    useCanvasStore.setState({
      isAnimating: previousCanvasState.isAnimating,
      viewport: previousCanvasState.viewport,
    });
  }
});

test("reattaching a parked runtime reacquires WebGL after the pool evicts it", async () => {
  const mockWindow = installRuntimeGlobals();
  const { usePreferencesStore } = await import("../src/stores/preferencesStore.ts");
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { acquireWebGL, releaseWebGL } = await import("../src/terminal/webglContextPool.ts");
  const {
    attachTerminalContainer,
    destroyAllTerminalRuntimes,
    destroyTerminalRuntime,
    ensureTerminalRuntime,
    getTerminalRuntime,
    setTerminalRuntimeMode,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousState = useProjectStore.getState();
  const previousPreferencesState = usePreferencesStore.getState();

  destroyAllTerminalRuntimes();

  try {
    usePreferencesStore.getState().setTerminalRenderer("webgl");
    seedProjectState(useProjectStore);

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    mockWindow.termcanvas = {
      terminal: {
        destroy: async () => {},
        input() {},
        resize() {},
      },
    };

    const runtime = getTerminalRuntime("terminal-1");
    assert.ok(runtime);
    if (!runtime) {
      return;
    }

    const host = createFakeContainer();
    const liveContainer = createFakeContainer();
    const visibleContainer = createFakeContainer();
    const { fitAddon, stats, xterm } = createMockXterm();
    const serializeAddon = {
      serialize() {
        return "live buffer";
      },
    };

    liveContainer.appendChild(host);
    runtime.attachedContainer = liveContainer as unknown as HTMLDivElement;
    runtime.fitAddon = fitAddon as unknown as typeof runtime.fitAddon;
    runtime.hostElement = host as unknown as HTMLDivElement;
    runtime.serializeAddon = serializeAddon as typeof runtime.serializeAddon;
    runtime.xterm = xterm as unknown as typeof runtime.xterm;

    assert.equal(
      acquireWebGL(
        "terminal-1",
        runtime.xterm as NonNullable<typeof runtime.xterm>,
      ),
      true,
    );
    assert.equal(stats.loadAddonCalls, 1);

    setTerminalRuntimeMode("terminal-1", "parked");
    releaseWebGL("terminal-1");
    setTerminalRuntimeMode("terminal-1", "live");
    attachTerminalContainer("terminal-1", visibleContainer as unknown as HTMLDivElement);

    assert.equal(host.parentElement, visibleContainer);
    assert.equal(stats.loadAddonCalls, 2);

    destroyTerminalRuntime("terminal-1");
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousState);
    usePreferencesStore.setState(previousPreferencesState);
    releaseWebGL("terminal-1");
  }
});

test("manual terminal viewport refresh redraws registered xterms immediately", async () => {
  const {
    registerTerminal,
    refreshRegisteredTerminalViewports,
    unregisterTerminal,
  } = await import("../src/terminal/terminalRegistry.ts");
  const first = createMockXterm();
  const second = createMockXterm();
  const serializeAddon = {
    serialize() {
      return "live buffer";
    },
  };

  try {
    registerTerminal(
      "terminal-1",
      first.xterm as unknown as import("@xterm/xterm").Terminal,
      serializeAddon as unknown as import("@xterm/addon-serialize").SerializeAddon,
    );
    registerTerminal(
      "terminal-2",
      second.xterm as unknown as import("@xterm/xterm").Terminal,
      serializeAddon as unknown as import("@xterm/addon-serialize").SerializeAddon,
    );

    refreshRegisteredTerminalViewports("terminal-1");
    assert.equal(first.stats.refreshCalls, 1);
    assert.equal(second.stats.refreshCalls, 0);

    refreshRegisteredTerminalViewports();
    assert.equal(first.stats.refreshCalls, 2);
    assert.equal(second.stats.refreshCalls, 1);

    refreshRegisteredTerminalViewports("missing-terminal");
    assert.equal(first.stats.refreshCalls, 2);
    assert.equal(second.stats.refreshCalls, 1);
  } finally {
    unregisterTerminal("terminal-1");
    unregisterTerminal("terminal-2");
  }
});

test("codex SessionStart hook cancels fallback polling and preserves the exact session", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { useTerminalRuntimeStateStore } = await import(
    "../src/stores/terminalRuntimeStateStore.ts"
  );
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  let sessionStartListener: ((
    payload: {
      terminalId: string;
      sessionId: string;
      transcriptPath: string | null;
      cwd: string | null;
    },
  ) => void) | null = null;
  let findCodexCalls = 0;
  const watchCalls: Array<{
    cwd: string;
    sessionId: string;
    type: string;
  }> = [];
  const attachCalls: Array<{
    confidence: string;
    cwd: string;
    provider: string;
    sessionId: string;
    terminalId: string;
  }> = [];

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore, {
      ...createTerminal(),
      ptyId: null,
      status: "idle",
      title: "codex",
      type: "codex",
    });

    mockWindow.termcanvas = {
      hooks: {
        getHealth: async () => ({
          eventsReceived: 0,
          lastEventAt: null,
          parseErrors: 0,
          socketPath: null,
        }),
        getSocketPath: async () => null,
        onSessionStarted(
          callback: (payload: {
            terminalId: string;
            sessionId: string;
            transcriptPath: string | null;
            cwd: string | null;
          }) => void,
        ) {
          sessionStartListener = callback;
          return () => {
            if (sessionStartListener === callback) {
              sessionStartListener = null;
            }
          };
        },
        onStopFailure() {
          return () => {};
        },
        onTurnComplete() {
          return () => {};
        },
      },
      session: {
        findCodex: async () => {
          findCodexCalls += 1;
          return { confidence: "medium", sessionId: "wrong-session" };
        },
        getBypassState: async () => false,
        getCodexLatest: async () => "baseline-session",
        onTurnComplete() {
          return () => {};
        },
        unwatch: async () => {},
        watch: async (type: string, sessionId: string, cwd: string) => {
          watchCalls.push({ cwd, sessionId, type });
          return { ok: true };
        },
      },
      telemetry: {
        attachSession: async (input: {
          confidence: string;
          cwd: string;
          provider: string;
          sessionId: string;
          terminalId: string;
        }) => {
          attachCalls.push(input);
          return { ok: true, sessionFile: `/tmp/${input.sessionId}.jsonl` };
        },
        detachSession: async () => {},
        getTerminal: async () => null,
        onSnapshotChanged() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.ok(
      sessionStartListener,
      "codex runtime should register a SessionStart hook listener",
    );

    sessionStartListener?.({
      cwd: "/tmp/project-1",
      sessionId: "correct-session",
      terminalId: "terminal-1",
      transcriptPath: "/tmp/correct-session.jsonl",
    });

    await new Promise((resolve) => setTimeout(resolve, 650));

    assert.equal(findCodexCalls, 0);
    assert.deepEqual(watchCalls, [
      {
        cwd: "/tmp/project-1",
        sessionId: "correct-session",
        type: "codex",
      },
    ]);
    assert.deepEqual(attachCalls, [
      {
        confidence: "strong",
        cwd: "/tmp/project-1",
        provider: "codex",
        sessionId: "correct-session",
        terminalId: "terminal-1",
      },
    ]);
    assert.equal(
      useTerminalRuntimeStateStore.getState().terminals["terminal-1"]?.sessionId,
      "correct-session",
    );
  } finally {
    destroyAllTerminalRuntimes();
    useTerminalRuntimeStateStore.getState().reset();
    useProjectStore.setState(previousProjectState);
  }
});

test("wuu polling attaches the discovered session to telemetry", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { useTerminalRuntimeStateStore } = await import(
    "../src/stores/terminalRuntimeStateStore.ts"
  );
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const watchCalls: Array<{
    cwd: string;
    sessionId: string;
    type: string;
  }> = [];
  const attachCalls: Array<{
    confidence: string;
    cwd: string;
    provider: string;
    sessionId: string;
    terminalId: string;
  }> = [];
  let findWuuCalls = 0;

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore, {
      ...createTerminal(),
      ptyId: null,
      status: "idle",
      title: "wuu",
      type: "wuu",
    });

    mockWindow.termcanvas = {
      session: {
        findWuu: async () => {
          findWuuCalls += 1;
          return {
            confidence: "medium",
            filePath: "/tmp/project-1/.wuu/sessions/wuu-session.jsonl",
            sessionId: "wuu-session",
          };
        },
        onTurnComplete() {
          return () => {};
        },
        unwatch: async () => {},
        watch: async (type: string, sessionId: string, cwd: string) => {
          watchCalls.push({ cwd, sessionId, type });
          return { ok: true };
        },
      },
      telemetry: {
        attachSession: async (input: {
          confidence: string;
          cwd: string;
          provider: string;
          sessionId: string;
          terminalId: string;
        }) => {
          attachCalls.push(input);
          return { ok: true, sessionFile: `/tmp/${input.sessionId}.jsonl` };
        },
        detachSession: async () => {},
        getTerminal: async () => null,
        onSnapshotChanged() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    assert.ok(findWuuCalls > 0);
    assert.deepEqual(watchCalls, [
      {
        cwd: "/tmp/project-1",
        sessionId: "wuu-session",
        type: "wuu",
      },
    ]);
    assert.deepEqual(attachCalls, [
      {
        confidence: "medium",
        cwd: "/tmp/project-1",
        provider: "wuu",
        sessionId: "wuu-session",
        terminalId: "terminal-1",
      },
    ]);
    assert.equal(
      useTerminalRuntimeStateStore.getState().terminals["terminal-1"]?.sessionId,
      "wuu-session",
    );
  } finally {
    destroyAllTerminalRuntimes();
    useTerminalRuntimeStateStore.getState().reset();
    useProjectStore.setState(previousProjectState);
  }
});

test("opencode polling attaches the discovered session to telemetry", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const { useTerminalRuntimeStateStore } = await import(
    "../src/stores/terminalRuntimeStateStore.ts"
  );
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  const watchCalls: Array<{
    cwd: string;
    sessionId: string;
    type: string;
  }> = [];
  const attachCalls: Array<{
    confidence: string;
    cwd: string;
    provider: string;
    sessionId: string;
    terminalId: string;
  }> = [];
  let findOpenCodeCalls = 0;

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore, {
      ...createTerminal(),
      ptyId: null,
      status: "idle",
      title: "opencode",
      type: "opencode",
    });

    mockWindow.termcanvas = {
      session: {
        findOpenCode: async () => {
          findOpenCodeCalls += 1;
          return {
            confidence: "medium",
            filePath: "/tmp/opencode.db",
            sessionId: "ses_opencode",
          };
        },
        onTurnComplete() {
          return () => {};
        },
        unwatch: async () => {},
        watch: async (type: string, sessionId: string, cwd: string) => {
          watchCalls.push({ cwd, sessionId, type });
          return { ok: true };
        },
      },
      telemetry: {
        attachSession: async (input: {
          confidence: string;
          cwd: string;
          provider: string;
          sessionId: string;
          terminalId: string;
        }) => {
          attachCalls.push(input);
          return { ok: true, sessionFile: "/tmp/opencode.db" };
        },
        detachSession: async () => {},
        getTerminal: async () => null,
        onSnapshotChanged() {
          return () => {};
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 1_100));

    assert.ok(findOpenCodeCalls > 0);
    assert.deepEqual(watchCalls, [
      {
        cwd: "/tmp/project-1",
        sessionId: "ses_opencode",
        type: "opencode",
      },
    ]);
    assert.deepEqual(attachCalls, [
      {
        confidence: "medium",
        cwd: "/tmp/project-1",
        provider: "opencode",
        sessionId: "ses_opencode",
        terminalId: "terminal-1",
      },
    ]);
    assert.equal(
      useTerminalRuntimeStateStore.getState().terminals["terminal-1"]?.sessionId,
      "ses_opencode",
    );
  } finally {
    destroyAllTerminalRuntimes();
    useTerminalRuntimeStateStore.getState().reset();
    useProjectStore.setState(previousProjectState);
  }
});

test("push telemetry updates replace a live terminal's first_user_prompt when the session changes", async () => {
  const mockWindow = installRuntimeGlobals();
  const { useProjectStore } = await import("../src/stores/projectStore.ts");
  const {
    destroyAllTerminalRuntimes,
    ensureTerminalRuntime,
    useTerminalRuntimeStore,
  } = await import("../src/terminal/terminalRuntimeStore.ts");
  const previousProjectState = useProjectStore.getState();
  let snapshotListener:
    | ((payload: { terminalId: string; snapshot: Record<string, unknown> }) => void)
    | null = null;

  destroyAllTerminalRuntimes();

  try {
    seedProjectState(useProjectStore, {
      ...createTerminal(),
      title: "codex",
      type: "codex",
    });

    mockWindow.termcanvas = {
      hooks: {
        onSessionStarted() {
          return () => {};
        },
        onStopFailure() {
          return () => {};
        },
        onTurnComplete() {
          return () => {};
        },
      },
      session: {
        getBypassState: async () => false,
        getCodexLatest: async () => "baseline-session",
        onTurnComplete() {
          return () => {};
        },
        unwatch: async () => {},
        watch: async () => ({ ok: true }),
      },
      telemetry: {
        attachSession: async () => ({ ok: true, sessionFile: null }),
        detachSession: async () => {},
        getTerminal: async () => null,
        onSnapshotChanged(
          callback: (payload: {
            terminalId: string;
            snapshot: Record<string, unknown>;
          }) => void,
        ) {
          snapshotListener = callback;
          return () => {
            if (snapshotListener === callback) {
              snapshotListener = null;
            }
          };
        },
      },
      terminal: {
        create: async () => 42,
        destroy: async () => {},
        input() {},
        notifyThemeChanged() {},
        onExit() {
          return () => {};
        },
        onOutput() {
          return () => {};
        },
        resize() {},
      },
    };

    ensureTerminalRuntime({
      projectId: "project-1",
      terminal: useProjectStore.getState().projects[0].worktrees[0].terminals[0],
      worktreeId: "worktree-1",
      worktreePath: "/tmp/project-1",
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.ok(snapshotListener, "runtime should subscribe to telemetry push updates");

    snapshotListener?.({
      terminalId: "terminal-1",
      snapshot: {
        terminal_id: "terminal-1",
        worktree_path: "/tmp/project-1",
        provider: "codex",
        session_attached: true,
        session_attach_confidence: "strong",
        session_id: "session-old",
        session_file: "/tmp/session-old.jsonl",
        first_user_prompt: "旧会话标题",
        turn_state: "turn_complete",
        pty_alive: true,
        descendant_processes: [],
        active_tool_calls: 0,
        task_status: "idle",
        task_status_source: "turn_state",
        result_exists: false,
        derived_status: "idle",
      },
    });

    assert.equal(
      useTerminalRuntimeStore.getState().terminals["terminal-1"]?.telemetry
        ?.first_user_prompt,
      "旧会话标题",
    );

    snapshotListener?.({
      terminalId: "terminal-1",
      snapshot: {
        terminal_id: "terminal-1",
        worktree_path: "/tmp/project-1",
        provider: "codex",
        session_attached: true,
        session_attach_confidence: "strong",
        session_id: "session-new",
        session_file: "/tmp/session-new.jsonl",
        first_user_prompt: "新会话标题",
        turn_state: "turn_complete",
        pty_alive: true,
        descendant_processes: [],
        active_tool_calls: 0,
        task_status: "idle",
        task_status_source: "turn_state",
        result_exists: false,
        derived_status: "idle",
      },
    });

    const telemetry =
      useTerminalRuntimeStore.getState().terminals["terminal-1"]?.telemetry;
    assert.equal(telemetry?.session_id, "session-new");
    assert.equal(telemetry?.session_file, "/tmp/session-new.jsonl");
    assert.equal(telemetry?.first_user_prompt, "新会话标题");
  } finally {
    destroyAllTerminalRuntimes();
    useProjectStore.setState(previousProjectState);
  }
});
