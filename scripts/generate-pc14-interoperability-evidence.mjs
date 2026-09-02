#!/usr/bin/env node
// PC-14 evidence belongs to the published PC-14 revision. This wrapper runs
// that revision's driver instead of rebuilding its setup from mutable PC-15.
import {mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync} from "node:fs";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publishedPc14Sha = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b";

function git(args) {
    const result = spawnSync("git", args, {cwd: repositoryRoot, encoding: "utf-8"});
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
}

function generatePc14InteroperabilityEvidence() {
    if (process.argv.includes("--write")) throw new Error("PC-14 evidence is immutable; this wrapper only validates the published result.");
    // Jest ignores test files below node_modules; TMPDIR may point there in
    // the targeted-test lane, so keep this unique checkout beside the source
    // and remove it before the wrapper returns.
    const historicalWorktreeParentDirectory = mkdtempSync(path.join(repositoryRoot, ".pc14-evidence-"));
    const historicalSourceDirectory = path.join(historicalWorktreeParentDirectory, "source");
    let historicalWorktreeAdded = false;
    try {
        git(["worktree", "add", "--detach", historicalSourceDirectory, publishedPc14Sha]);
        historicalWorktreeAdded = true;
        if (git(["-C", historicalSourceDirectory, "rev-parse", "HEAD"]) !== publishedPc14Sha) {
            throw new Error(`PC-14 historical source did not resolve to ${publishedPc14Sha}.`);
        }

        const historicalNodeModulesDirectory = path.join(historicalSourceDirectory, "node_modules");
        mkdirSync(historicalNodeModulesDirectory);
        for (const entry of readdirSync(path.join(repositoryRoot, "node_modules"))) {
            if (entry !== ".cache" && entry !== "jest") symlinkSync(path.join(repositoryRoot, "node_modules", entry), path.join(historicalNodeModulesDirectory, entry));
        }

        // The published driver is unchanged, including its Jest arguments.
        // Its UI project needs the same historical source resolver that the
        // PC-14 checkout used before package self-references had a built
        // runtime available. Provide that resolver through a disposable Jest
        // executable, never by changing the driver or its runner files.
        const harnessConfigPath = path.join(historicalWorktreeParentDirectory, "pc14-historical-jest.config.mjs");
        writeFileSync(harnessConfigPath, `import historicalConfig from ${JSON.stringify(new URL(`file://${path.join(historicalSourceDirectory, "jest.config.mjs")}`).href)};
export default {
    ...historicalConfig,
    rootDir: ${JSON.stringify(historicalSourceDirectory)},
    projects: historicalConfig.projects.map((project) => ({
        ...project,
        rootDir: ${JSON.stringify(historicalSourceDirectory)},
        moduleNameMapper: {
            ...(project.moduleNameMapper ?? {}),
            "^pokie$": ${JSON.stringify(path.join(historicalSourceDirectory, "src", "index.ts"))},
        },
    })),
};
`);
        const historicalJestPath = path.join(historicalNodeModulesDirectory, "jest", "bin", "jest.js");
        mkdirSync(path.dirname(historicalJestPath), {recursive: true});
        writeFileSync(historicalJestPath, `import {spawnSync} from "node:child_process";
import process from "node:process";
const result = spawnSync(process.execPath, [${JSON.stringify(path.join(repositoryRoot, "node_modules", "jest-cli", "bin", "jest.js"))}, "--config", ${JSON.stringify(harnessConfigPath)}, ...process.argv.slice(2)], {cwd: process.cwd(), env: process.env, stdio: "inherit"});
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
`);

        // The historical driver owns its fixed clock, runner inputs, and raw
        // byte comparison. Mark this process as its child only to prevent its
        // historical contract from recursively launching another driver.
        const result = spawnSync(process.execPath, [path.join(historicalSourceDirectory, "scripts", "generate-pc14-interoperability-evidence.mjs")], {
            cwd: historicalSourceDirectory,
            env: {...process.env, PC14_INTEROPERABILITY_REGENERATION_CHILD: "1"},
            stdio: "inherit",
        });
        if (result.error !== undefined) throw result.error;
        if (result.status !== 0) throw new Error(`Published PC-14 evidence driver failed with status ${result.status ?? 1}.`);
    } finally {
        if (historicalWorktreeAdded) git(["worktree", "remove", "--force", historicalSourceDirectory]);
        rmSync(historicalWorktreeParentDirectory, {recursive: true, force: true});
    }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generatePc14InteroperabilityEvidence();
