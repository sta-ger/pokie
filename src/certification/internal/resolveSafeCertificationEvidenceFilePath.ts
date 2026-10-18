import fs from "fs";
import path from "path";
import {resolveSafeStakeEngineFilePath} from "../../stakeengine/internal/resolveSafeStakeEngineFilePath.js";

/** Closed basename inventory plus physical containment. A symlink is never an evidence attachment. */
export function resolveSafeCertificationEvidenceFilePath(directory: string, file: string): string | undefined {
    const resolved = resolveSafeStakeEngineFilePath(directory, file);
    if (!resolved) return undefined;
    try {
        if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) return undefined;
        if (fs.lstatSync(resolved).isSymbolicLink() || !fs.statSync(resolved).isFile()) return undefined;
        return path.dirname(fs.realpathSync(resolved)) === fs.realpathSync(directory) ? resolved : undefined;
    } catch {
        return undefined;
    }
}
