#!/usr/bin/env node
// Run every independent check:full lane before returning failure. A shell `&&` chain hid
// downstream failures and forced one expensive official rerun per newly exposed lane.
import {spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = [
    {name: "unit", arguments: ["test"]},
    {name: "typecheck", arguments: ["run", "typecheck"]},
    {name: "integration", arguments: ["run", "test:integration"]},
    {name: "workflows", arguments: ["run", "test:workflows"]},
];
const failures = [];

for (const stage of stages) {
    console.log(`POKIE_FULL_GATE_STAGE_START: ${stage.name}`);
    const result = spawnSync(npmCommand, stage.arguments, {
        cwd: repositoryRoot,
        env: process.env,
        stdio: "inherit",
    });
    const returnCode = result.status ?? 1;
    if (result.error || returnCode !== 0) {
        failures.push(stage.name);
        console.error(`POKIE_FULL_GATE_STAGE_FAILED: ${stage.name} (rc=${returnCode})`);
        if (result.error) {
            console.error(result.error.message);
        }
    } else {
        console.log(`POKIE_FULL_GATE_STAGE_PASS: ${stage.name}`);
    }
}

if (failures.length > 0) {
    console.error(`POKIE_FULL_GATE_FAILURES: ${failures.join(", ")}`);
    process.exitCode = 1;
} else {
    console.log("POKIE_FULL_GATE_PASS");
}
