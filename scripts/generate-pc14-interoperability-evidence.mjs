#!/usr/bin/env node
// PC-14 evidence is deliberately a by-product of the real artifact runners.
// Keep the two runners in separate Jest processes: the Studio runner merges
// the CLI ledger only after its own real operations have completed.
import {mkdirSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const jestPath = path.join(repositoryRoot, "node_modules", "jest", "bin", "jest.js");
const temporaryDirectory = path.join(repositoryRoot, "node_modules", ".cache", "pokie-tmp");

mkdirSync(temporaryDirectory, {recursive: true});

const environment = {
    ...process.env,
    TMPDIR: temporaryDirectory,
    PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR: evidenceDirectory,
    PC14_INTEROPERABILITY_PERSISTED_RESULT: path.join(evidenceDirectory, "interoperability-result.json"),
};

function run(testPath) {
    const result = spawnSync(process.execPath, [
        "--experimental-vm-modules",
        "--max-old-space-size=1408",
        jestPath,
        "--runInBand",
        "--runTestsByPath",
        testPath,
    ], {cwd: repositoryRoot, env: environment, stdio: "inherit"});
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

run("tests/cli/ArtifactInteroperabilityTorture.integration.test.ts");
run("tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts");
run("tests/project/ArtifactInteroperabilityRemediation.contract.test.ts");
