import {existsSync} from "fs";
import {fileURLToPath} from "url";
import path from "path";
import jestConfigIgnore from "./jest.config.ignore.mjs";

const configDir = path.dirname(fileURLToPath(import.meta.url));
// The "pokie-examples" project below discovers tests in a sibling checkout that isn't part of
// this repo's own git history (see its own comment). That sibling is present in some sandboxes
// but not guaranteed in every environment that runs this config (eg. a fresh clone of just this
// repo) -- and Jest's `roots` validation hard-fails config parsing (killing the *entire*
// multi-project run, every other project included) if a listed root doesn't exist on disk. Detect
// availability up front so absence degrades to "this one project matches zero tests" instead of
// crashing every project's test run.
const pokieExamplesAvailable = existsSync(path.join(configDir, "..", "pokie-examples"));

// Integration/workflow/server/worker/filesystem-heavy test files that get their own slower
// "pokie-integration" project instead of running in the default fast "pokie" lane. Kept as one
// list (matched two ways: glob testMatch here, regex testPathIgnorePatterns below) so the fast
// project's exclusions and the integration project's inclusions can't drift apart.
const integrationTestMatch = [
    "<rootDir>/tests/**/*.integration.test.ts",
    "<rootDir>/tests/server/PokieDevServer.test.ts",
    "<rootDir>/tests/server/PokieClientServer.test.ts",
    "<rootDir>/tests/server/pregenerated/PokieDevServerPreGenerated.test.ts",
    "<rootDir>/tests/cli/studio/StudioServer.test.ts",
    "<rootDir>/tests/simulation/parallel/simulationWorkerEntry.test.ts",
    "<rootDir>/tests/generated/GamePackageGenerator.test.ts",
    "<rootDir>/tests/cli/studio/simulation/StudioSimulationService.realWorkers.test.ts",
    "<rootDir>/tests/cli/commands/SimCommand.realWorkers.test.ts",
];

const integrationTestPathIgnorePatterns = [
    "\\.integration\\.test\\.ts$",
    "/tests/server/PokieDevServer\\.test\\.ts$",
    "/tests/server/PokieClientServer\\.test\\.ts$",
    "/tests/server/pregenerated/PokieDevServerPreGenerated\\.test\\.ts$",
    "/tests/cli/studio/StudioServer\\.test\\.ts$",
    "/tests/simulation/parallel/simulationWorkerEntry\\.test\\.ts$",
    "/tests/generated/GamePackageGenerator\\.test\\.ts$",
    "/tests/cli/studio/simulation/StudioSimulationService\\.realWorkers\\.test\\.ts$",
    "/tests/cli/commands/SimCommand\\.realWorkers\\.test\\.ts$",
];

// The one genuinely standalone lane: a real `npm pack` + `npm install` + real child-process smoke
// test, 5-minute budget. Never mixed into the same jest invocation as everything else.
const packagingTestMatch = ["<rootDir>/tests/packaging/npmPackSmoke.test.ts"];

// studio-client-components' own dominant cost isn't the small explicit setTimeout delays visible in
// most of these files -- it's real per-file wall time from exercising production real-timer polling
// (useSimulationPoll/useReplayPoll's 500ms recursive setTimeout loop) and/or heavy real-timer-driven
// RTL interaction sequences (navigation-guard confirm modals, the Reel Strip Modeler's stale-response
// guards). This list is not a guess -- it's every file measured (via `npm run test:report`) at
// roughly 15s or more of real per-suite runtime, moved out verbatim (no behavior change) so the
// everyday fast lane isn't dominated by them; anything left in studio-client-components measured
// under ~11s. Deliberately not converted to jest.useFakeTimers(): several of these specifically test
// real cleanup/cancellation semantics (a timer actually cancelled on unmount, a stale response
// actually discarded) that fake timers can't verify the same way, since they execute callbacks
// synchronously instead of racing real async work.
const studioClientWorkflowsTestMatch = [
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.simulationWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.runtimeWorkflow.test.tsx",
    // Measured (via `npm run test:report`) at ~17s of real per-suite runtime -- over the fast lane's
    // ~11s ceiling documented above -- once its "Last round shows a round played from Runtime" test
    // started chaining five sequential findBy/waitFor assertions (see that test's own comment). It sat
    // in studio-client-components anyway on the assumption that check:release's coverage-instrumented
    // 5-project lane was the heaviest load it would ever see; check:full's own (uninstrumented,
    // 3-project) `npm test` step proved that wrong by timing this file's "Show advanced details" wait
    // out at 30000ms. Moved here alongside its sibling runtimeWorkflow file for the same
    // contention-isolation reason, rather than raising that wait's timeout a second time.
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/hooks/useSimulationPoll.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/hooks/useReplayPoll.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/integration/happyPath.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/openProjectGuard.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/designNavigationGuard.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.validation.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/navigationGuardModal.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/home/HomePage.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.certificationWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/routing.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.provablyFairWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx",
];

const studioClientWorkflowsTestPathIgnorePatterns = [
    "/components/project/ProjectDashboardPage\\.simulationWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.replayWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.runtimeWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.playWorkflow\\.test\\.tsx$",
    "/hooks/useSimulationPoll\\.test\\.tsx$",
    "/hooks/useReplayPoll\\.test\\.tsx$",
    "/integration/happyPath\\.test\\.tsx$",
    "/components/blueprintEditor/BlueprintEditorPage\\.reelStripModeler\\.test\\.tsx$",
    "/src/openProjectGuard\\.test\\.tsx$",
    "/src/designNavigationGuard\\.test\\.tsx$",
    "/components/blueprintEditor/BlueprintEditorPage\\.validation\\.test\\.tsx$",
    "/src/navigationGuardModal\\.test\\.tsx$",
    "/components/home/HomePage\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.certificationWorkflow\\.test\\.tsx$",
    "/src/routing\\.test\\.tsx$",
    "/components/blueprintEditor/BlueprintEditorPage\\.parSheetImportExport\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.provablyFairWorkflow\\.test\\.tsx$",
    "/components/blueprintEditor/BlueprintEditorPage\\.sections\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.test\\.tsx$",
];

const studioClientComponentsTransform = {
    "^.+\\.tsx?$": ["ts-jest", {tsconfig: "cli/studio-client/tsconfig.json"}],
};

const studioClientComponentsModuleNameMapper = {
    "\\.css$": "<rootDir>/tests/cli/studio-client/src/styleMock.js",
};

// Transpile-only (isolatedModules) transform: the flag lives in tsconfig.test.json's
// compilerOptions, not in ts-jest's own transform options -- setting it at the ts-jest-config level
// is what's deprecated (and what used to print the ts-jest isolatedModules advisory); tsconfig is
// the documented, non-deprecated location. Full type-checking across the whole program happens
// once, separately, via `npm run typecheck` (plain `tsc --noEmit`).
const sourceTestTransform = {
    "^.+\\.ts$": ["ts-jest", {tsconfig: "tsconfig.test.json"}],
};

const sourceTestModuleNameMapper = {
    "^pokie$": "<rootDir>/src/index.ts",
    "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
};

// pokie-examples is a separate sibling checkout (see this repo's own package.json "./client/player"
// export and pokie-examples' own vite.config.js alias, which this mirrors for tests) -- its own
// tests live outside this config's rootDir entirely, so this project needs its own `roots` to have
// Jest discover them at all. "pokie"/"pokie/client/player" resolve the same way pokie-examples'
// own vite.config.js/tsconfig.json resolve them: straight to this repo's own source, not a built
// npm package, so a test here always exercises the exact same code the "pokie" project's own tests
// (tests/cli/client/player/videoSlotRoundView.test.ts) do.
const pokieExamplesModuleNameMapper = {
    "^pokie/client/player$": "<rootDir>/cli/client/player/index.ts",
    "^pokie$": "<rootDir>/src/index.ts",
    "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
};

const pokieExamplesTransform = {
    "^.+\\.ts$": ["ts-jest", {tsconfig: "../pokie-examples/tsconfig.test.json"}],
};

// Coverage options only take effect at the top level under a multi-project ("projects") config --
// Jest ignores per-project collectCoverage*/coveragePathIgnorePatterns settings. collectCoverage
// itself is intentionally NOT set here: coverage instrumentation is opt-in via the `--coverage` CLI
// flag (see package.json's test:coverage/check:release scripts), not part of the default `npm test`
// lane.
export default {
    coveragePathIgnorePatterns: [...jestConfigIgnore],
    collectCoverageFrom: ["./src/**/*.ts"],
    // Several studio-client-components tests exercise the app's own real (unmocked) setTimeout-based
    // polling; under concurrent Jest workers a slow-but-correct assertion needs more room than the
    // 5000ms default, matching setupTests.ts's asyncUtilTimeout. testTimeout is only valid at the top
    // level of a multi-project config, not inside an individual project entry.
    //
    // These numbers are contention headroom only -- they are NOT what fixed the studio-client-workflows
    // lane's gate failures, and raising them repeatedly (15000 -> 60000 -> 90000 -> 120000) never did.
    // The lane's actual failure was memory, and specifically that V8 sizes a process's old-space from
    // os.totalmem() -- the *host's* RAM -- while the gate container is capped by a cgroup the runtime
    // cannot see. Measured here: os.totalmem() reports 7848MiB, memory.max is 2GiB, and a worker's
    // heap_size_limit comes out at 1120MiB. With --maxWorkers=2 that is one main process plus two
    // workers, i.e. up to ~3.3GiB of heap ceiling inside a 2GiB container: every process is still well
    // short of the point where V8 would collect hard when the container has already run out. The file
    // whose worker is killed for that is reported failed with no assertion named, which is exactly the
    // signature this lane kept producing under check:full and never when run on its own (one file alone
    // peaks at ~620-735MiB, comfortably inside the cap). package.json's test:workflows therefore runs
    // Jest under `node --max-old-space-size=512`, which jest-worker forwards to the workers via
    // execArgv (see ChildProcessWorker's fork options) -- verified: the worker's heap_size_limit drops
    // from 1120MiB to 608MiB, so the whole lane's ceiling fits the container with room to spare, at no
    // measurable wall-clock cost. --workerIdleMemoryLimit=192MB complements it by keeping the *between
    // files* footprint flat (Jest re-measures a worker's heapUsed after each file and recycles it past
    // the threshold; one heavy suite of this lane retains ~190-215MB, so it trips on every file that
    // costs anything) -- but it is only checked once a file has finished, so on its own it can neither
    // bound growth within a file nor stop V8 from deferring collection until past the cgroup limit.
    // test:coverage (check:release) runs this same studio-client-workflows project bundled into one
    // invocation alongside the other three projects plus --coverage instrumentation -- strictly more
    // concurrent contention than check:full's dedicated test:workflows step ever sees -- so it carries
    // the identical pair of flags for the same reason, not just the lane run on its own.
    //
    // With that in place 60000ms is ordinary headroom: enough for a test that chains several sequential
    // findBy*/waitFor assertions to each get setupTests.ts's 15000ms asyncUtilTimeout without the whole
    // test running out of budget first; the three single heaviest tests (happyPath, HomePage's
    // confirm-before-leaving, routing's back/forward) still carry their own longer per-test overrides.
    testTimeout: 60000,
    projects: [
        {
            displayName: "pokie",
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testPathIgnorePatterns: [
                "/node_modules/",
                "\\.test\\.tsx$",
                "/tests/packaging/npmPackSmoke\\.test\\.ts$",
                // Frozen file snapshots embedded as phase 4 audit evidence, not this project's own
                // test suite -- they mirror pokie-examples' own tests/ui.test.ts (already exercised
                // for real by the "pokie-examples" project above) and don't resolve against this
                // project's dist-facing moduleNameMapper.
                "/docs/phase4-evidence/",
                ...integrationTestPathIgnorePatterns,
            ],
        },
        {
            displayName: "pokie-examples",
            testEnvironment: "jsdom",
            // jest-environment-jsdom defaults package "exports" resolution to the "browser" condition,
            // which sends "pokie" -> src/index.ts's own exceljs dependency down to uuid's ESM browser
            // build (a real "Unexpected token export" parse failure, not related to anything under
            // test here) -- overriding back to jest-environment-node's own default ("node"/"node-addons")
            // keeps this project's own DOM-heavy tests on jsdom while resolving "pokie"'s dependency
            // tree the same CJS-friendly way the "pokie" project's (node-environment) tests already do.
            testEnvironmentOptions: {customExportConditions: ["node", "node-addons"]},
            moduleFileExtensions: ["ts", "js"],
            // Fall back to this repo's own (always-present) rootDir with a testMatch that can
            // never match anything real, rather than pointing `roots` at a directory that doesn't
            // exist -- see pokieExamplesAvailable above.
            roots: pokieExamplesAvailable ? ["<rootDir>/../pokie-examples"] : ["<rootDir>"],
            ...(pokieExamplesAvailable
                ? {}
                : {testMatch: ["<rootDir>/__pokie_examples_unavailable__/*.test.ts"]}),
            testPathIgnorePatterns: ["/node_modules/"],
            transform: pokieExamplesTransform,
            moduleNameMapper: pokieExamplesModuleNameMapper,
        },
        {
            displayName: "studio-client-components",
            testEnvironment: "jsdom",
            moduleFileExtensions: ["tsx", "ts", "js"],
            testMatch: ["<rootDir>/tests/cli/studio-client/src/**/*.test.tsx"],
            testPathIgnorePatterns: studioClientWorkflowsTestPathIgnorePatterns,
            setupFiles: ["<rootDir>/tests/cli/studio-client/src/jestPolyfills.ts"],
            transform: studioClientComponentsTransform,
            moduleNameMapper: studioClientComponentsModuleNameMapper,
            setupFilesAfterEnv: ["<rootDir>/tests/cli/studio-client/src/setupTests.ts"],
        },
        {
            displayName: "pokie-integration",
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testMatch: integrationTestMatch,
        },
        {
            displayName: "pokie-packaging",
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testMatch: packagingTestMatch,
        },
        {
            // Informational performance baselines (benchmarks/*.bench.ts), never selected by
            // test/check:full/check:release/test:integration -- see benchmarks/README.md for why
            // these deliberately don't gate anything. Its own lane (like pokie-packaging) so
            // `npm run bench` never accidentally runs alongside the correctness suites.
            displayName: "pokie-benchmarks",
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testMatch: ["<rootDir>/benchmarks/**/*.bench.ts"],
        },
        {
            displayName: "studio-client-workflows",
            testEnvironment: "jsdom",
            moduleFileExtensions: ["tsx", "ts", "js"],
            testMatch: studioClientWorkflowsTestMatch,
            setupFiles: ["<rootDir>/tests/cli/studio-client/src/jestPolyfills.ts"],
            transform: studioClientComponentsTransform,
            moduleNameMapper: studioClientComponentsModuleNameMapper,
            setupFilesAfterEnv: ["<rootDir>/tests/cli/studio-client/src/setupTests.ts"],
        },
    ],
};
