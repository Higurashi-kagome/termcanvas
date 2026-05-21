import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentShimLaunchSpec } from "../cli/agent-shims/run.ts";

test("buildAgentShimLaunchSpec launches non-batch commands directly", () => {
  const previousPlatform = process.platform;
  Object.defineProperty(process, "platform", {
    value: "darwin",
    configurable: true,
  });

  try {
    const launch = buildAgentShimLaunchSpec("/usr/local/bin/codex", ["--version"]);
    assert.deepEqual(launch, {
      command: "/usr/local/bin/codex",
      args: ["--version"],
    });
  } finally {
    Object.defineProperty(process, "platform", {
      value: previousPlatform,
      configurable: true,
    });
  }
});

test("buildAgentShimLaunchSpec wraps Windows batch launchers with cmd.exe", () => {
  const previousPlatform = process.platform;
  const previousComSpec = process.env.ComSpec;
  const previousPath = process.env.PATH;

  Object.defineProperty(process, "platform", {
    value: "win32",
    configurable: true,
  });
  process.env.ComSpec = "C:\\Windows\\System32\\cmd.exe";
  process.env.PATH = "C:\\Windows\\System32;C:\\Program Files\\nodejs";

  try {
    const launch = buildAgentShimLaunchSpec(
      "D:\\Program Files\\nodejs\\codex.cmd",
      ["-c", 'mcp_servers.computer-use.command="node"', "--version"],
    );

    assert.deepEqual(launch, {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        '""D:\\Program Files\\nodejs\\codex.cmd" "-c" "mcp_servers.computer-use.command=""node""" "--version""',
      ],
      windowsVerbatimArguments: true,
    });
  } finally {
    Object.defineProperty(process, "platform", {
      value: previousPlatform,
      configurable: true,
    });
    if (previousComSpec === undefined) {
      delete process.env.ComSpec;
    } else {
      process.env.ComSpec = previousComSpec;
    }
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
  }
});
