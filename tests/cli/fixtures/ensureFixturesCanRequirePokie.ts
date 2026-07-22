import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const COMPILED_CJS_ENTRY = path.join(REPO_ROOT, "dist", "cjs", "index.js");
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
// real consumer), mirroring testWorkerEntryUrl.ts's own "build on demand only if missing, never if
// merely stale" pattern for the compiled worker entry point.
export function ensureFixturesCanRequirePokie(): void {
    if (!fs.existsSync(COMPILED_CJS_ENTRY)) {
        execFileSync("npm", ["run", "build-cjs"], {cwd: REPO_ROOT, stdio: "inherit"});
    }
    fs.mkdirSync(FIXTURES_NODE_MODULES, {recursive: true});
    if (!fs.existsSync(POKIE_SYMLINK)) {
        fs.symlinkSync(REPO_ROOT, POKIE_SYMLINK, "dir");
    }
}
