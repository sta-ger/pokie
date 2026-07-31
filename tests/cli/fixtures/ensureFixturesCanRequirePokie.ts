import fs from "fs";
import path from "path";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
const COMPILED_ESM_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");
const FIXTURES_NODE_MODULES = path.join(__dirname, "node_modules");
const POKIE_SYMLINK = path.join(FIXTURES_NODE_MODULES, "pokie");

// The fixture game packages in this directory (playable-game, -with-bonus-round, -with-free-games,
// -with-serializer) each do a bare `require("pokie")` inside their own index.js, deliberately --
// that's exactly what a real external game package looks like. When one of these is loaded inside a
// real worker_thread (a fresh Node realm -- never through ts-jest's moduleNameMapper, which is what
// lets `from "pokie"` resolve to src/index.ts everywhere else in this repo), Node has to resolve
// "pokie" for real. Node's self-reference resolution only fires when the *nearest ancestor*
// package.json is itself named "pokie" -- but each fixture's own package.json is named after the
// fixture, so self-reference never fires, and with no node_modules/pokie anywhere, resolution fails
// deterministically (not intermittently) every time. This gives fixtures a real, resolvable "pokie"
// without touching their bare `require("pokie")` (which would make them less representative of a
// real consumer). The real-worker tests need both CJS (the fixture's bare require) and ESM (their
// worker entry), so build the package once as one atomic test prerequisite. In a fresh clone two Jest
// workers used to race and launch multiple overlapping CJS/ESM compilers; the shared lock below makes
// all waiters reuse one complete runtime build instead.
export function ensureFixturesCanRequirePokie(): void {
    ensureCompiledTestOutput({
        repositoryRoot: REPO_ROOT,
        outputPaths: [COMPILED_CJS_ENTRY, COMPILED_ESM_WORKER_ENTRY],
        lockName: "compiled-runtime",
        command: ["npm", "run", "build-test-runtime"],
    });
    fs.mkdirSync(FIXTURES_NODE_MODULES, {recursive: true});
    // Parallel jest workers (--maxWorkers=2) can each pass the existsSync check before either has
    // created the link, so guard the creation itself: whoever loses the race sees EEXIST for the
    // link the winner already made, which is exactly the state we wanted, so treat it as success.
    // A task clone may inherit a fixture symlink created inside a disposable
    // container (`/workspace`).  Treat that stale target as absent: otherwise
    // real worker tests fail only after a clone/container boundary.
    let needsLink = !fs.existsSync(POKIE_SYMLINK);
    if (!needsLink) {
        try {
            needsLink = fs.realpathSync(POKIE_SYMLINK) !== fs.realpathSync(REPO_ROOT);
        } catch {
            needsLink = true;
        }
    }
    if (needsLink) {
        fs.rmSync(POKIE_SYMLINK, {force: true, recursive: true});
        try {
            fs.symlinkSync(REPO_ROOT, POKIE_SYMLINK, "dir");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        }
    }
}
