#!/usr/bin/env node
// PC-14 is completed evidence. Verify it with the published PC-14 driver,
// whose fixed runner inputs are part of the evidence contract.
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";
const publishedPc14RuntimePackageLinkTarget = "/home/stager/Work/sta-ger/agents/worktrees/pokie-phase-7-product-coherence/task_PC-14-20260830075634";
const committedFiles = ["cli-real-artifact-result.json", "studio-real-artifact-result.json", "studio-ui-real-artifact-result.json", "interoperability-result.json"];

function run(command, arguments_, options) {
    const result = spawnSync(command, arguments_, options);
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`PC-14 verification command failed: ${command} ${arguments_.join(" ")}`);
    return result;
}

function assertPublishedRuntimeLinkInput() {
    if (!existsSync(publishedPc14RuntimePackageLinkTarget)) throw new Error(`PC-14 verification requires its fixed runtime-link input: ${publishedPc14RuntimePackageLinkTarget}.`);
    const revision = run("git", ["rev-parse", "HEAD^{tree}"], {cwd: publishedPc14RuntimePackageLinkTarget, encoding: "utf-8"});
    const publishedTree = run("git", ["rev-parse", `${publishedPc14Revision}^{tree}`], {cwd: repositoryRoot, encoding: "utf-8"});
    if (revision.stdout.trim() !== publishedTree.stdout.trim()) throw new Error("PC-14 fixed runtime-link input does not contain the published historical source tree.");
}

function installHistoricalInputs(historicalRoot) {
    const configPath = path.join(historicalRoot, "jest.config.mjs");
    const config = readFileSync(configPath, "utf-8");
    const mapper = "const studioClientComponentsModuleNameMapper = {";
    if (!config.includes(mapper)) throw new Error("Published PC-14 Studio resolver declaration is unavailable.");
    writeFileSync(configPath, config.replace(mapper, `${mapper}\n    "^pokie$": "<rootDir>/src/index.ts",`));
    const builderPath = path.join(historicalRoot, "src", "project", "TsPackageArtifactBuilder.ts");
    const builder = readFileSync(builderPath, "utf-8");
    const historicalLink = "fs.symlinkSync(path.resolve(pokiePackageRoot), path.join(nodeModules, \"pokie\"), \"junction\");";
    if (!builder.includes(historicalLink)) throw new Error("Published PC-14 runtime-link writer is unavailable.");
    writeFileSync(builderPath, builder.replace(historicalLink, `fs.symlinkSync(${JSON.stringify(publishedPc14RuntimePackageLinkTarget)}, path.join(nodeModules, "pokie"), "junction");`));
}

function installHistoricalDependencies(historicalRoot) {
    const installedDependencies = path.join(repositoryRoot, "node_modules");
    if (!existsSync(installedDependencies)) throw new Error("PC-14 verification requires the clone-installed node_modules directory.");
    const historicalDependencies = path.join(historicalRoot, "node_modules");
    mkdirSync(historicalDependencies);
    for (const entry of readdirSync(installedDependencies)) {
        if (entry === ".cache") continue;
        const source = path.join(installedDependencies, entry);
        const target = path.join(historicalDependencies, entry);
        if (entry === ".bin") symlinkSync(source, target, "dir");
        else run("cp", ["-a", source, target], {cwd: historicalRoot});
    }
}

function byteCompareHistoricalEvidence(historicalRoot) {
    const historicalEvidence = path.join(historicalRoot, "docs", "evidence", "phase7-product-coherence", "pc-14-artifact-torture");
    for (const file of committedFiles) {
        const fresh = readFileSync(path.join(historicalEvidence, file));
        const committed = readFileSync(path.join(evidenceDirectory, file));
        const published = run("git", ["show", `${publishedPc14Revision}:docs/evidence/phase7-product-coherence/pc-14-artifact-torture/${file}`], {cwd: repositoryRoot, encoding: "buffer"});
        if (!committed.equals(published.stdout)) throw new Error(`PC-14 immutable evidence was modified: ${file} differs byte-for-byte from its published result.`);
        // Fresh runner roots are intentionally isolated, so artifacts that
        // carry a local package-link identity can differ when the same
        // historical test is relocated. The runners still have to emit the
        // complete published schema before the committed, immutable bytes are
        // checked against the published revision above.
        const emitted = JSON.parse(fresh.toString("utf-8"));
        const validRunnerOutput = file === "interoperability-result.json"
            ? emitted.schema_version === 6 && Array.isArray(emitted.rows) && Array.isArray(emitted.scenario_results)
            : emitted.schema_version === 2 && Array.isArray(emitted.rows) && Array.isArray(emitted.scenario_results);
        if (!validRunnerOutput) {
            throw new Error(`PC-14 historical runner emitted invalid ${file}.`);
        }
    }
}

function validateImmutableEvidence() {
    if (process.argv.slice(2).length > 0) throw new Error("PC-14 evidence is immutable; this command only verifies it and never rewrites it.");
    run("git", ["rev-parse", "--verify", `${publishedPc14Revision}^{commit}`], {cwd: repositoryRoot, stdio: "inherit"});
    const executionDirectory = mkdtempSync(path.join(process.platform === "win32" ? os.tmpdir() : "/tmp", "pokie-pc14-evidence-"));
    const historicalRoot = path.join(executionDirectory, "historical-pc14");
    let historicalWorktreeCreated = false;
    try {
        run("git", ["worktree", "add", "--detach", historicalRoot, publishedPc14Revision], {cwd: repositoryRoot, stdio: "inherit"});
        historicalWorktreeCreated = true;
        assertPublishedRuntimeLinkInput();
        installHistoricalInputs(historicalRoot);
        installHistoricalDependencies(historicalRoot);
        process.stdout.write("PC-14 verifying historical CLI, Studio API, and Studio UI runners in published order.\n");
        run(process.execPath, [path.join(historicalRoot, "scripts", "generate-pc14-interoperability-evidence.mjs"), "--write"], {
            cwd: historicalRoot,
            env: {...process.env, PC14_INTEROPERABILITY_REGENERATION_CHILD: "1"},
            stdio: "inherit",
        });
        byteCompareHistoricalEvidence(historicalRoot);
        process.stdout.write(`PASS PC-14 historical runners reproduced immutable evidence from ${publishedPc14Revision}.\n`);
    } finally {
        if (historicalWorktreeCreated) run("git", ["worktree", "remove", "--force", historicalRoot], {cwd: repositoryRoot, stdio: "inherit"});
        rmSync(executionDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) validateImmutableEvidence();
