import childProcess from "child_process";

export type ExecLike = (command: string, callback: (error: Error | null) => void) => unknown;

// Best-effort only: opens `url` in the OS default browser, never throws and never rejects — a
// failure here (no display, sandboxed environment, unknown platform, missing `xdg-open`, ...) must
// never fail the calling command. `execImpl` is injectable so tests can assert the exact command
// without actually spawning a process.
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform, execImpl: ExecLike = childProcess.exec): void {
    try {
        execImpl(buildOpenCommand(url, platform), () => undefined);
    } catch {
        // Best-effort: swallow. A shell/spawn failure here shouldn't stop `pokie dev`.
    }
}

function buildOpenCommand(url: string, platform: NodeJS.Platform): string {
    const quotedUrl = `"${url}"`;
    if (platform === "darwin") {
        return `open ${quotedUrl}`;
    }
    if (platform === "win32") {
        return `start "" ${quotedUrl}`;
    }
    return `xdg-open ${quotedUrl}`;
}
