#!/usr/bin/env node
// Run every jsdom workflow suite in a fresh Node process. These suites retain enough DOM and
// transform state that the otherwise shared in-band process eventually reaches its 512MiB old-space
// cap before the final suite, even though each suite completes in isolation.
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jestPath = path.join(repositoryRoot, "node_modules", "jest", "bin", "jest.js");
const workflowTestPaths = [
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.simulationWorkflow.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx",
    "tests/cli/studio-client/src/hooks/useSimulationPoll.test.tsx",
    "tests/cli/studio-client/src/hooks/useReplayPoll.test.tsx",
    "tests/cli/studio-client/src/integration/happyPath.test.tsx",
    "tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx",
    "tests/cli/studio-client/src/openProjectGuard.test.tsx",
    "tests/cli/studio-client/src/designNavigationGuard.test.tsx",
    "tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.validation.test.tsx",
    "tests/cli/studio-client/src/navigationGuardModal.test.tsx",
    "tests/cli/studio-client/src/components/home/HomePage.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.certificationWorkflow.test.tsx",
    "tests/cli/studio-client/src/routing.test.tsx",
    "tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.provablyFairWorkflow.test.tsx",
    "tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx",
    "tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx",
];

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

for (const testPath of workflowTestPaths) {
    executeJest(["--selectProjects", "studio-client-workflows", "--runInBand", "--runTestsByPath", testPath]);
}
