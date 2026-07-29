import childProcess from "child_process";
import os from "os";

// Injectable seam for every platform/env-dependent lookup in this directory (PlatformDirectories.ts) --
// production code always builds this from the real process.platform/process.env/os.homedir(), tests
// substitute deterministic values to exercise Windows/macOS/Linux behavior from any single host OS.
export type PlatformDirectoryEnvironment = {
    readonly platform: NodeJS.Platform;
    readonly env: NodeJS.ProcessEnv;
    readonly homeDir: string;
    // win32-only: best-effort reader for the current user's actual "Personal" (My Documents) known
    // folder -- the same value Explorer and SHGetKnownFolderPath(FOLDERID_Documents) report, reflecting
    // any relocation (Properties > Location) or localized label ("Dokumente", ...) applied to it.
    // Returns undefined (never throws) when it can't be determined, so PlatformDirectories.ts always has
    // a defined fallback story. Optional/injectable so tests can simulate a moved or localized Documents
    // folder deterministically from any host OS.
    readonly readWindowsDocumentsFolder?: () => string | undefined;
};

export function defaultPlatformDirectoryEnvironment(): PlatformDirectoryEnvironment {
    return {
        platform: process.platform,
        env: process.env,
        homeDir: os.homedir(),
        readWindowsDocumentsFolder: readWindowsPersonalShellFolder,
    };
}

// Node has no built-in Known Folder API binding, so this shells out to reg.exe (present on every
// Windows install) to read the per-user shell-folders registry value -- the same best-effort, never-
// throws-synchronously approach openBrowser.ts uses to shell out to the OS "open" command. A missing
// reg.exe, missing registry key, or any other failure (including running on a non-Windows host, which
// only happens if a caller invokes this directly instead of through the platform === "win32" gate in
// PlatformDirectories.ts) all collapse to the same undefined "couldn't determine it" answer.
function readWindowsPersonalShellFolder(): string | undefined {
    try {
        const output = childProcess.execFileSync(
            "reg",
            ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"],
            {encoding: "utf-8", windowsHide: true},
        );
        const match = output.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/);
        return match ? expandWindowsEnvironmentTokens(match[1].trim()) : undefined;
    } catch {
        return undefined;
    }
}

// REG_EXPAND_SZ values (the common case for this key) carry unexpanded %USERPROFILE%-style tokens.
function expandWindowsEnvironmentTokens(value: string): string {
    return value.replace(/%([^%]+)%/g, (token, name) => process.env[name] ?? token);
}
