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
const workflowProject = "studio-client-workflows";

function executeJest(arguments_, options = {}) {
    const result = spawnSync(process.execPath, [...process.execArgv, jestPath, ...arguments_], {
        cwd: repositoryRoot,
        ...options,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }

    return result;
}

const discovery = executeJest(["--selectProjects", workflowProject, "--listTests"], {encoding: "utf8"});
const workflowTestPaths = discovery.stdout.trim().split(/\r?\n/).filter(Boolean);

for (const testPath of workflowTestPaths) {
    executeJest(["--selectProjects", workflowProject, "--runInBand", "--runTestsByPath", testPath], {stdio: "inherit"});
}
