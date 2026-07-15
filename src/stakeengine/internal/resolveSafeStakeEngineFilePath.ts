import path from "path";

// Resolves "fileName" (a value read from an untrusted index.json/pokie-manifest.json) against "stakeDir",
// refusing anything that isn't a plain, single-segment basename that stays inside stakeDir: an absolute path, a
// "."/".." segment, any "/" or "\" separator at all (Stake's own exporter never nests output files in
// subdirectories, so a caller-controlled path with directory components is never legitimate), or anything that,
// after path.resolve, doesn't land directly inside stakeDir (defense in depth against any exotic OS-specific
// resolution quirk the basename check alone might miss). Returns undefined — never throws — so callers can
// treat an unsafe filename as a clear diagnostic rather than ever passing it to fs.
export function resolveSafeStakeEngineFilePath(stakeDir: string, fileName: string): string | undefined {
    if (fileName.length === 0 || fileName.includes("/") || fileName.includes("\\")) {
        return undefined;
    }
    if (fileName === "." || fileName === "..") {
        return undefined;
    }
    if (path.basename(fileName) !== fileName) {
        return undefined;
    }

    const resolvedDir = path.resolve(stakeDir);
    const resolvedFile = path.resolve(resolvedDir, fileName);
    return path.dirname(resolvedFile) === resolvedDir ? resolvedFile : undefined;
}
