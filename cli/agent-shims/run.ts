import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  getComputerUseMcpConfigArgs,
  type ComputerUseMcpProvider,
} from "../../shared/computer-use-mcp";

const HELP_ARGS = new Set(["-h", "--help", "help", "-v", "--version", "version"]);

export interface AgentShimLaunchSpec {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function defaultStateFilePath(): string {
  return path.join(os.homedir(), ".termcanvas", "computer-use", "state.json");
}

function resolveStateFilePath(): string | null {
  const configured = process.env.TERMCANVAS_COMPUTER_USE_STATE_FILE?.trim();
  const stateFilePath = configured || defaultStateFilePath();
  return stateFilePath;
}

function resolveMcpServerPath(): string | null {
  const configured = process.env.TERMCANVAS_COMPUTER_USE_MCP_SERVER?.trim();
  if (configured && fs.existsSync(configured)) return configured;

  const dir = moduleDir();
  const candidates = [
    path.resolve(dir, "..", "..", "mcp-computer-use-server", "index.js"),
    path.resolve(dir, "..", "..", "mcp", "computer-use-server", "dist", "index.js"),
    path.resolve(dir, "..", "..", "dist-computer-use", "mcp-computer-use-server", "index.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveInstructionsPath(): string | null {
  const configured = process.env.TERMCANVAS_COMPUTER_USE_INSTRUCTIONS?.trim();
  if (configured && fs.existsSync(configured)) return configured;

  const dir = moduleDir();
  const candidates = [
    path.resolve(dir, "..", "..", "skills", "computer-use-instructions.md"),
    path.resolve(dir, "..", "..", "..", "skills", "computer-use-instructions.md"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function commandCandidates(command: string): string[] {
  if (process.platform !== "win32") return [command];

  const lower = command.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    return [command];
  }
  return [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command];
}

function normalizePathEntry(entry: string): string {
  const normalized = path.resolve(entry);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function resolveRealCommand(command: string): string | null {
  const shimDir = normalizePathEntry(moduleDir());
  const pathEntries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    if (normalizePathEntry(entry) === shimDir) continue;
    for (const candidateName of commandCandidates(command)) {
      const candidate = path.join(entry, candidateName);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }

  return null;
}

function isWindowsBatchScript(command: string): boolean {
  if (process.platform !== "win32") return false;
  const lower = command.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function escapeWindowsBatchValue(value: string): string {
  return value.replace(/%/g, "%%").replace(/"/g, '""');
}

function quoteWindowsBatchArgument(value: string): string {
  return `"${escapeWindowsBatchValue(value)}"`;
}

function resolveWindowsCommandShell(): string | null {
  const candidates = [
    process.env.ComSpec?.trim(),
    "cmd.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }

    const resolved = resolveRealCommand(candidate);
    if (resolved) return resolved;
  }

  return null;
}

export function buildAgentShimLaunchSpec(
  realCommand: string,
  args: string[],
): AgentShimLaunchSpec {
  if (!isWindowsBatchScript(realCommand)) {
    return {
      command: realCommand,
      args,
    };
  }

  const commandShell = resolveWindowsCommandShell();
  if (!commandShell) {
    throw new Error("TermCanvas could not resolve cmd.exe for Windows batch launch.");
  }

  const commandLine = `""${escapeWindowsBatchValue(realCommand)}"${
    args.length ? ` ${args.map(quoteWindowsBatchArgument).join(" ")}` : ""
  }"`;

  return {
    command: commandShell,
    args: ["/d", "/s", "/c", commandLine],
    windowsVerbatimArguments: true,
  };
}

function shouldInjectMcp(args: string[]): boolean {
  return !args.some((arg) => HELP_ARGS.has(arg));
}

function getInjectedArgs(
  provider: ComputerUseMcpProvider,
  args: string[],
): string[] {
  const stateFilePath = resolveStateFilePath();
  const mcpServerPath = resolveMcpServerPath();
  if (!stateFilePath || !mcpServerPath || !shouldInjectMcp(args)) {
    return args;
  }
  const instructionsFilePath = resolveInstructionsPath();
  if (instructionsFilePath) {
    process.env.TERMCANVAS_COMPUTER_USE_INSTRUCTIONS = instructionsFilePath;
  }

  return [
    ...getComputerUseMcpConfigArgs(provider, {
      mcpServerPath,
      stateFilePath,
      instructionsFilePath: instructionsFilePath ?? undefined,
    }),
    ...args,
  ];
}

export function runAgentShim(provider: ComputerUseMcpProvider): never {
  const realCommand = resolveRealCommand(provider);
  if (!realCommand) {
    console.error(`TermCanvas could not find the real ${provider} executable in PATH.`);
    process.exit(127);
  }

  const args = getInjectedArgs(provider, process.argv.slice(2));
  const launchSpec = buildAgentShimLaunchSpec(realCommand, args);
  const result = spawnSync(launchSpec.command, launchSpec.args, {
    stdio: "inherit",
    env: process.env,
    windowsVerbatimArguments: launchSpec.windowsVerbatimArguments,
  });

  if (result.error) {
    console.error(`${provider} failed to start: ${result.error.message}`);
    process.exit(127);
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status ?? 1);
}
