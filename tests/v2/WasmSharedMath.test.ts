import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {pathToFileURL} from "node:url";
import {execFileSync, spawnSync} from "node:child_process";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";

const gateCorrectionPaths = [
    "scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs", "tests/testUtils/createP911CandidateFixture.mjs",
    "tests/cli/studio/StudioArtifactBuildService.test.ts", "tests/v2/PackageBlueprintExtraction.test.ts",
    "tests/v2/WasmSharedMath.test.ts", "tests/fixtures/wasm/verifyDeliveredSharedMath.cjs",
];

it("compares delivered generated Node entries and independently instantiated modules outside Jest source resolution", () => {
    const candidate = emitPublicRuntime();
    try {
        const names = new Set<string>();
        // Snapshot dependencies may install process-lifetime exit handlers. Give each
        // bounded group a fresh native process; keep warnings fatal in every group.
        for (let first = 0; first < 34; first += 5) {
            const directory = path.join(candidate.directory, `group-${first}`);
            fs.mkdirSync(directory);
            const result = spawnSync(process.execPath, [path.resolve("tests/fixtures/wasm/verifyDeliveredSharedMath.cjs"), directory, String(first), String(Math.min(first + 5, 34))], {encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024});
            if (result.stdout) console.log(result.stdout.trim());
            expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ""});
            const report = JSON.parse(result.stdout.trim());
            expect(report.native).toBe(true);
            expect(report.fixtureCount).toBe(34);
            expect(report.configurationChecks).toEqual(["lines", "ways", "clusters"]);
            expect(report.negatives).toEqual(["cluster-grid-too-small", "cluster-grid-too-small-explicit", "ways-no-payable-symbols",
                ...(first === 0 ? ["changed-bytes", "swapped-component", "old-abi", "rehashed-code", "rehashed-model-code"] : [])]);
            expect(report.receipts).toHaveLength(Math.min(5, 34 - first));
            for (const receipt of report.receipts as {name: string}[]) {
                expect(names.has(receipt.name)).toBe(false);
                names.add(receipt.name);
            }
        }
        expect(names.size).toBe(34);
    } finally {
        candidate.dispose();
    }
}, 300000);

it("preserves authenticated candidate selectors through the complete V2C-31 gate correction", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-v2c31-candidate-"));
    try {
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911Candidate, readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment, validateP911SmokeCandidateIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const options = {repository: fixture.repository};
            const gitOptions = {cwd: fixture.repository};
            const original = await readP911Candidate(fixture.reference, options);
            for (const file of ${JSON.stringify(gateCorrectionPaths)})
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction path: " + file);
            const reviewedId = await commitP911ToolingDescendant(fixture);
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
            const release = {...environment, POKIE_PACK_SMOKE_CANDIDATE_ID: reviewedId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256};
            const selected = await readP911CandidateFromEnvironment(environment, options);
            assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
            assert.equal(selected.equivalence.reviewedId, reviewedId);
            assert.deepEqual({...selected, equivalence: original.equivalence}, original);
            assert.deepEqual(await readP911SmokeCandidateFromEnvironment(release, options), selected);
            validateP911SmokeCandidateIdentity(selected, release, options);
            const selectors = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            for (const selector of selectors) {
                await assert.rejects(async () => selector({...release, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "0".repeat(64)}, options), /receipt digest mismatch/);
                await assert.rejects(async () => selector({...release, POKIE_P805_RELEASE_HANDOFF: "conflicting"}, options), /cannot be combined/);
            }
            await assert.rejects(async () => readP911SmokeCandidateFromEnvironment({...release, POKIE_PACK_SMOKE_CANDIDATE_ID: original.candidateId}, options), /reviewed candidate identity mismatch/);
            await assert.rejects(async () => readP911SmokeCandidateFromEnvironment({...release, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: "0".repeat(64)}, options), /smoke archive digest mismatch/);
            for (const reference of [fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(selected.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                await writeFile(reference.path, "changed pinned input");
                for (const selector of selectors) await assert.rejects(async () => selector(release, options),
                    /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                await writeFile(reference.path, bytes);
            }
            for (const file of ["tests/v2/WasmSharedMath.extra.test.ts", "src/index.ts", "cli/pokie.ts", "package.json", "tsconfig.prod.json"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                execFileSync("git", ["add", "."], gitOptions);
                execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "protected input rejection fixture"], gitOptions);
                for (const selector of selectors) await assert.rejects(async () => selector(release, options), /product\\/build inputs changed/);
                execFileSync("git", ["reset", "--hard", reviewedId], {...gitOptions, stdio: "ignore"});
            }
            assert.deepEqual(await readP911SmokeCandidateFromEnvironment(release, options), selected);
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("keeps legacy release authentication scoped to the complete gate correction", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-v2c31-release-"));
    try {
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, symlink, unlink, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(directory)});
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
            const commit = () => {
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "gate correction fixture"]);
                return git(["rev-parse", "HEAD"]);
            };
            const paths = ${JSON.stringify(gateCorrectionPaths)};
            for (const file of paths) await writeFile(path.join(fixture.repository, file), "changed gate tooling");
            const reviewedId = commit();
            const authenticate = id => authenticateP805ProductTree(fixture.handoff.candidateId, id, fixture.repository);
            assert.deepEqual(authenticate(reviewedId).changedToolingAndEvidencePaths, [...paths].sort());
            for (const file of ["tests/v2/WasmSharedMath.extra.test.ts", "src/index.ts", "cli/pokie.ts", "package.json", "tsconfig.prod.json"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                assert.throws(() => authenticate(commit()), /changes product or build inputs/);
                git(["reset", "--hard", reviewedId]);
            }
            const admitted = path.join(fixture.repository, "tests/fixtures/wasm/verifyDeliveredSharedMath.cjs");
            await unlink(admitted);
            await symlink("nonregular-tooling-target", admitted);
            assert.throws(() => authenticate(commit()), /nonregular Git entries/);
            git(["reset", "--hard", reviewedId]);
            assert.deepEqual(authenticate(reviewedId).changedToolingAndEvidencePaths, [...paths].sort());
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
