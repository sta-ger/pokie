import jestConfigIgnore from "./jest.config.ignore.mjs";

// Coverage options only take effect at the top level under a multi-project ("projects") config -- Jest
// ignores per-project collectCoverage*/coveragePathIgnorePatterns settings. Coverage stays scoped to the
// library's own src/**/*.ts, unchanged from before the studio-client-components project was added.
export default {
    coveragePathIgnorePatterns: [...jestConfigIgnore],
    collectCoverageFrom: ["./src/**/*.ts"],
    collectCoverage: true,
    // Several studio-client-components tests exercise the app's own real (unmocked) setTimeout-based
    // polling; under concurrent Jest workers a slow-but-correct assertion needs more room than the
    // 5000ms default, matching setupTests.ts's asyncUtilTimeout. testTimeout is only valid at the top
    // level of a multi-project config, not inside an individual project entry.
    testTimeout: 15000,
    projects: [
        {
            displayName: "pokie",
            preset: "ts-jest",
            moduleFileExtensions: ["ts", "js"],
            moduleNameMapper: {
                "^pokie$": "<rootDir>/src/index.ts",
                "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
            },
            testPathIgnorePatterns: ["/node_modules/", "\\.test\\.tsx$"],
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
    ],
};
