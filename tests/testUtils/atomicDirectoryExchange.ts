import {mkdtempSync, mkdirSync, rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";

/**
 * GNU coreutils exposes `mv --exchange` from 9.5 onward. The kernel may support
 * renameat2 long before the host `mv` exposes the option, so probe the actual
 * command publication uses. Platform-specific publication suites stay skipped
 * with this explicit capability check instead of weakening their assertions.
 */
export function supportsAtomicDirectoryExchange(): boolean {
    const root = mkdtempSync(path.join(tmpdir(), "pokie-atomic-probe-"));
    try {
        mkdirSync(path.join(root, "a"));
        mkdirSync(path.join(root, "b"));
        return spawnSync("mv", [
            "--exchange",
            "--no-target-directory",
            path.join(root, "a"),
            path.join(root, "b"),
        ]).status === 0;
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
}
