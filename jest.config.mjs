import {existsSync, mkdirSync} from "fs";
import {fileURLToPath} from "url";
import path from "path";
import jestConfigIgnore from "./jest.config.ignore.mjs";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const jestCacheDirectory = path.join(configDir, "node_modules", ".cache", "jest");
const jestTemporaryDirectory = path.join(configDir, "node_modules", ".cache", "pokie-tmp");

mkdirSync(jestTemporaryDirectory, {recursive: true});
process.env.TMPDIR ??= jestTemporaryDirectory;

const pokieExamplesRoot = process.env.POKIE_EXAMPLES_PATH ?? path.join(configDir, "..", "pokie-examples");
const pokieExamplesAvailable = existsSync(pokieExamplesRoot);

const integrationTestMatch = [
    "<rootDir>/tests/**/*.integration.test.ts",
    "<rootDir>/tests/server/PokieDevServer.test.ts",
    "<rootDir>/tests/server/PokieClientServer.test.ts",
    "<rootDir>/tests/generated/GamePackageGenerator.test.ts",
];

const integrationTestPathIgnorePatterns = [
    "\\.integration\\.test\\.ts$",
    "/tests/server/PokieDevServer\\.test\\.ts$",
    "/tests/server/PokieClientServer\\.test\\.ts$",
    "/tests/generated/GamePackageGenerator\\.test\\.ts$",
];

const packagingTestMatch = ["<rootDir>/tests/packaging/**/*.test.ts"];

const sourceTestTransform = {
    "^.+\\.ts$": ["ts-jest", {tsconfig: "tsconfig.test.json"}],
};

const exceljsModuleNameMapper = {
    "^@xlvane/exceljs$": "<rootDir>/tests/testUtils/xlvaneExceljsNative.cjs",
};

const sourceTestModuleNameMapper = {
    ...exceljsModuleNameMapper,
    "^@fromstan/pokie$": "<rootDir>/src/index.ts",
    "^@fromstan/pokie/browser$": "<rootDir>/src/browser.ts",
    "^@fromstan/pokie/wasm$": "<rootDir>/src/wasm/browser.ts",
    "^@fromstan/pokie/client/player$": "<rootDir>/cli/client/player/index.ts",
    "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
};

const pokieExamplesModuleNameMapper = {
    ...exceljsModuleNameMapper,
    "^@fromstan/pokie/client/player$": "<rootDir>/cli/client/player/index.ts",
    "^@fromstan/pokie/browser$": "<rootDir>/src/browser.ts",
    "^@fromstan/pokie/wasm$": "<rootDir>/src/wasm/browser.ts",
    "^@fromstan/pokie$": "<rootDir>/src/index.ts",
    "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
};

const pokieExamplesTransform = {
    "^.+\\.ts$": ["ts-jest", {tsconfig: path.join(pokieExamplesRoot, "tsconfig.test.json")}],
};

export default {
    testTimeout: 60000,
    coveragePathIgnorePatterns: [...jestConfigIgnore],
    collectCoverageFrom: ["./src/**/*.ts"],
    projects: [
        {
            displayName: "pokie",
            cacheDirectory: jestCacheDirectory,
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testPathIgnorePatterns: ["/node_modules/", "/tests/packaging/", ...integrationTestPathIgnorePatterns],
        },
        {
            displayName: "pokie-examples",
            cacheDirectory: jestCacheDirectory,
            testEnvironment: "jsdom",
            testEnvironmentOptions: {customExportConditions: ["node", "node-addons"]},
            moduleFileExtensions: ["ts", "js"],
            roots: pokieExamplesAvailable ? [pokieExamplesRoot] : ["<rootDir>"],
            ...(pokieExamplesAvailable
                ? {}
                : {testMatch: ["<rootDir>/__pokie_examples_unavailable__/*.test.ts"]}),
            testPathIgnorePatterns: ["/node_modules/"],
            transform: pokieExamplesTransform,
            moduleNameMapper: pokieExamplesModuleNameMapper,
        },
        {
            displayName: "pokie-integration",
            cacheDirectory: jestCacheDirectory,
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testMatch: integrationTestMatch,
        },
        {
            displayName: "pokie-packaging",
            cacheDirectory: jestCacheDirectory,
            moduleFileExtensions: ["ts", "js"],
            transform: sourceTestTransform,
            moduleNameMapper: sourceTestModuleNameMapper,
            testMatch: packagingTestMatch,
        },
    ],
};
