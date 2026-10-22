import fs from "fs";
import os from "os";
import path from "path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {GameBlueprintValidator, PackageBlueprintExtraction} from "@fromstan/pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT, writeDescriptorPackage} from "../../v2/fixtures/PackageExtractionFixture.js";

describe("canonical package extraction CLI", () => {
    let restoreTemporaryDirectory: () => void;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    let root: string;
    let log: jest.SpyInstance;
    let error: jest.SpyInstance;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-extraction-"));
        log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });
    afterEach(() => {
        log.mockRestore();
        error.mockRestore();
        fs.rmSync(root, {recursive: true, force: true});
    });
    const command = () => new BuildCommand("1.3.0");
    const output = () => log.mock.calls.flat().join("\n");

    // Library extraction, CLI preview and CLI publication each acquire real runtime snapshots.
    it("previews every supplied field and saves the same library extraction plus evidence explicitly", async () => {
        const source = writeDescriptorPackage(root);
        const bytes = fs.readFileSync(path.join(source, "index.js"));
        const extracted = await new PackageBlueprintExtraction().extract(source);
        const destination = path.join(root, "model.json");
        expect(await command().run([source, "--target", "blueprint", "--out", destination, "--dry-run"])).toBe(0);
        for (const field of extracted.fields) expect(output()).toContain(`${field.path}: ${field.status}: ${field.authority}`);
        for (const limit of extracted.comparisonLimits) expect(output()).toContain(limit);
        expect(output()).toContain(source);
        expect(output()).toContain(`${destination}.conversion-evidence.json`);
        expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
        expect(await command().run([source, "--target", "blueprint", "--out", destination])).toBe(0);
        const blueprint = JSON.parse(fs.readFileSync(destination, "utf8"));
        expect(new GameBlueprintValidator().validate(blueprint).filter(issue => issue.severity === "error")).toEqual([]);
        expect(JSON.parse(fs.readFileSync(`${destination}.conversion-evidence.json`, "utf8"))).toEqual({
            schemaVersion: 1, kind: "package-extraction", sourceBindingHash: expect.stringMatching(/^sha256:/),
            extractedBlueprintHash: extracted.blueprintHash, extraction: extracted,
        });
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
    }, 3 * PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("keeps default sibling destination and extraction in build help", async () => {
        const source = writeDescriptorPackage(root);
        const help = command().getCommanderCommand();
        expect(help.name()).toBe("build");
        expect(help.commands.map(child => child.name())).not.toContain("export");
        expect(help.helpInformation()).toMatch(/blueprint/);
        expect(help.helpInformation()).toMatch(/--dry-run/);
        expect(await command().run([source, "--target", "blueprint", "--dry-run"])).toBe(0);
        expect(output()).toContain(path.join(root, "blueprint.json"));
        expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
    });

    it("retains candidate authentication across the complete V2C-34 two-file gate correction", () => {
        // Synthetic reader fixtures only: no product build/install or acceptance collection.
        execFileSync(process.execPath, ["--input-type=module", "-e", `
            import assert from "node:assert/strict";
            import {mkdir, readFile, symlink, unlink, writeFile} from "node:fs/promises";
            import {execFileSync} from "node:child_process";
            import path from "node:path";
            import {candidateFixture, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
            import {readP911Candidate, readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment, validateP911SmokeCandidateIdentity} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
            import {authenticateP805ProductTree} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p8-05-release-handoff.mjs")).href)};
            const fixture = await candidateFixture(${JSON.stringify(root)});
            const options = {repository: fixture.repository};
            const git = args => execFileSync("git", args, {cwd: fixture.repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
            const commit = () => {
                git(["add", "."]);
                git(["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "bounded gate fixture"]);
                return git(["rev-parse", "HEAD"]);
            };
            const original = await readP911Candidate(fixture.reference, options);
            const paths = ["tests/cli/commands/BuildCommand.test.ts", "tests/cli/studio/StudioServer.test.ts",
                "scripts/p8-05-release-handoff.mjs", "scripts/p9-11-candidate.mjs", "tests/testUtils/createP911CandidateFixture.mjs"];
            for (const file of paths) {
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction fixture: " + file);
                await writeFile(path.join(fixture.repository, file), "changed bounded gate tooling");
            }
            const reviewedId = commit();
            const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256,
                POKIE_PACK_SMOKE_CANDIDATE_ID: reviewedId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256: original.archiveSha256};
            const direct = await readP911Candidate(fixture.reference, options);
            const selectors = [readP911CandidateFromEnvironment, readP911SmokeCandidateFromEnvironment];
            for (const selector of selectors) {
                const selected = await selector(environment, options);
                assert.deepEqual(selected, direct);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...paths].sort());
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
                await assert.rejects(selector({...environment, POKIE_P911_CANDIDATE_HANDOFF_SHA256: "0".repeat(64)}, options), /receipt digest mismatch/);
                await assert.rejects(async () => selector({...environment, POKIE_P805_RELEASE_HANDOFF: "conflict"}, options), /cannot be combined/);
            }
            validateP911SmokeCandidateIdentity(direct, environment, options);
            const legacy = () => authenticateP805ProductTree(original.candidateId, git(["rev-parse", "HEAD"]), fixture.repository);
            assert.deepEqual(legacy().changedToolingAndEvidencePaths, [...paths].sort());
            for (const file of ["tests/cli/commands/BuildCommand.extra.test.ts", "src/index.ts", "cli/pokie.ts", "package.json", "package-lock.json", "tsconfig.prod.json", "generate-barrels.js"]) {
                const target = path.join(fixture.repository, file);
                await mkdir(path.dirname(target), {recursive: true});
                await writeFile(target, "changed protected input");
                commit();
                for (const selector of selectors) await assert.rejects(selector(environment, options), /product\\/build inputs changed/);
                assert.throws(legacy, /changes product or build inputs/);
                git(["reset", "--hard", reviewedId]);
            }
            const admitted = path.join(fixture.repository, paths[0]);
            await unlink(admitted);
            await symlink("nonregular-target", admitted);
            commit();
            for (const selector of selectors) await assert.rejects(selector(environment, options), /nonregular tooling/);
            assert.throws(legacy, /nonregular Git entries/);
            git(["reset", "--hard", reviewedId]);
            for (const reference of [fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                {path: fixture.handoff.archivePath}, {path: path.join(direct.packageRoot, "dist/cli/pokie.js")}]) {
                const bytes = await readFile(reference.path);
                await writeFile(reference.path, "changed pinned input");
                for (const selector of selectors) await assert.rejects(selector(environment, options),
                    /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                await writeFile(reference.path, bytes);
            }
            assert.deepEqual(await readP911SmokeCandidateFromEnvironment(environment, options), direct);
        `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
    });

    it.each(["model.json", "model.json.conversion-evidence.json"])("preserves occupied %s", async occupied => {
        const source = writeDescriptorPackage(root);
        const destination = path.join(root, "model.json");
        const existing = path.join(root, occupied);
        fs.writeFileSync(existing, "existing owner");
        await expect(command().run([source, "--target", "blueprint", "--out", destination])).rejects.toThrow(/destination is unavailable/);
        expect(fs.readFileSync(existing, "utf8")).toBe("existing owner");
        expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", occupied].sort());
    });

    it.each(["partial", "unsupported", "malformed"])("retains %s diagnostics and never publishes", async status => {
        let descriptorBody = 'throw new Error("broken descriptor");';
        if (status === "partial") descriptorBody = 'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: {manifest: model.manifest}};';
        if (status === "unsupported") descriptorBody = 'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model, unsupported: [{path: "mechanics.custom", code: "opaque-feature", message: "Custom behavior cannot be represented"}]};';
        const source = writeDescriptorPackage(root, {descriptorBody});
        const bytes = fs.readFileSync(path.join(source, "index.js"));
        await expect(command().run([source, "--target", "blueprint", "--out", path.join(root, "model.json")])).rejects.toThrow(`extraction ${status}`);
        expect(output()).toContain(`package model ${status}`);
        expect(output()).toContain("comparison boundary");
        if (status === "unsupported") {
            expect(output()).toContain("mechanics.custom: opaque-feature: Custom behavior cannot be represented");
            expect(output()).toContain("mechanics.custom: unsupported: opaque-feature");
        }
        expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
        expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(bytes);
    });
});
