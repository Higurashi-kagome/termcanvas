export function buildIgnoredDirectorySummaryPaths(paths: readonly string[]): string[] {
  const directories = [...new Set(paths.filter((path) => path.endsWith("/")))].sort(
    (left, right) => left.localeCompare(right),
  );

  const summary: string[] = [];
  for (const directory of directories) {
    const parent = summary[summary.length - 1];
    if (parent && directory.startsWith(parent)) {
      continue;
    }
    summary.push(directory);
  }

  return summary;
}

export function buildImmediateIgnoredChildPaths(
  parentPath: string,
  paths: readonly string[],
): string[] {
  const parentPrefix = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
  const children = new Set<string>();

  for (const path of paths) {
    if (!path.startsWith(parentPrefix) || path === parentPrefix) {
      continue;
    }

    const remainder = path.slice(parentPrefix.length);
    if (!remainder) continue;

    const separatorIndex = remainder.indexOf("/");
    if (separatorIndex === -1) {
      children.add(`${parentPrefix}${remainder}`);
      continue;
    }

    children.add(`${parentPrefix}${remainder.slice(0, separatorIndex + 1)}`);
  }

  return [...children].sort((left, right) => left.localeCompare(right));
}
