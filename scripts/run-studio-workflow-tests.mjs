#!/usr/bin/env node
// Run every jsdom workflow suite in a fresh Node process. These suites retain enough DOM and
// transform state that the otherwise shared in-band process eventually reaches its 512MiB old-space
// cap before the final suite, even though each suite completes in isolation.
import {spawn, spawnSync} from "node:child_process";
import {existsSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jestPath = path.join(repositoryRoot, "node_modules", "jest", "bin", "jest.js");
const workflowProject = "studio-client-workflows";
const maxParallelFiles = 2;

function executeJest(arguments_, options = {}) {
    const result = spawnSync(process.execPath, [...process.execArgv, jestPath, ...arguments_], {
        cwd: repositoryRoot,
        ...options,
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`Jest exited with status ${result.status ?? 1}.`);
    }

    return result;
}

function executeJestAsync(arguments_) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [...process.execArgv, jestPath, ...arguments_], {
            cwd: repositoryRoot,
            stdio: "inherit",
        });
        child.once("error", reject);
        child.once("close", (status) => resolve(status ?? 1));
    });
}

const discovery = executeJest(["--selectProjects", workflowProject, "--listTests"], {encoding: "utf8"});
// Jest writes the selected-project banner to stdout but, in some versions, writes the list of
// discovered test paths to stderr. Read both streams and retain only real files so the banner can
// never be mistaken for a test path.
const workflowTestPaths = [discovery.stdout, discovery.stderr]
    .flatMap((output) => output.trim().split(/\r?\n/))
    .filter((testPath) => existsSync(testPath));

if (workflowTestPaths.length === 0) {
    throw new Error(`No ${workflowProject} test files were discovered.`);
}

// Each Jest child remains isolated, but two independent files may use the host's two cores.
// Stop admitting new files after the first failure while allowing the other active child to
// finish, so the runner never leaves a Jest process behind at the gate boundary.
for (let testIndex = 0; testIndex < workflowTestPaths.length; testIndex += maxParallelFiles) {
    const batch = workflowTestPaths.slice(testIndex, testIndex + maxParallelFiles);
    const statuses = await Promise.all(batch.map((testPath) => executeJestAsync([
        "--selectProjects", workflowProject, "--runInBand", "--runTestsByPath", testPath,
    ])));
    const failureStatus = statuses.find((status) => status !== 0);
    if (failureStatus !== undefined) {
        throw new Error(`Jest exited with status ${failureStatus}.`);
    }
}
