export function resolveCommandForPlatform(
  command: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === "win32" && command === "npx") {
    return "npx.cmd";
  }

  return command;
}
