import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {pathToFileURL} from "url";

const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..");
const COMPILED_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "cli", "simulation", "parallel", "simulationWorkerEntry.js");

// Real worker_threads tests need a real, loadable .js file — a raw ts-jest source import doesn't
// work here because a worker thread is a brand-new Node realm that resolves modules itself (it never
// goes through ts-jest/Jest's moduleNameMapper, which is what normally lets this repo's relative
// `./foo.js` imports resolve to a sibling `foo.ts`). So this points at the real compiled
// dist/cli/simulation/parallel/simulationWorkerEntry.js — the exact file production spawns too (see
// cli/pokie.ts's ownSimulationWorkerEntryUrl()) — building it on demand if it isn't already present
// (e.g. a fresh checkout that hasn't run `npm run build` yet). If you're iterating on
// cli/simulation/parallel/*.ts locally, re-run `npm run build-esm && npm run build-cli` yourself so
// these tests pick up your changes — this module only builds when the compiled file is missing, not
// when it's merely stale.
function resolveCompiledWorkerEntryUrl(): URL {
    if (!fs.existsSync(COMPILED_WORKER_ENTRY)) {
        execFileSync("npm", ["run", "build-esm"], {cwd: REPO_ROOT, stdio: "inherit"});
        execFileSync("npm", ["run", "build-cli"], {cwd: REPO_ROOT, stdio: "inherit"});
    }
    return pathToFileURL(COMPILED_WORKER_ENTRY);
}

export const TEST_WORKER_ENTRY_URL = resolveCompiledWorkerEntryUrl();
