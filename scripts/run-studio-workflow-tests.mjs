#!/usr/bin/env node
// Run the three largest jsdom workflow suites in fresh Node processes. They retain enough DOM and
// transform state that running them after another workflow suite can exceed the gate's 2GiB cgroup
// limit even with Jest's old-space cap. All other workflow suites safely share one in-band process.
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jestPath = path.join(repositoryRoot, "node_modules", "jest", "bin", "jest.js");
const isolatedTestPaths = new Set([
    "tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx",
    "tests/cli/studio-client/src/designNavigationGuard.test.tsx",
    "tests/cli/studio-client/src/routing.test.tsx",
]);

function executeJest(arguments_) {
    const result = spawnSync(process.execPath, [...process.execArgv, jestPath, ...arguments_], {
        cwd: repositoryRoot,
        stdio: "inherit",
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

for (const testPath of isolatedTestPaths) {
    executeJest(["--selectProjects", "studio-client-workflows", "--runInBand", "--runTestsByPath", testPath]);
}

executeJest(["--selectProjects", "studio-client-workflows", "--runInBand", "--testPathIgnorePatterns", ...isolatedTestPaths]);
