import {execFileSync} from "child_process";
import fs from "fs";
import path from "path";
import {pathToFileURL} from "url";

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const COMPILED_WORKER_ENTRY = path.join(REPO_ROOT, "dist", "esm", "simulation", "parallel", "internal", "simulationWorkerEntry.js");

// Real worker_threads tests need a real, loadable .js file — a raw ts-jest source import doesn't
// work here because a worker thread is a brand-new Node realm that resolves modules itself (it never
// goes through ts-jest/Jest's moduleNameMapper, which is what normally lets this repo's relative
// `./foo.js` imports resolve to a sibling `foo.ts`). So this points at the real compiled
// dist/esm/simulation/parallel/internal/simulationWorkerEntry.js — the exact file
// ParallelSimulationRunner's own default resolution (see src/simulation/parallel/internal/
// defaultWorkerEntryUrl.ts) points at in a real build — building it on demand if it isn't already
// present (e.g. a fresh checkout that hasn't run `npm run build` yet). If you're iterating on
// src/simulation/parallel/*.ts locally, re-run `npm run build-esm` yourself so these tests pick up
// your changes — this module only builds when the compiled file is missing, not when it's merely
// stale.
//
// Note this is deliberately used as an *explicit override* in these tests, not by exercising
// ParallelSimulationRunner's own default resolution: under ts-jest, `from "pokie"` resolves straight
// to src/index.ts (never a compiled dist/ output), so the default mechanism itself — which locates a
// compiled sibling next to a compiled internal/defaultWorkerEntryUrl.js — has no compiled sibling to
// find there even after this build. The default mechanism is instead verified for real by the npm
// tarball smoke test (tests/packaging/npmPackSmoke.test.ts), which installs and runs the actual
// published package.
function resolveCompiledWorkerEntryUrl(): URL {
    if (!fs.existsSync(COMPILED_WORKER_ENTRY)) {
        execFileSync("npm", ["run", "build-esm"], {cwd: REPO_ROOT, stdio: "inherit"});
    }
    return pathToFileURL(COMPILED_WORKER_ENTRY);
}

export const TEST_WORKER_ENTRY_URL = resolveCompiledWorkerEntryUrl();
