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
            setupFiles: ["<rootDir>/tests/cli/studio-client/src/jestPolyfills.ts"],
            transform: {
                "^.+\\.tsx?$": ["ts-jest", {tsconfig: "cli/studio-client/tsconfig.json"}],
            },
            moduleNameMapper: {
                "\\.css$": "<rootDir>/tests/cli/studio-client/src/styleMock.js",
            },
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
    ],
};
