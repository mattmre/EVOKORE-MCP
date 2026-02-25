"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCommandForPlatform = resolveCommandForPlatform;
function resolveCommandForPlatform(command, platform = process.platform) {
    if (platform === "win32" && command === "npx") {
        return "npx.cmd";
    }
    return command;
}
