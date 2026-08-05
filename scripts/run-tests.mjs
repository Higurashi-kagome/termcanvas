import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const suites = {
  main: [
    "tests/pty-launch.test.ts",
    "tests/computer-use-mcp-handler.test.ts",
    "tests/pty-manager.test.ts",
    "tests/window-events.test.ts",
    "tests/render-throttling-coordinator.test.ts",
    "tests/visibility-observer.test.ts",
    "tests/diff-card-expansion.test.ts",
    "tests/session-watcher.test.ts",
    "tests/summary-scheduler.test.ts",
    "tests/process-detector.test.ts",
    "tests/preferences-store.test.ts",
    "tests/left-panel-ui-state-store.test.ts",
    "tests/history-section-collapse-render.test.tsx",
    "tests/cli-launchers.test.ts",
    "tests/cli-registration.test.ts",
    "tests/hydra-project-enable.test.ts",
    "tests/canvas-surface-stack.test.ts",
    "tests/pin-store.test.ts",
    "tests/pin-store-renderer.test.ts",
    "tests/pin-dispatch.test.ts",
    "tests/attachment-url.test.ts",
    "tests/insights-engine.test.ts",
    "tests/usage-collector.test.ts",
    "tests/usage-heatmap-layout.test.ts",
    "tests/pet-movement.test.ts",
    "tests/terminal-state.test.ts",
    "tests/terminal-focus-scheduler.test.ts",
    "tests/terminal-focus-regression.test.ts",
    "tests/terminal-adapters.test.ts",
    "tests/terminal-find-store.test.ts",
    "tests/terminal-runtime-policy.test.ts",
    "tests/terminal-runtime-store.test.ts",
    "tests/xterm-mouse-scale-patch.test.ts",
    "tests/terminal-scene-actions.test.ts",
    "tests/snapshot-state.test.ts",
    "tests/canvas-xyflow-rewrite.test.ts",
    "tests/close-focus-target.test.ts",
    "tests/confirm-dialog.test.ts",
    "tests/viewport-bounds.test.ts",
    "tests/drawing-layer.test.ts",
    "tests/annotation-geometry.test.ts",
    "tests/annotation-scene-actions.test.ts",
    "tests/scene-card-actions.test.ts",
    "tests/scene-delete-actions.test.ts",
    "tests/scene-selection-actions.test.ts",
    "tests/composer-submit.test.ts",
    "tests/composer-input-behavior.test.ts",
    "tests/composer-store.test.ts",
    "tests/composer-targeting.test.ts",
    "tests/slash-commands.test.ts",
    "tests/shortcut-behavior.test.ts",
    "tests/git-content-layout.test.ts",
    "tests/git-diff.test.ts",
    "tests/git-info.test.ts",
    "tests/git-graph.test.ts",
    "tests/git-watcher.test.ts",
    "tests/card-layout-store.test.ts",
    "tests/hover-card-visibility.test.ts",
    "tests/project-panel-order.test.ts",
    "tests/project-panel-scene-persistence.test.ts",
    "tests/project-store-persistence.test.ts",
    "tests/project-store-sync-worktrees.test.ts",
    "tests/project-store-focus.test.ts",
    "tests/project-store-terminal-order.test.ts",
    "tests/project-tree-pinning-render.test.tsx",
    "tests/session-panel-model.test.ts",
    "tests/theme-palette.test.ts",
    "tests/updater-store.test.ts",
    "tests/close-flow.test.ts",
    "tests/telemetry-service.test.ts",
    "tests/terminal-telemetry-panel.test.ts",
    "tests/headless-project-store.test.ts",
    "tests/headless-artifact-collector.test.ts",
    "tests/memory-service.test.ts",
    "tests/memory-index-generator.test.ts",
    "tests/agent-reflow.test.ts",
    "tests/headless-api-server-observability.test.ts",
    "tests/headless-sse.test.ts",
    "tests/headless-webhook.test.ts",
    "tests/headless-runtime-shutdown.test.ts",
    "tests/headless-cli-control.test.ts",
    "tests/headless-workflow-control.test.ts",
    "tests/headless-worktree-control.test.ts",
    "tests/server-container-contract.test.ts",
    "tests/api-server-pin-resolver.test.ts",
    "tests/session-search-index.test.ts",
    "tests/project-path-match.test.ts",
    "tests/path-comparison-browser-bundle.test.ts",
    "tests/project-path-match-browser-bundle.test.ts",
  ],
  hydra: [
    "hydra/tests/standalone-e2e.test.ts",
    "hydra/tests/workflow-lead.test.ts",
    "hydra/tests/cleanup.test.ts",
  ],
};

const [suiteName = "main", ...extraArgs] = process.argv.slice(2);
const suite = suites[suiteName];
const require = createRequire(import.meta.url);

if (!suite) {
  console.error(
    `Unknown test suite: ${suiteName}\nAvailable suites: ${Object.keys(suites).join(", ")}`,
  );
  process.exit(1);
}

const tsxPackageJson = require.resolve("tsx/package.json");
const tsxCli = path.join(path.dirname(tsxPackageJson), "dist", "cli.mjs");
const result = spawnSync(
  process.execPath,
  [tsxCli, "--test", ...extraArgs, ...suite],
  {
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
