import childProcess from "child_process";

export type ExecFileLike = (command: string, args: string[], callback: (error: Error | null) => void) => unknown;

// Best-effort only: opens `folderPath` in the OS's default file manager, never throws — a failure here
// (no display, sandboxed environment, unknown platform, missing xdg-open, ...) must never fail the
// calling request. Same "single-user local tool" reasoning as StudioNativePickerService, and the same
// argument-array-via-execFile discipline (never a shell), so a folderPath containing quotes, `$()`,
// backticks, etc. can never be interpreted as a second command — see openBrowser.ts for the analogous
// "open a URL" version of this.
export function openInFileManager(
    folderPath: string,
    platform: NodeJS.Platform = process.platform,
    execFileImpl: ExecFileLike = (command, args, callback) => childProcess.execFile(command, args, callback),
): void {
    try {
        const [command, args] = buildOpenCommand(folderPath, platform);
        execFileImpl(command, args, () => undefined);
    } catch {
        // best-effort only.
    }
}

function buildOpenCommand(folderPath: string, platform: NodeJS.Platform): [string, string[]] {
    if (platform === "darwin") {
        return ["open", [folderPath]];
    }
    if (platform === "win32") {
        return ["explorer", [folderPath]];
    }
    return ["xdg-open", [folderPath]];
}
