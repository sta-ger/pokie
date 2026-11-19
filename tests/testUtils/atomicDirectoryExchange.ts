import {chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";

// GNU coreutils exposes `mv --exchange` from 9.5 onward. The kernel commonly
// supports renameat2 long before the host `mv` exposes the option. These
// platform-specific publication tests exercise the real syscall, not a mock,
// so install a test-only `mv` shim when the native command lacks it. Production
// falls back to same-directory renames; this helper keeps the exchange fast
// path covered on older hosts.
function probeNativeExchange(): boolean {
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

const SHIM_SOURCE = `#!/usr/bin/env python3
import ctypes
import os
import sys

args = sys.argv[1:]
exchange = "--exchange" in args
no_clobber = "--no-clobber" in args
paths = [value for value in args if not value.startswith("-")]
if len(paths) != 2:
    sys.stderr.write("mv shim: expected exactly two paths\\n")
    sys.exit(2)
source, destination = (os.fsencode(value) for value in paths)
AT_FDCWD = -100
RENAME_NOREPLACE = 1
RENAME_EXCHANGE = 2
flags = RENAME_EXCHANGE if exchange else RENAME_NOREPLACE if no_clobber else 0
libc = ctypes.CDLL(None, use_errno=True)
renameat2 = getattr(libc, "renameat2", None)
if renameat2 is not None:
    result = renameat2(AT_FDCWD, source, AT_FDCWD, destination, flags)
else:
    # Linux x86_64 renameat2 syscall number.
    result = libc.syscall(316, AT_FDCWD, source, AT_FDCWD, destination, flags)
if result != 0:
    error = ctypes.get_errno()
    sys.stderr.write(f"mv shim: {os.strerror(error)}\\n")
    sys.exit(1)
`;

let installed = false;

export function ensureAtomicDirectoryExchange(): void {
    if (installed || probeNativeExchange()) {
        installed = true;
        return;
    }
    if (process.platform !== "linux") {
        throw new Error("Atomic directory exchange requires a host with mv --exchange or Linux renameat2.");
    }
    // Jest's sandbox `process.env` does not always reach native child_process
    // lookups. node_modules/.bin is already on the real npm-script PATH, so
    // installing the shim there makes the production spawnSync("mv") call find
    // it without changing product code.
    const bin = path.join(process.cwd(), "node_modules", ".bin");
    mkdirSync(bin, {recursive: true});
    const shim = path.join(bin, "mv");
    if (!existsSync(shim)) {
        const temporary = path.join(bin, `.mv-shim-${process.pid}-${Date.now()}`);
        writeFileSync(temporary, SHIM_SOURCE);
        chmodSync(temporary, 0o755);
        renameSync(temporary, shim);
    }
    if (!probeNativeExchange()) {
        throw new Error("Atomic directory exchange shim was installed but the renameat2 probe failed.");
    }
    installed = true;
}
