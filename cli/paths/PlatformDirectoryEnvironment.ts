import os from "os";

// Injectable seam for every platform/env-dependent lookup in this directory (PlatformDirectories.ts) --
// production code always builds this from the real process.platform/process.env/os.homedir(), tests
// substitute deterministic values to exercise Windows/macOS/Linux behavior from any single host OS.
export type PlatformDirectoryEnvironment = {
    readonly platform: NodeJS.Platform;
    readonly env: NodeJS.ProcessEnv;
    readonly homeDir: string;
};

export function defaultPlatformDirectoryEnvironment(): PlatformDirectoryEnvironment {
    return {platform: process.platform, env: process.env, homeDir: os.homedir()};
}
