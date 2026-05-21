import fs from "fs";
import path from "path";

function slugifyAppName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type AppFlavor = "prod" | "dev";

export function readPackagedAppFlavor(resourcesPath: string): AppFlavor | null {
  try {
    const raw = fs.readFileSync(path.join(resourcesPath, "app-flavor.json"), "utf-8");
    const parsed = JSON.parse(raw) as { flavor?: string };
    return parsed.flavor === "dev" ? "dev" : null;
  } catch {
    return null;
  }
}

export function getAppDataDirName(
  appName: string,
  isDevServer: boolean,
  packagedFlavor: AppFlavor | null = null,
): string {
  if (isDevServer || packagedFlavor === "dev") return "termcanvas-dev";
  const slug = slugifyAppName(appName);
  return slug || "termcanvas";
}

export function isDevInstall(
  appName: string,
  isDevServer: boolean,
  packagedFlavor: AppFlavor | null = null,
): boolean {
  if (isDevServer || packagedFlavor === "dev") return true;
  return slugifyAppName(appName).endsWith("-dev");
}
