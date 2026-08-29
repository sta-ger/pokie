import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";

const WAIT_FOR_BUILD_MS = 100;
const BUILD_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const ABANDONED_LOCK_GRACE_MS = 30 * 1000;

function wait(milliseconds: number): void {
    // This helper is deliberately synchronous because it runs during test-module evaluation, before
    // Jest has entered an async test. Atomics.wait avoids a shell dependency and does not consume a
    // CPU while another Jest worker owns the build.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function ownerIsAlive(lockDirectory: string): boolean {
    let owner: {pid?: unknown};
    try {
        owner = JSON.parse(fs.readFileSync(path.join(lockDirectory, "owner.json"), "utf8")) as {pid?: unknown};
    } catch {
        return false;
    }
    if (typeof owner.pid !== "number" || !Number.isInteger(owner.pid) || owner.pid <= 0) {
        return false;
    }
    try {
        process.kill(owner.pid, 0);
        return true;
    } catch (error) {
        // EPERM means the process exists but belongs to another user; ESRCH is a dead owner.
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
}

/**
 * Build a test-only compiled entry at most once per repository, even when Jest evaluates the
 * importing helper in multiple worker processes. The normal fast path remains a single existsSync.
 *
 * The lock lives in node_modules' disposable cache area, deliberately outside dist: `npm run build`
 * clears dist before compiling, so a lock inside it would disappear while its owner was still working.
 * Waiters never run a second compiler: they wait cheaply for the owner and verify the requested entry
 * after it exits.
 */
export function ensureCompiledTestOutput(options: {
    repositoryRoot: string;
    outputPaths: readonly string[];
    lockName: string;
    command: readonly string[];
    // End-to-end tests that execute a built binary need their production
    // surface rebuilt from the current checkout, rather than borrowing a
    // previously generated dist artifact.
    forceRebuild?: boolean;
}): void {
    const {repositoryRoot, outputPaths, lockName, command, forceRebuild = false} = options;
    const outputsExist = () => outputPaths.every((outputPath) => fs.existsSync(outputPath));
    if (!forceRebuild && outputsExist()) {
        return;
    }

    const lockDirectory = path.join(repositoryRoot, "node_modules", ".cache", "pokie-test-build-locks", `${lockName}.lock`);
    // Jest necessarily has node_modules available, but the helper's own isolated tests intentionally
    // do not. Creating only the cache parent is safe: the compiler remains the sole writer of dist.
    fs.mkdirSync(path.dirname(lockDirectory), {recursive: true});
    const deadline = Date.now() + BUILD_WAIT_TIMEOUT_MS;

    for (;;) {
        if (!forceRebuild && outputsExist()) {
            return;
        }

        try {
            fs.mkdirSync(lockDirectory, {recursive: false});
            try {
                fs.writeFileSync(path.join(lockDirectory, "owner.json"), JSON.stringify({pid: process.pid}));
                // A previous owner can finish between our initial exists check and lock acquisition.
                if (forceRebuild || !outputsExist()) {
                    execFileSync(command[0], [...command.slice(1)], {cwd: repositoryRoot, stdio: "inherit"});
                }
            } finally {
                fs.rmSync(lockDirectory, {recursive: true, force: true});
            }
            if (!outputsExist()) {
                throw new Error(`The test build command completed without creating every required output: ${outputPaths.join(", ")}.`);
            }
            return;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        }

        // A killed Jest worker must not strand a later run behind its lock. Do not reclaim a freshly
        // created lock with no marker yet: its owner may simply be between mkdir and writeFileSync.
        try {
            const age = Date.now() - fs.statSync(lockDirectory).mtimeMs;
            if (age >= ABANDONED_LOCK_GRACE_MS && !ownerIsAlive(lockDirectory)) {
                fs.rmSync(lockDirectory, {recursive: true, force: true});
                continue;
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                continue;
            }
            throw error;
        }

        if (Date.now() >= deadline) {
            throw new Error(`Timed out waiting for another Jest worker to build required outputs: ${outputPaths.join(", ")}.`);
        }
        wait(WAIT_FOR_BUILD_MS);
    }
}
