#!/usr/bin/env node
// Stateful HTTP, Worker and XLSX suites must release their VM/module state between files.
// Keep ordinary direct Jest launches supported; this wrapper only owns process isolation.
import {spawnSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jestPath = path.join(repositoryRoot, "node_modules/jest/bin/jest.js");
const arguments_ = process.argv.slice(2);

function executeJest(arguments_, options = {}) {
    const result = spawnSync(process.execPath, [...process.execArgv, jestPath, ...arguments_], {
        cwd: repositoryRoot,
        ...options,
    });
    if (result.error) throw result.error;
    return result;
}

// Let Jest resolve paths/projects/options itself, retaining the previous wrapper's CLI semantics.
// Discovery never executes tests; every selected whole file subsequently gets its own process.
const discovery = executeJest(["--runInBand", "--runTestsByPath", ...arguments_, "--listTests", "--json"], {encoding: "utf8"});
if (discovery.status !== 0) {
    process.stderr.write(discovery.stderr);
    process.stdout.write(discovery.stdout);
    process.exitCode = discovery.status ?? 1;
} else {
    // --selectProjects prints a banner before its JSON array.
    const paths = JSON.parse(discovery.stdout.slice(discovery.stdout.indexOf("[")));
    if (!Array.isArray(paths) || paths.length === 0) throw new Error("No targeted test files were discovered.");
    // Remove only explicit test paths; flags and their values still go to Jest unchanged.
    const selectedPaths = new Set(paths.map(file => path.resolve(file)));
    const options = arguments_.filter(argument => !selectedPaths.has(path.resolve(repositoryRoot, argument)));
    for (const testPath of paths) {
        const result = executeJest(["--runInBand", "--logHeapUsage", "--runTestsByPath", ...options, testPath], {stdio: "inherit"});
        const relativePath = path.relative(repositoryRoot, testPath).split(path.sep).join("/");
        console.log(`POKIE_TARGETED_TEST_RESULT: ${JSON.stringify({file: relativePath, pid: result.pid, exitCode: result.status, signal: result.signal})}`);
        if (result.status !== 0) {
            console.error(`POKIE_FAILING_TEST_FILE: ${relativePath}`);
            process.exitCode = 1;
        }
    }
    if (!process.exitCode) console.log("Targeted Jest process completed successfully.");
}
