export type PathComparisonPlatform = "darwin" | "win32" | "linux";

function stripWrappingQuotes(pathValue: string): string {
  return pathValue.trim().replace(/^"(.*)"$/, "$1");
}

function normalizeSeparators(
  pathValue: string,
  platform: PathComparisonPlatform,
): string {
  return platform === "win32"
    ? pathValue.replace(/\//g, "\\")
    : pathValue.replace(/\\/g, "/");
}

function collapseDuplicateSeparators(
  pathValue: string,
  platform: PathComparisonPlatform,
): string {
  if (platform === "win32") {
    if (pathValue.startsWith("\\\\")) {
      return (
        "\\\\" +
        pathValue
          .slice(2)
          .replace(/[\\/]+/g, "\\")
      );
    }
    return pathValue.replace(/[\\/]+/g, "\\");
  }
  return pathValue.replace(/\/+/g, "/");
}

function splitPrefix(
  pathValue: string,
  platform: PathComparisonPlatform,
): { prefix: string; rest: string } {
  if (platform === "win32") {
    if (pathValue.startsWith("\\\\")) {
      const withoutPrefix = pathValue.slice(2);
      const parts = withoutPrefix.split("\\");
      const server = parts.shift() ?? "";
      const share = parts.shift() ?? "";
      const prefix = server && share ? `\\\\${server}\\${share}` : "\\\\";
      return {
        prefix,
        rest: parts.join("\\"),
      };
    }

    const driveMatch = pathValue.match(/^[A-Za-z]:/);
    if (driveMatch) {
      const prefix = driveMatch[0];
      return {
        prefix,
        rest: pathValue.slice(prefix.length).replace(/^\\+/, ""),
      };
    }

    if (pathValue.startsWith("\\")) {
      return {
        prefix: "\\",
        rest: pathValue.replace(/^\\+/, ""),
      };
    }
  } else if (pathValue.startsWith("/")) {
    return {
      prefix: "/",
      rest: pathValue.replace(/^\/+/, ""),
    };
  }

  return { prefix: "", rest: pathValue };
}

function resolveDotSegments(
  pathValue: string,
  platform: PathComparisonPlatform,
): string {
  const separator = platform === "win32" ? "\\" : "/";
  const { prefix, rest } = splitPrefix(pathValue, platform);
  const segments = rest.split(separator);
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      const previous = normalized[normalized.length - 1];
      if (previous && previous !== "..") {
        normalized.pop();
      } else if (!prefix) {
        normalized.push("..");
      }
      continue;
    }
    normalized.push(segment);
  }

  const joined = normalized.join(separator);
  if (!prefix) {
    return joined || "";
  }
  if (!joined) {
    return prefix;
  }
  return `${prefix}${separator}${joined}`;
}

function getRootLength(
  pathValue: string,
  platform: PathComparisonPlatform,
): number {
  if (platform === "win32") {
    if (pathValue.startsWith("\\\\")) {
      const withoutPrefix = pathValue.slice(2);
      const firstSep = withoutPrefix.indexOf("\\");
      if (firstSep === -1) {
        return pathValue.length;
      }
      const secondSep = withoutPrefix.indexOf("\\", firstSep + 1);
      return secondSep === -1 ? pathValue.length : secondSep + 2;
    }
    if (/^[A-Za-z]:\\/.test(pathValue)) {
      return 3;
    }
    if (/^[A-Za-z]:$/.test(pathValue)) {
      return 2;
    }
    return pathValue.startsWith("\\") ? 1 : 0;
  }

  return pathValue.startsWith("/") ? 1 : 0;
}

function trimTrailingSeparators(
  pathValue: string,
  platform: PathComparisonPlatform,
): string {
  const rootLength = getRootLength(pathValue, platform);
  if (rootLength === 0 || pathValue.length <= rootLength) {
    return pathValue;
  }

  return pathValue.replace(/[\\/]+$/, "");
}

export function normalizePathForComparison(
  pathValue: string,
  platform?: PathComparisonPlatform,
): string {
  const resolvedPlatform = platform ?? "darwin";
  const trimmed = stripWrappingQuotes(pathValue);
  if (!trimmed) return "";

  const normalized = resolveDotSegments(
    collapseDuplicateSeparators(
      normalizeSeparators(trimmed, resolvedPlatform),
      resolvedPlatform,
    ),
    resolvedPlatform,
  );
  const canonical = trimTrailingSeparators(normalized, resolvedPlatform);
  return resolvedPlatform === "win32" ? canonical.toLowerCase() : canonical;
}
