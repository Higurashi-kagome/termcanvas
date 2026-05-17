import fs from "node:fs";
import path from "node:path";

function getPathEntries(env: NodeJS.ProcessEnv): string[] {
  const pathValue = env.PATH ?? env.Path ?? "";
  return pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function candidateNames(command: string): string[] {
  if (process.platform !== "win32") {
    return [command];
  }

  const lower = command.toLowerCase();
  if (
    lower.endsWith(".exe") ||
    lower.endsWith(".cmd") ||
    lower.endsWith(".bat") ||
    lower.endsWith(".ps1")
  ) {
    return [command];
  }

  return [
    `${command}.exe`,
    `${command}.cmd`,
    `${command}.bat`,
    `${command}.ps1`,
    command,
  ];
}

function resolveExecutable(command: string, env: NodeJS.ProcessEnv): string {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return command;
  }

  for (const dir of getPathEntries(env)) {
    for (const name of candidateNames(command)) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}

export function resolveCliCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; argsPrefix: string[] } {
  const resolved = resolveExecutable(command, env);

  if (process.platform !== "win32") {
    return { command: resolved, argsPrefix: [] };
  }

  const lower = resolved.toLowerCase();
  if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    const comSpec = env.ComSpec || "C:\\Windows\\System32\\cmd.exe";
    return {
      command: comSpec,
      argsPrefix: ["/d", "/s", "/c", resolved],
    };
  }

  if (lower.endsWith(".ps1")) {
    const pwsh = resolveExecutable("pwsh", env);
    return {
      command: pwsh,
      argsPrefix: ["-File", resolved],
    };
  }

  return { command: resolved, argsPrefix: [] };
}
