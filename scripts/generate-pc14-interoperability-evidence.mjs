#!/usr/bin/env node
// PC-14 is completed evidence. Verify it from the historical sources that
// emitted it, rather than attempting to refresh it from PC-15's runtime.
// The Studio UI runner is deliberately last: it merges the CLI and Studio API
// ledgers only after it has emitted its own record.
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath, pathToFileURL} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
const publishedPc14RuntimePackageLinkTarget = "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-14-20260830075634";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];
const runnerTests = [
    "tests/cli/ArtifactInteroperabilityTorture.integration.test.ts",
    "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts",
    "tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx",
];

function run(command, arguments_, options) {
    const result = spawnSync(command, arguments_, options);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`PC-14 verification command failed: ${command} ${arguments_.join(" ")}`);
}

function byteCompareFreshEvidence(outputDirectory) {
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(outputDirectory, file));
        const committed = readFileSync(path.join(evidenceDirectory, file));
        if (!fresh.equals(committed)) {
            throw new Error(`PC-14 immutable evidence is not reproducible: fresh ${file} differs byte-for-byte from the committed result.`);
        }
    }
}

function writeHistoricalJestConfig(executionDirectory, historicalRoot) {
    const configPath = path.join(executionDirectory, "historical-pc14-jest.config.mjs");
    // Revision 2288476's Studio UI test imports its own package name, but its
    // Studio Jest project predates the matching source mapper. Keep the test
    // source untouched and add that test-harness resolution shim outside the
    // historical checkout.
    writeFileSync(configPath, [
        `import config from ${JSON.stringify(pathToFileURL(path.join(historicalRoot, "jest.config.mjs")).href)};`,
        `const historicalRoot = ${JSON.stringify(historicalRoot)};`,
        "export default {...config, rootDir: historicalRoot, projects: config.projects.map((project) => ({...project, rootDir: historicalRoot,",
        "    ...(project.displayName === \"studio-client-components\" ? {moduleNameMapper: {...project.moduleNameMapper, \"^pokie$\": historicalRoot + \"/src/index.ts\"}} : {})",
        "}))};",
        "",
    ].join("\n"));
    return configPath;
}

function installPublishedRuntimeLinkInput(historicalRoot) {
    const builderPath = path.join(historicalRoot, "src", "project", "TsPackageArtifactBuilder.ts");
    const builder = readFileSync(builderPath, "utf-8");
    const historicalLink = "fs.symlinkSync(path.resolve(pokiePackageRoot), path.join(nodeModules, \"pokie\"), \"junction\");";
    if (!builder.includes(historicalLink)) throw new Error("Published PC-14 runtime-link writer is unavailable.");
    writeFileSync(builderPath, builder.replace(historicalLink, `fs.symlinkSync(${JSON.stringify(publishedPc14RuntimePackageLinkTarget)}, path.join(nodeModules, "pokie"), "junction");`));
}

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) {
        throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    }
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});

    // Targeted Jest config points TMPDIR inside this checkout. A linked
    // worktree cannot be nested below another worktree, so use the system
    // temporary root for the isolated historical checkout.
    const isolatedTemporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
    const executionDirectory = mkdtempSync(path.join(isolatedTemporaryRoot, "pokie-pc14-evidence-"));
    const historicalRoot = path.join(executionDirectory, "historical-pc14");
    const outputDirectory = path.join(executionDirectory, "fresh-output");
    let historicalWorktreeCreated = false;
    try {
        run("git", ["worktree", "add", "--detach", historicalRoot, publishedPc14Revision], {cwd: repositoryRoot, stdio: "inherit"});
        historicalWorktreeCreated = true;
        installPublishedRuntimeLinkInput(historicalRoot);
        // package-lock.json is identical at the historical revision. Reuse
        // this clone's installed dependencies while executing only the
        // historical source tree; runner output and temporary state remain
        // isolated below executionDirectory.
        const installedDependencies = path.join(repositoryRoot, "node_modules");
        if (!existsSync(installedDependencies)) throw new Error("PC-14 verification requires the clone-installed node_modules directory.");
        symlinkSync(installedDependencies, path.join(historicalRoot, "node_modules"), "dir");
        mkdirSync(outputDirectory, {recursive: true});
        const environment = {
            ...process.env,
            TMPDIR: executionDirectory,
            PC14_FIXED_RUNNER_CLOCK: "2024-01-02T03:04:05.000Z",
            PC14_FIXED_RUNNER_IDENTITY: "pc14-fixed-runner",
            PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR: outputDirectory,
            PC14_INTEROPERABILITY_PERSISTED_RESULT: path.join(outputDirectory, "interoperability-result.json"),
        };
        const jestPath = path.join(historicalRoot, "node_modules", "jest", "bin", "jest.js");
        const historicalJestConfig = writeHistoricalJestConfig(executionDirectory, historicalRoot);
        for (const testPath of runnerTests) {
            run(process.execPath, ["--experimental-vm-modules", "--max-old-space-size=1408", jestPath, "--config", historicalJestConfig, "--runInBand", "--no-cache", "--runTestsByPath", testPath], {
                cwd: historicalRoot,
                env: environment,
                stdio: "inherit",
            });
        }
        byteCompareFreshEvidence(outputDirectory);
        process.stdout.write(`PASS PC-14 historical runners reproduced immutable evidence from ${publishedPc14Revision}.\n`);
    } finally {
        if (historicalWorktreeCreated) {
            run("git", ["worktree", "remove", "--force", historicalRoot], {cwd: repositoryRoot, stdio: "inherit"});
        }
        rmSync(executionDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();
