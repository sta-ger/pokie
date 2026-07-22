import jestConfigIgnore from "./jest.config.ignore.mjs";

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
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.mechanicsEditorWorkflow.test.tsx",
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
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.outcomeLibrariesWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/routing.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.deploymentWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.provablyFairWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.stakeEngineExportWorkflow.test.tsx",
    "<rootDir>/tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx",
];

const studioClientWorkflowsTestPathIgnorePatterns = [
    "/components/project/ProjectDashboardPage\\.simulationWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.replayWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.runtimeWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.mechanicsEditorWorkflow\\.test\\.tsx$",
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
    "/components/project/ProjectDashboardPage\\.outcomeLibrariesWorkflow\\.test\\.tsx$",
    "/src/routing\\.test\\.tsx$",
    "/components/blueprintEditor/BlueprintEditorPage\\.parSheetImportExport\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.deploymentWorkflow\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.provablyFairWorkflow\\.test\\.tsx$",
    "/components/blueprintEditor/BlueprintEditorPage\\.sections\\.test\\.tsx$",
    "/components/project/ProjectDashboardPage\\.stakeEngineExportWorkflow\\.test\\.tsx$",
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
    testTimeout: 15000,
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
                ...integrationTestPathIgnorePatterns,
            ],
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
