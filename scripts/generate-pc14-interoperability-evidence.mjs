#!/usr/bin/env node
// PC-14 evidence is deliberately a by-product of the real artifact runners.
// Keep the three runners in separate Jest processes: the Studio UI runner
// merges the CLI and Studio API ledgers only after every real operation has
// completed.
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const jestPath = path.join(repositoryRoot, "node_modules", "jest", "bin", "jest.js");
const temporaryDirectory = path.join(repositoryRoot, "node_modules", ".cache", "pokie-tmp");
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];
const writeCommittedEvidence = process.argv.includes("--write");
// The contract test invokes this script as a separate clean process.  Do not
// recursively invoke that same contract from inside the child; the artifact
// runners and byte comparison remain exactly the production refresh path.
const regenerationChild = process.env.PC14_INTEROPERABILITY_REGENERATION_CHILD === "1";

mkdirSync(temporaryDirectory, {recursive: true});
const runDirectory = mkdtempSync(path.join(temporaryDirectory, "pc14-evidence-"));

const environment = {
    ...process.env,
    TMPDIR: temporaryDirectory,
    // The values are public runner inputs.  Artifact identity deliberately
    // normalises writer timestamps (see ArtifactInteroperabilityRun), while
    // these fixed values keep any runner-owned identity strings stable.
    PC14_FIXED_RUNNER_CLOCK: "2024-01-02T03:04:05.000Z",
    PC14_FIXED_RUNNER_IDENTITY: "pc14-fixed-runner",
    PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR: runDirectory,
    PC14_INTEROPERABILITY_PERSISTED_RESULT: path.join(runDirectory, "interoperability-result.json"),
};

function run(testPath) {
    const result = spawnSync(process.execPath, [
        "--experimental-vm-modules",
        "--max-old-space-size=1408",
        jestPath,
        "--runInBand",
        "--no-cache",
        "--runTestsByPath",
        testPath,
    ], {cwd: repositoryRoot, env: environment, stdio: "inherit"});
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}

run("tests/cli/ArtifactInteroperabilityTorture.integration.test.ts");
run("tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts");
run("tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx");
if (!regenerationChild && !writeCommittedEvidence) run("tests/project/ArtifactInteroperabilityRemediation.contract.test.ts");

try {
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(runDirectory, file));
        const committedPath = path.join(evidenceDirectory, file);
        if (writeCommittedEvidence) {
            writeFileSync(committedPath, fresh);
            continue;
        }
        const committed = readFileSync(committedPath);
        if (!fresh.equals(committed)) {
            throw new Error(`PC-14 evidence is not reproducible: fresh ${file} differs from the committed result. Run npm run evidence:pc14-interoperability -- --write and commit all three files.`);
        }
    }
} finally {
    rmSync(runDirectory, {recursive: true, force: true});
}
