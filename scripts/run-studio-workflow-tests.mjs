#!/usr/bin/env node
// Run every jsdom workflow suite in a fresh Node process. These suites retain enough DOM and
// transform state that the otherwise shared in-band process eventually reaches its 512MiB old-space
// cap before the final suite, even though each suite completes in isolation.
import {spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
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
    return result;
}

const discovery = executeJest(["--selectProjects", workflowProject, "--listTests"], {encoding: "utf8"});
if (discovery.status !== 0) {
    throw new Error(`Jest discovery exited with status ${discovery.status ?? 1}.`);
}
// Jest writes the selected-project banner to stdout but, in some versions, writes the list of
// discovered test paths to stderr. Read both streams and retain only real files so the banner can
// never be mistaken for a test path.
const workflowTestPaths = [discovery.stdout, discovery.stderr]
    .flatMap((output) => output.trim().split(/\r?\n/))
    .filter((testPath) => existsSync(testPath));

if (workflowTestPaths.length === 0) {
    throw new Error(`No ${workflowProject} test files were discovered.`);
}

// Each suite needs a fresh process, but it must run alone. A single jsdom workflow suite can retain
// roughly 620-735MiB while transforming and rendering; starting two at once makes their real-timer
// interactions starve and turns otherwise-correct 60s assertions into timeouts. Continue after a
// failed file so one official run reports the whole workflow failure set.
const failedTestPaths = [];
for (const testPath of workflowTestPaths) {
    const result = executeJest([
        "--selectProjects", workflowProject, "--runInBand", "--runTestsByPath", testPath,
    ], {stdio: "inherit"});
    if (result.status !== 0) {
        const relativePath = path.relative(repositoryRoot, testPath).split(path.sep).join("/");
        failedTestPaths.push(relativePath);
        console.error(`POKIE_FAILING_TEST_FILE: ${relativePath}`);
    }
}

if (failedTestPaths.length > 0) {
    console.error(`POKIE_WORKFLOW_FAILURES: ${failedTestPaths.join(", ")}`);
    process.exitCode = 1;
}
