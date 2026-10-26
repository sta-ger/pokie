import {ArtifactBuildCancelledError} from "../../src/project/ArtifactBuildOptions.js";
import {ArtifactPublicationOwnership} from "../../src/project/ArtifactPublicationOwnership.js";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT, runtimeSnapshotNames, writePausedDescriptorPackage, writeDescriptorPackage} from "../v2/fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import type {ArtifactBuilder} from "../../src/project/ArtifactBuilder.js";
import {ArtifactBuilderRegistry} from "../../src/project/ArtifactBuilderRegistry.js";
import {PackageBlueprintExtraction} from "../../src/generated/PackageBlueprintExtraction.js";
import {loadPokieGameRuntime, type LoadedPokieGame} from "../../src/gamepackage/loadPokieGame.js";
import {ParSheetImporter} from "../../src/parsheet/ParSheetImporter.js";
import {BlueprintArtifactBuilder} from "../../src/project/BlueprintArtifactBuilder.js";
import {computeProjectInputBindingHash, computeArtifactInputBindingHash, type ArtifactConversionPlan} from "../../src/project/ArtifactConversionPlanner.js";
import {ManagedOutcomeProjectService} from "../../src/project/ManagedOutcomeProjectService.js";
import {ParSheetExporter} from "../../src/parsheet/ParSheetExporter.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
} from "../../src/project/ProjectCapability.js";
import type {PokieProject} from "../../src/project/PokieProject.js";

describe("ArtifactBuilderRegistry", () => {
    let restoreTemporaryDirectory: () => void;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    const registry = new ArtifactBuilderRegistry();

    it("retains the pinned candidate through the complete V2C-26 gate-test delta", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-v2c26-retained-candidate-"));
        try {
            // Use native installed resolution, without Jest's POKIE source aliases.
            execFileSync(process.execPath, ["--input-type=module", "-e", `
                import assert from "node:assert/strict";
                import {mkdir, readFile, writeFile} from "node:fs/promises";
                import {execFileSync} from "node:child_process";
                import path from "node:path";
                import {candidateFixture, commitP911ToolingDescendant, P911_TOOLING_DESCENDANT_PATHS} from ${JSON.stringify(pathToFileURL(path.resolve("tests/testUtils/createP911CandidateFixture.mjs")).href)};
                import {readP911Candidate, readP911CandidateFromEnvironment} from ${JSON.stringify(pathToFileURL(path.resolve("scripts/p9-11-candidate.mjs")).href)};
                const fixture = await candidateFixture(${JSON.stringify(root)});
                const options = {repository: fixture.repository};
                const original = await readP911Candidate(fixture.reference, options);
                for (const file of ["tests/project/ArtifactBuilderRegistry.test.ts", "tests/cli/studio/StudioArtifactBuildService.test.ts",
                    "tests/v2/fixtures/PackageExtractionFixture.ts", "docs/v2-completion/V2C-26.md"])
                    assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file), "missing correction path: " + file);
                const reviewedId = await commitP911ToolingDescendant(fixture);
                const environment = {POKIE_P911_CANDIDATE_HANDOFF: fixture.reference.path, POKIE_P911_CANDIDATE_HANDOFF_SHA256: fixture.reference.sha256};
                const selected = await readP911CandidateFromEnvironment(environment, options);
                assert.deepEqual(selected.equivalence.changedEvidenceAndTooling, [...P911_TOOLING_DESCENDANT_PATHS].sort());
                assert.equal(selected.equivalence.reviewedId, reviewedId);
                assert.deepEqual({...selected, equivalence: original.equivalence}, original);
                for (const reference of [fixture.handoff.browserDriver, fixture.handoff.buildReceipt, fixture.handoff.installReceipt,
                    {path: fixture.handoff.archivePath}, {path: path.join(selected.packageRoot, "dist/cli/pokie.js")}]) {
                    const bytes = await readFile(reference.path);
                    await writeFile(reference.path, "changed pinned input");
                    await assert.rejects(readP911CandidateFromEnvironment(environment, options),
                        /authenticated controller browser driver required|receipt digest mismatch|archive digest mismatch|stale installed asset/);
                    await writeFile(reference.path, bytes);
                }
                assert.deepEqual(await readP911CandidateFromEnvironment(environment, options), selected);
                // A neighboring test and product/build inputs remain protected, even after admission.
                for (const file of ["tests/project/ArtifactBuilderRegistry.extra.test.ts", "src/index.ts", "package.json", "tsconfig.prod.json"]) {
                    const target = path.join(fixture.repository, file);
                    await mkdir(path.dirname(target), {recursive: true});
                    await writeFile(target, "changed protected input");
                    execFileSync("git", ["add", "."], {cwd: fixture.repository});
                    execFileSync("git", ["-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "protected input rejection fixture"], {cwd: fixture.repository});
                    await assert.rejects(readP911CandidateFromEnvironment(environment, options), /product\\/build inputs changed/);
                    execFileSync("git", ["reset", "--hard", reviewedId], {cwd: fixture.repository, stdio: "ignore"});
                }
            `], {timeout: 30_000, stdio: ["ignore", "pipe", "pipe"]});
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it.each(["declared", "unknown"] as const)("refuses %s max-win policy in every model conversion and direct publication", async type => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-policy-conversion-"));
        try {
            const policy = type === "declared"
                ? {type, value: 7.5, unit: "bet-multiple", scope: "logical-round", authority: "custom cap"}
                : {type, authority: "explicitly unknown custom cap"};
            const source = writeDescriptorPackage(root, {descriptorBody:
                `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model, maxWinPolicy: ${JSON.stringify(policy)}};`,});
            const project: PokieProject = {type: "tsPackage", rootPath: source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
            for (const target of ["blueprint", "tsPackage", "parWorkbook", "wasm"] as const) {
                const destination = path.join(root, target);
                const plan = await registry.preparePlan(project, target, {destinationPath: destination});
                expect(plan.status).toBe("unavailable");
                expect(plan.diagnostic?.message).toContain("max-win-policy-not-representable");
                await expect(registry.executePlan(plan, project, destination)).rejects.toThrow(/max-win-policy-not-representable/);
                expect(fs.existsSync(destination)).toBe(false);
            }
            const builder = new BlueprintArtifactBuilder();
            await expect(builder.validate(project)).rejects.toThrow(/max-win-policy-not-representable/);
            await expect(builder.build(project, path.join(root, "direct.json"))).rejects.toThrow(/max-win-policy-not-representable/);
            expect(fs.readdirSync(root)).toEqual(["descriptor-package"]);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it("uses extraction once as the model stage for downstream packages/PAR and retains source-bound evidence", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-extraction-registry-"));
        try {
            const source = writeDescriptorPackage(root);
            const project: PokieProject = {type: "tsPackage", rootPath: source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
            for (const target of ["tsPackage", "parWorkbook"] as const) {
                const destination = path.join(root, target === "parWorkbook" ? "model.xlsx" : "regenerated");
                const plan = await registry.preparePlan(project, target, {destinationPath: destination});
                expect(plan.status).toBe("planned");
                const result = await registry.executePlan(plan, project, destination);
                expect(result.packageExtraction?.source.gameId).toBe("math-probe");
                expect(result.importedBlueprintPath).toContain("package-extraction");
                expect(fs.existsSync(result.conversionEvidencePath!)).toBe(true);
                expect(JSON.parse(fs.readFileSync(result.conversionEvidencePath!, "utf8")).kind).toBe("package-extraction");
            }
            expect(fs.readdirSync(root).some(name => name.startsWith(".pokie-"))).toBe(false);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it.each(["blueprint", "tsPackage", "parWorkbook", "wasm"] as const)("cancels the final descriptor read for %s before publishing or running downstream writers", async target => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-async-extraction-registry-"));
        const fixture = writePausedDescriptorPackage(root);
        const snapshots = runtimeSnapshotNames(fixture.source);
        const input = fs.readFileSync(path.join(fixture.source, "index.js"));
        const controller = new AbortController();
        const project: PokieProject = {type: "tsPackage", rootPath: fixture.source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
        const destination = path.join(root, "output");
        const progress: string[] = [];
        try {
            const plan = await registry.preparePlan(project, target, {destinationPath: destination});
            expect(plan.status).toBe("planned");
            const checked = expect(registry.executePlan(plan, project, destination, {signal: controller.signal, onProgress: value => {
                progress.push(value.status);
                if (value.message === "Extracting public package model into Blueprint") fixture.arm();
            }})).rejects.toBeInstanceOf(ArtifactBuildCancelledError);
            await fixture.waitForRead(checked);
            expect(runtimeSnapshotNames(fixture.source).length).toBe(snapshots.length + 1);
            expect(fs.existsSync(destination)).toBe(false);
            controller.abort();
            fixture.settle();
            await checked;
            expect(progress).toContain("cancelled");
            expect(progress).not.toContain("completed");
            expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
            expect(fs.readFileSync(path.join(fixture.source, "index.js"))).toEqual(input);
            expect(fs.readFileSync(fixture.control, "utf8")).toBe("existing descriptor input");
            expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
        } finally {
            fixture.restore();
            fs.rmSync(root, {recursive: true, force: true});
        }
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("propagates cancellation into validation's initial preparation when no plan is supplied", async () => {
        // Exercise the real loader with direct-Jest caller context even under the npm wrapper.
        const callerEnvironment = Object.entries(process.env).filter(([key]) =>
            key.startsWith("npm_lifecycle_") || key.startsWith("npm_package_") || key === "INIT_CWD" || key === "TMPDIR");
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-unprepared-validation-"));
        const fixture = writePausedDescriptorPackage(root, undefined, {pauseAtRead: 1});
        const snapshots = runtimeSnapshotNames(fixture.source);
        const project: PokieProject = {type: "tsPackage", rootPath: fixture.source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
        const controller = new AbortController();
        try {
            for (const [key] of callerEnvironment) Reflect.deleteProperty(process.env, key);
            expect(path.dirname(os.tmpdir())).toBe(path.resolve(__dirname, "../../node_modules/.cache/pokie-tmp"));
            const checked = expect(registry.validate("blueprint", project, undefined, {signal: controller.signal}))
                .rejects.toBeInstanceOf(ArtifactBuildCancelledError);
            await fixture.waitForRead(checked);
            expect(runtimeSnapshotNames(fixture.source).length).toBe(snapshots.length + 1);
            controller.abort();
            fixture.settle();
            await checked;
            expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
            expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
        } finally {
            try {
                fixture.restore();
                fs.rmSync(root, {recursive: true, force: true});
            } finally {
                for (const [key, value] of callerEnvironment) process.env[key] = value;
            }
        }
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    describe.each(["blueprint", "tsPackage", "parWorkbook", "wasm"] as const)("package %s validation lifecycle", target => {
        it.each([true, false])("releases the validation snapshot with cancellation=%s and preserves optional callers", async cancel => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-validation-extraction-"));
            const fixture = writePausedDescriptorPackage(root);
            const snapshots = runtimeSnapshotNames(fixture.source);
            const input = fs.readFileSync(path.join(fixture.source, "index.js"));
            const project: PokieProject = {type: "tsPackage", rootPath: fixture.source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
            const controller = new AbortController();
            const progress: string[] = [];
            try {
                const plan = await registry.preparePlan(project, target, {destinationPath: path.join(root, "output")});
                expect(plan.packageExtraction?.status).toBe("complete");
                expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
                fixture.arm();
                const running = cancel
                    ? registry.validate(target, project, plan, {signal: controller.signal, onProgress: value => {
                        progress.push(value.status);
                    }})
                    : registry.validate(target, project, plan);
                const checked = cancel ? expect(running).rejects.toBeInstanceOf(ArtifactBuildCancelledError) : expect(running).resolves.toBeUndefined();
                await fixture.waitForRead(checked);
                expect(fixture.readCount).toBe(2);
                expect(runtimeSnapshotNames(fixture.source).length).toBe(snapshots.length + 1);
                if (cancel) controller.abort();
                fixture.settle();
                await checked;
                if (cancel) expect(progress).toEqual(["cancelled"]);
                expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
                expect(fs.readFileSync(path.join(fixture.source, "index.js"))).toEqual(input);
                expect(fs.readFileSync(fixture.control, "utf8")).toBe("existing descriptor input");
                expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
            } finally {
                fixture.restore();
                fs.rmSync(root, {recursive: true, force: true});
            }
        });

        it("rejects a malformed validation read after successful preparation as source drift", async () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-malformed-validation-"));
            const fixture = writePausedDescriptorPackage(root, '{descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: descriptorInput === "malformed" ? {...model, manifest: null} : model}');
            const snapshots = runtimeSnapshotNames(fixture.source);
            const input = fs.readFileSync(path.join(fixture.source, "index.js"));
            const project: PokieProject = {type: "tsPackage", rootPath: fixture.source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
            try {
                const plan = await registry.preparePlan(project, target, {destinationPath: path.join(root, "output")});
                expect(plan.packageExtraction?.status).toBe("complete");
                fs.writeFileSync(fixture.control, "malformed");
                fixture.arm();
                const checked = expect(registry.validate(target, project, plan, {signal: new AbortController().signal}))
                    .rejects.toThrow(/source configuration or generation provenance changed/);
                await fixture.waitForRead(checked);
                fixture.settle();
                await checked;
                expect(runtimeSnapshotNames(fixture.source)).toEqual(snapshots);
                expect(fs.readFileSync(path.join(fixture.source, "index.js"))).toEqual(input);
                expect(fs.readFileSync(fixture.control, "utf8")).toBe("malformed");
                expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", "descriptor-read.txt"]);
            } finally {
                fixture.restore();
                fs.rmSync(root, {recursive: true, force: true});
            }
        });
    });

    it("tracks the validation lease while unrelated runtime snapshots are allocated and released", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-snapshot-ownership-"));
        const fixture = writePausedDescriptorPackage(root);
        const unrelatedSource = writeDescriptorPackage(root, {
            name: "unrelated-package",
            descriptorBody: `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model, fixtureIdentity: ${JSON.stringify(root)}};`,
        });
        const input = fs.readFileSync(path.join(fixture.source, "index.js"));
        const project: PokieProject = {type: "tsPackage", rootPath: fixture.source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
        let unrelated: LoadedPokieGame | undefined;
        let running: Promise<void> | undefined;
        try {
            unrelated = await loadPokieGameRuntime(unrelatedSource);
            const unrelatedSnapshots = runtimeSnapshotNames(unrelatedSource);
            expect(unrelatedSnapshots).toHaveLength(1);
            expect(runtimeSnapshotNames(fixture.source)).toEqual([]);
            const plan = await registry.preparePlan(project, "wasm", {destinationPath: path.join(root, "output")});
            fixture.arm();
            running = registry.validate("wasm", project, plan);
            await fixture.waitForRead(running);
            expect(fixture.readCount).toBe(2);
            const validationSnapshots = runtimeSnapshotNames(fixture.source);
            expect(validationSnapshots).toHaveLength(1);
            expect(fs.readdirSync(os.tmpdir())).toEqual(expect.arrayContaining([...validationSnapshots, ...unrelatedSnapshots]));
            await unrelated.release();
            expect(runtimeSnapshotNames(unrelatedSource)).toEqual([]);
            expect(runtimeSnapshotNames(fixture.source)).toEqual(validationSnapshots);
            unrelated = await loadPokieGameRuntime(unrelatedSource);
            const replacementSnapshots = runtimeSnapshotNames(unrelatedSource);
            expect(replacementSnapshots).toHaveLength(1);
            expect(replacementSnapshots).not.toEqual(unrelatedSnapshots);
            expect(runtimeSnapshotNames(fixture.source)).toEqual(validationSnapshots);
            fixture.settle();
            await running;
            expect(runtimeSnapshotNames(fixture.source)).toEqual([]);
            expect(runtimeSnapshotNames(unrelatedSource)).toEqual(replacementSnapshots);
            expect(fs.existsSync(path.join(root, "output"))).toBe(false);
            expect(fs.readFileSync(path.join(fixture.source, "index.js"))).toEqual(input);
            expect(fs.readFileSync(fixture.control, "utf8")).toBe("existing descriptor input");
            expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", "descriptor-read.txt", "unrelated-package"]);
        } finally {
            fixture.restore();
            await running?.catch(() => undefined);
            await unrelated?.release();
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    it.each(["blueprint", "tsPackage", "parWorkbook", "wasm"] as const)(
        "rejects final descriptor drift before exposing either model output for %s",
        async target => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-model-binding-"));
            try {
                const control = path.join(root, "payout.txt");
                fs.writeFileSync(control, "1");
                const source = writeDescriptorPackage(root, {descriptorBody:
                    `model.paytable.A[3] = Number(require("fs").readFileSync(${JSON.stringify(control)}, "utf8"));
                    return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model};`,});
                const input = fs.readFileSync(path.join(source, "index.js"));
                const project: PokieProject = {type: "tsPackage", rootPath: source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage};
                const destination = path.join(root, target === "blueprint" ? "model.json" : target);
                const plan = await registry.preparePlan(project, target, {destinationPath: destination});
                expect(plan.status).toBe("planned");
                expect(plan.packageExtraction?.blueprint?.paytable.A[3]).toBe(1);
                const link = jest.spyOn(fs.promises, "link");
                try {
                    await expect(registry.executePlan(plan, project, destination, {onProgress: progress => {
                        if (progress.message === "Extracting public package model into Blueprint") fs.writeFileSync(control, "99");
                    }})).rejects.toThrow(/Package model changed after preview/);
                    expect(link).not.toHaveBeenCalled();
                } finally {
                    link.mockRestore();
                }
                expect(fs.readFileSync(path.join(source, "index.js"))).toEqual(input);
                expect(fs.readdirSync(root).sort()).toEqual(["descriptor-package", "payout.txt"]);
            } finally {
                fs.rmSync(root, {recursive: true, force: true});
            }
        },
    );

    describe.each([
        {sourceType: "tsPackage", target: "tsPackage", empty: false},
        {sourceType: "tsPackage", target: "tsPackage", empty: true},
        {sourceType: "tsPackage", target: "parWorkbook", empty: false},
        {sourceType: "tsPackage", target: "wasm", empty: false},
        {sourceType: "parWorkbook", target: "tsPackage", empty: false},
        {sourceType: "parWorkbook", target: "wasm", empty: false},
        {sourceType: "parWorkbook", target: "outcomeLibrary", empty: false},
        {sourceType: "parWorkbook", target: "outcomeLibrary", empty: true},
        {sourceType: "parWorkbook", target: "stakeAdapter", empty: false},
        {sourceType: "parWorkbook", target: "stakeAdapter", empty: true},
    ] as const)("downstream $sourceType -> $target (caller directory: $empty)", ({sourceType, target, empty}) => {
        // Every package-source path snapshots the real runtime graph, including failures
        // before attachment. Share the lifecycle budget across the whole matrix so the
        // parallel controller launcher has the same allowance as cancellation cases.
        const timeout = sourceType === "tsPackage" ? PACKAGE_EXTRACTION_TEST_TIMEOUT : undefined;
        let root: string;
        let project: PokieProject;
        let destination: string;
        let durableDirectory: string;
        let callerDirectoryInode: number | undefined;
        const bytes = Buffer.from([0, 255, 13, 10, 42]);
        beforeEach(() => {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-downstream-ownership-"));
            const source = sourceType === "tsPackage" ? writeDescriptorPackage(root) : path.join(root, "source.xlsx");
            if (sourceType === "parWorkbook") fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), source);
            project = {type: sourceType, rootPath: source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES[sourceType]};
            destination = path.join(root, "output");
            if (empty) {
                fs.mkdirSync(destination);
                callerDirectoryInode = fs.statSync(destination).ino;
            }
            const kind = sourceType === "tsPackage" ? "package-extraction" : "par-import";
            durableDirectory = target !== "wasm" && target !== "parWorkbook" ? path.join(destination, ".pokie", kind) : path.join(`${destination}.pokie`, kind);
        });
        afterEach(() => {
            jest.restoreAllMocks();
            fs.rmSync(root, {recursive: true, force: true});
        });
        const terminalPath = (): string => {
            if (target === "tsPackage") return path.join(destination, "package.json");
            if (target === "outcomeLibrary") return path.join(destination, "manifest.json");
            if (target === "stakeAdapter") return path.join(destination, "pokie-manifest.json");
            return destination;
        };
        const memberPath = (member: string): string => path.join(durableDirectory, member === "blueprint" ? "imported.blueprint.json" : "conversion-evidence.json");
        const sentinelPath = (): string => path.join(durableDirectory, "unrelated.bin");
        const addSentinel = (): void => {
            fs.mkdirSync(durableDirectory, {recursive: true});
            fs.writeFileSync(sentinelPath(), bytes);
        };
        const assertCleanup = (survivor: string): void => {
            expect(fs.readFileSync(survivor)).toEqual(bytes);
            expect(fs.readFileSync(sentinelPath())).toEqual(bytes);
            const terminal = terminalPath();
            if (survivor !== terminal) expect(fs.existsSync(terminal)).toBe(false);
            for (const member of ["blueprint", "evidence"]) {
                if (survivor !== memberPath(member)) expect(fs.existsSync(memberPath(member))).toBe(false);
            }
            expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
            const filesBelow = (directory: string): string[] => !fs.existsSync(directory) ? [] : fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? filesBelow(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
            const survivingFiles = target !== "wasm" && target !== "parWorkbook" ? filesBelow(destination) : [...filesBelow(`${destination}.pokie`), ...(fs.existsSync(destination) ? [destination] : [])];
            expect(survivingFiles.sort()).toEqual([survivor, sentinelPath()].sort());
            expect(fs.readdirSync(root).some(name => name.startsWith(".pokie-"))).toBe(false);
            if (empty) expect(fs.statSync(destination).ino).toBe(callerDirectoryInode);
        };

        if (target !== "parWorkbook" && target !== "wasm") it.each(["existing", "created"])("rejects a %s directory populated between final preflight and acquisition", async boundary => {
            const acquire = ArtifactPublicationOwnership.prototype.ensureDirectory;
            if (boundary === "existing" || empty) {
                jest.spyOn(ArtifactPublicationOwnership.prototype, "ensureDirectory").mockImplementation(async function(this: ArtifactPublicationOwnership, directory, requireEmpty) {
                    if (path.resolve(directory) === destination && requireEmpty) {
                        fs.mkdirSync(destination, {recursive: true});
                        fs.writeFileSync(path.join(destination, "competing.bin"), bytes);
                    }
                    await Reflect.apply(acquire, this, [directory, requireEmpty]);
                });
            } else {
                const mkdir = fs.promises.mkdir.bind(fs.promises);
                jest.spyOn(fs.promises, "mkdir").mockImplementation(async (directory, options) => {
                    const result = await mkdir(directory, options);
                    if (path.resolve(String(directory)) === destination) fs.writeFileSync(path.join(destination, "competing.bin"), bytes);
                    return result;
                });
            }
            await expect(registry.build(target, project, destination)).rejects.toThrow(/already exists and is not empty/);
            expect(fs.readdirSync(destination)).toEqual(["competing.bin"]);
            expect(fs.readFileSync(path.join(destination, "competing.bin"))).toEqual(bytes);
            if (empty) expect(fs.statSync(destination).ino).toBe(callerDirectoryInode);
            expect(fs.readdirSync(root).some(name => name.startsWith(".pokie-"))).toBe(false);
        }, timeout);

        it.each(["blueprint", "evidence"])("rejects a competing retained %s created after preflight without changing its bytes", async member => {
            const plan = await registry.preparePlan(project, target, {destinationPath: destination});
            const link = fs.promises.link.bind(fs.promises);
            let conflicts = 0;
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                if (String(to) === memberPath("blueprint")) {
                    conflicts++;
                    addSentinel();
                    fs.writeFileSync(memberPath(member), bytes);
                }
                await link(from, to);
            });
            await expect(registry.executePlan(plan, project, destination)).rejects.toThrow(/already exists/);
            expect(conflicts).toBe(1);
            assertCleanup(memberPath(member));
        }, timeout);

        it("preserves unrelated companion contents and competing evidence on attachment I/O failure", async () => {
            const link = fs.promises.link.bind(fs.promises);
            let failures = 0;
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                if (String(to) === memberPath("evidence")) {
                    failures++;
                    addSentinel();
                    fs.writeFileSync(memberPath("evidence"), bytes);
                    throw new Error("injected attachment failure");
                }
                await link(from, to);
            });
            await expect(registry.build(target, project, destination)).rejects.toThrow("injected attachment failure");
            expect(failures).toBe(1);
            assertCleanup(memberPath("evidence"));
        }, timeout);

        it.each(["terminal", "blueprint", "evidence"])("preserves a replaced %s when attachment is cancelled", async member => {
            const controller = new AbortController();
            const sourceHash = computeProjectInputBindingHash(project);
            let cancellations = 0;
            const terminal = terminalPath();
            const competitor = member === "terminal" ? terminal : memberPath(member);
            const boundary = member === "evidence" ? memberPath("evidence") : memberPath("blueprint");
            const link = fs.promises.link.bind(fs.promises);
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                await link(from, to);
                if (String(to) === boundary) {
                    cancellations++;
                    addSentinel();
                    const replacement = path.join(root, "replacement.tmp");
                    fs.writeFileSync(replacement, bytes);
                    fs.renameSync(replacement, competitor);
                    controller.abort();
                }
            });
            await expect(registry.build(target, project, destination, {signal: controller.signal})).rejects.toBeInstanceOf(ArtifactBuildCancelledError);
            expect(cancellations).toBe(1);
            assertCleanup(competitor);
            expect(computeProjectInputBindingHash(project)).toBe(sourceHash);
        }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

        it("returns a complete rollback inventory and correctly bound retained evidence on success", async () => {
            const result = await registry.build(target, project, destination);
            const evidence = JSON.parse(fs.readFileSync(result.conversionEvidencePath!, "utf8"));
            expect(result.importedBlueprintPath).toBe(memberPath("blueprint"));
            expect(result.conversionEvidencePath).toBe(memberPath("evidence"));
            if (sourceType === "tsPackage") {
                expect(evidence.extractedBlueprintHash).toBe(result.packageExtraction?.blueprintHash);
                expect(evidence.sourceBindingHash).toBe(computeProjectInputBindingHash(project));
            } else expect(evidence.sourceWorkbook).toBe(project.rootPath);
            for (const file of result.publishedFileOwnership ?? []) {
                const stat = fs.lstatSync(file.path);
                expect({dev: stat.dev, ino: stat.ino}).toEqual({dev: file.dev, ino: file.ino});
            }
            expect(result.publishedFileOwnership?.map(entry => entry.path)).toEqual(expect.arrayContaining([memberPath("blueprint"), memberPath("evidence"), terminalPath()]));
            if (empty) {
                expect(fs.statSync(destination).ino).toBe(callerDirectoryInode);
                expect(result.publishedDirectoryOwnership?.find(entry => entry.path === destination)?.removeOnRollback).toBe(false);
            }
            expect(fs.readdirSync(root).some(name => name.startsWith(".pokie-"))).toBe(false);
        }, timeout);
    });

    describe.each(["tsPackage", "parWorkbook"] as const)("exclusive %s Blueprint publication", sourceType => {
        let root: string;
        let project: PokieProject;
        let destination: string;
        beforeEach(() => {
            root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-exclusive-publication-"));
            let source: string;
            if (sourceType === "tsPackage") source = writeDescriptorPackage(root);
            else {
                source = path.join(root, "source.xlsx");
                fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), source);
            }
            project = {type: sourceType, rootPath: source, provenance: "fixture", capabilities: PROJECT_TYPE_CAPABILITIES[sourceType]};
            destination = path.join(root, "model.json");
        });
        afterEach(() => {
            jest.restoreAllMocks();
            fs.rmSync(root, {recursive: true, force: true});
        });
        const memberPath = (member: string): string => member === "blueprint" ? destination : `${destination}.conversion-evidence.json`;
        const assertOnlyCompetitor = (competitor: string, bytes: Buffer): void => {
            expect(fs.readFileSync(competitor)).toEqual(bytes);
            const other = competitor === destination ? memberPath("evidence") : destination;
            expect(fs.existsSync(other)).toBe(false);
            expect(fs.readdirSync(root).filter(name => name.startsWith(".") || name === "model.json" || name === "model.json.conversion-evidence.json")).toEqual([path.basename(competitor)]);
        };

        it.each(["blueprint", "evidence"])("preserves competing %s bytes introduced during the model read", async member => {
            const competitor = memberPath(member);
            const bytes = Buffer.from([0, 255, 13, 10, 42]);
            if (sourceType === "tsPackage") {
                const extract = PackageBlueprintExtraction.prototype.extract;
                jest.spyOn(PackageBlueprintExtraction.prototype, "extract").mockImplementation(async (input, options) => {
                    const result = await Reflect.apply(extract, new PackageBlueprintExtraction(), [input, options]);
                    fs.writeFileSync(competitor, bytes);
                    return result;
                });
            } else {
                const read = ParSheetImporter.prototype.importFromFile;
                jest.spyOn(ParSheetImporter.prototype, "importFromFile").mockImplementation(async filePath => {
                    const result = await Reflect.apply(read, new ParSheetImporter(), [filePath]);
                    fs.writeFileSync(competitor, bytes);
                    return result;
                });
            }
            await expect(new BlueprintArtifactBuilder().build(project, destination)).rejects.toThrow(/already exists/);
            assertOnlyCompetitor(competitor, bytes);
        });

        it.each(["blueprint", "evidence"])("does not replace %s introduced after the availability check", async member => {
            const competitor = memberPath(member);
            const bytes = Buffer.from("concurrent writer\n");
            const link = fs.promises.link.bind(fs.promises);
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                if (String(to) === competitor) fs.writeFileSync(competitor, bytes);
                await link(from, to);
            });
            await expect(new BlueprintArtifactBuilder().build(project, destination)).rejects.toThrow(/already exists/);
            assertOnlyCompetitor(competitor, bytes);
        });

        it.each(["blueprint", "evidence"])("preserves a replaced %s during cancellation rollback", async member => {
            const competitor = memberPath(member);
            const bytes = Buffer.from("replacement from another writer");
            const controller = new AbortController();
            const link = fs.promises.link.bind(fs.promises);
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                await link(from, to);
                if (String(to) === competitor) {
                    fs.unlinkSync(competitor);
                    fs.writeFileSync(competitor, bytes);
                    controller.abort();
                }
            });
            await expect(new BlueprintArtifactBuilder().build(project, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/);
            assertOnlyCompetitor(competitor, bytes);
        });

        it("preserves hard-linked publications under a replaced ancestor on cancellation", async () => {
            const parent = path.join(root, "nested");
            const moved = path.join(root, "moved-publication");
            destination = path.join(parent, "model.json");
            const controller = new AbortController();
            const link = fs.promises.link.bind(fs.promises);
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                await link(from, to);
                if (String(to) === memberPath("evidence")) {
                    fs.renameSync(parent, moved);
                    fs.mkdirSync(parent);
                    for (const member of ["blueprint", "evidence"]) fs.linkSync(path.join(moved, path.basename(memberPath(member))), memberPath(member));
                    fs.writeFileSync(path.join(parent, "unrelated.bin"), "replacement directory");
                    controller.abort();
                }
            });
            await expect(new BlueprintArtifactBuilder().build(project, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/);
            for (const member of ["blueprint", "evidence"]) expect(fs.readFileSync(memberPath(member))).toEqual(fs.readFileSync(path.join(moved, path.basename(memberPath(member)))));
            expect(fs.readdirSync(parent).sort()).toEqual(["model.json", "model.json.conversion-evidence.json", "unrelated.bin"]);
            expect(fs.readFileSync(path.join(parent, "unrelated.bin"), "utf8")).toBe("replacement directory");
        });

        it.each(["blueprint", "evidence"])("cleans only its allocations when %s publication fails", async member => {
            const link = fs.promises.link.bind(fs.promises);
            jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
                if (String(to) === memberPath(member)) throw new Error("injected publication failure");
                await link(from, to);
            });
            await expect(new BlueprintArtifactBuilder().build(project, destination)).rejects.toThrow(/injected publication failure/);
            expect(fs.readdirSync(root)).toEqual([path.basename(project.rootPath)]);
        });

        it("removes its first staging file when companion staging fails", async () => {
            const open = fs.promises.open.bind(fs.promises);
            jest.spyOn(fs.promises, "open").mockImplementation((filePath, flags, mode) => {
                if (String(filePath).includes("conversion-evidence.json.") && flags === "wx") return Promise.reject(new Error("injected staging failure"));
                return open(filePath, flags, mode);
            });
            await expect(new BlueprintArtifactBuilder().build(project, destination)).rejects.toThrow(/injected staging failure/);
            expect(fs.readdirSync(root)).toEqual([path.basename(project.rootPath)]);
        });
    });

    it("lists only matrix-advertised build targets", () => {
        expect(new Set(registry.listTargets())).toEqual(new Set(["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]));
    });

    it("reports the true required source capability and supported sources for a package build", () => {
        const descriptor = registry.describe("tsPackage");

        expect(descriptor.requiredSourceCapability).toBe(BLUEPRINT_BUILD_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "tsPackage", "parWorkbook"]);
    });

    it("reports the true required source capability and supported sources for an outcome-library build", () => {
        const descriptor = registry.describe("outcomeLibrary");

        expect(descriptor.requiredSourceCapability).toBe(OUTCOME_LIBRARY_GENERATE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "tsPackage", "outcomeLibrary", "parWorkbook"]);
    });

    it("reports the true required source capability and supported sources for a Stake artifact export", () => {
        const descriptor = registry.describe("stakeAdapter");

        expect(descriptor.requiredSourceCapability).toBe(STAKE_ADAPTER_EXPORT_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"]);
    });

    it("describes Blueprint/package Outcome and Stake conversions without denying them in target notes", () => {
        const tsPackageNotes = registry.describe("tsPackage").unsupportedNotes.join(" ");
        const outcomeLibrary = registry.describe("outcomeLibrary");
        const stakeAdapter = registry.describe("stakeAdapter");

        expect(tsPackageNotes).not.toMatch(/cannot itself be converted|cannot.*other target/i);
        expect(outcomeLibrary.supportedSources).toEqual(expect.arrayContaining(["blueprint", "tsPackage"]));
        expect(stakeAdapter.supportedSources).toEqual(expect.arrayContaining(["blueprint", "tsPackage"]));
    });

    it("reports the true required source capability and supported sources for a PAR export", () => {
        const descriptor = registry.describe("parWorkbook");

        expect(descriptor.requiredSourceCapability).toBe(PAR_WORKBOOK_EXCHANGE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint", "tsPackage", "parWorkbook"]);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/Game Blueprint.*PAR workbook snapshot/i);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/preserving exact and weighted whole-sequence reels/i);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/generated\/per-symbol sources as diagnosed deterministic snapshots/i);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/republishes an existing PAR workbook/i);
        expect(descriptor.unsupportedNotes.join(" ")).toMatch(/does not recover a model from outcome artifacts/i);
        expect(descriptor.unsupportedNotes.join(" ")).not.toMatch(/does not derive.*blueprint/i);
    });

    it("never promises reversible model recovery from an outcome-based artifact", () => {
        const outcomeLibraryNotes = registry.describe("outcomeLibrary").unsupportedNotes.join(" ");
        const stakeAdapterNotes = registry.describe("stakeAdapter").unsupportedNotes.join(" ");

        expect(outcomeLibraryNotes).toMatch(/never recovers a game model/);
        expect(stakeAdapterNotes).toMatch(/never re-derives or recovers the game model/);
    });

    it("exposes WASM as a canonical Blueprint/PAR target", () => {
        const tsPackageNotes = registry.describe("tsPackage").unsupportedNotes.join(" ");

        expect(tsPackageNotes).toMatch(/complete public package descriptor/);
        expect(registry.describe("wasm")).toMatchObject({requiredSourceCapability: WASM_EXPORT_CAPABILITY, supportedSources: ["blueprint", "tsPackage", "parWorkbook"]});
    });

    it("throws for a target it has no descriptor for", () => {
        expect(() => registry.describe("bogus" as never)).toThrow(/Build target "bogus" is unavailable.*Next: choose a target shown by `pokie build --help`/);
    });

    describe("supportsConversionFrom", () => {
        it("agrees with the descriptor's own supportedSources", () => {
            expect(registry.supportsConversionFrom("tsPackage", "blueprint")).toBe(true);
            expect(registry.supportsConversionFrom("tsPackage", "tsPackage")).toBe(true);
        });
    });

    describe("build", () => {
        function projectOf(type: "blueprint" | "tsPackage"): PokieProject {
            return {type, rootPath: `/projects/${type}`, capabilities: PROJECT_TYPE_CAPABILITIES[type], provenance: "test fixture"} as PokieProject;
        }

        function fakeBuilder(target: "tsPackage"): ArtifactBuilder & {calls: number} {
            const builder = {
                target,
                destinationKind: "directory" as const,
                calls: 0,
                build(source: PokieProject, destinationPath: string) {
                    builder.calls++;
                    return Promise.resolve({outputPath: destinationPath});
                },
            };
            return builder;
        }

        it("delegates to the registered builder for a supported conversion", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));

            const result = await withBuilder.build("tsPackage", projectOf("blueprint"), "/out/my-game");

            expect(result).toEqual({outputPath: "/out/my-game"});
            expect(builder.calls).toBe(1);
        });

        it("rejects a prepared plan when its source or destination identity drifts", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source = projectOf("blueprint");
            const plan = await withBuilder.preparePlan(source, "tsPackage", {destinationPath: "/out/prepared-game"});

            await expect(withBuilder.executePlan(plan, {...source, rootPath: "/projects/moved-blueprint"}, "/out/prepared-game")).rejects.toThrow(/source identity changed/);
            await expect(withBuilder.executePlan(plan, source, "/out/other-game")).rejects.toThrow(/destination changed/);
            expect(builder.calls).toBe(0);
        });

        it("rebinds PAR workbook bytes before executing a prepared downstream plan", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-drift-"));
            const workbookPath = path.join(directory, "source.xlsx");
            fs.writeFileSync(workbookPath, "prepared workbook bytes");
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
                configurationProvenance: {configurationHash: computeArtifactInputBindingHash([workbookPath])},
            } as PokieProject;
            const plan = await withBuilder.preparePlan(source, "tsPackage", {destinationPath: path.join(directory, "package")});
            fs.writeFileSync(workbookPath, "changed workbook bytes");

            await expect(withBuilder.executePlan(plan, source, path.join(directory, "package"))).rejects.toThrow(/PAR workbook changed after this conversion was prepared/);
            expect(builder.calls).toBe(0);
            expect(fs.existsSync(path.join(directory, "package"))).toBe(false);
            fs.rmSync(directory, {recursive: true, force: true});
        });

        it("creates a missing explicit parent before publishing PAR Blueprints and staging downstream plans", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-parent-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const blueprintDestination = path.join(directory, "nested", "blueprints", "imported.blueprint.json");
            const packageDestination = path.join(directory, "nested", "packages", "game");
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            const packageBuilder: ArtifactBuilder = {
                target: "tsPackage",
                destinationKind: "directory",
                async build(_source, destinationPath) {
                    await fs.promises.mkdir(destinationPath, {recursive: true});
                    await fs.promises.writeFile(path.join(destinationPath, "package.json"), "{}", "utf8");
                    return {outputPath: destinationPath};
                },
            };
            const downstreamRegistry = new ArtifactBuilderRegistry("1.3.0", new Map([
                ["blueprint", new BlueprintArtifactBuilder()],
                ["tsPackage", packageBuilder],
            ]));

            try {
                fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

                const blueprint = await registry.build("blueprint", source, blueprintDestination);
                expect(blueprint.outputPath).toBe(blueprintDestination);
                expect(fs.existsSync(blueprintDestination)).toBe(true);
                expect(fs.existsSync(`${blueprintDestination}.conversion-evidence.json`)).toBe(true);

                const packageResult = await downstreamRegistry.build("tsPackage", source, packageDestination);
                expect(packageResult.outputPath).toBe(packageDestination);
                expect(fs.existsSync(path.join(packageDestination, "package.json"))).toBe(true);
                expect(fs.existsSync(path.join(packageDestination, ".pokie", "par-import", "conversion-evidence.json"))).toBe(true);
                expect(fs.readdirSync(path.dirname(packageDestination))).not.toEqual(expect.arrayContaining([expect.stringMatching(/^\.pokie-par-import-/)]));
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("builds PAR-to-WASM through the imported Blueprint and stores evidence beside the module", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-wasm-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const destination = path.join(directory, "nested", "game.wasm");
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            try {
                fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
                const plan = await registry.preparePlan(source, "wasm", {destinationPath: destination});
                const importedBlueprintPath = `${destination}.pokie/par-import/imported.blueprint.json`;
                const conversionEvidencePath = `${destination}.pokie/par-import/conversion-evidence.json`;

                expect(plan.status).toBe("planned");
                expect(plan.steps[0]).toMatchObject({
                    kind: "importParWorkbook",
                    output: {canonicalLocation: importedBlueprintPath},
                    conversionEvidencePath,
                });
                const result = await registry.executePlan(plan, source, destination);

                expect(result).toMatchObject({outputPath: destination, importedBlueprintPath, conversionEvidencePath});
                expect(fs.existsSync(destination)).toBe(true);
                expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(true);
                expect(fs.existsSync(importedBlueprintPath)).toBe(true);
                expect(fs.existsSync(conversionEvidencePath)).toBe(true);
                expect(fs.existsSync(path.join(destination, ".pokie", "par-import"))).toBe(false);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("validates the PAR-imported canonical WASM model during dry-run without publishing any companion", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-wasm-dry-run-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const destination = path.join(directory, "game.wasm");
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            try {
                fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
                const plan = await registry.preparePlan(source, "wasm", {destinationPath: destination});
                await expect(registry.validate("wasm", source, plan)).resolves.toBeUndefined();
                expect(fs.existsSync(destination)).toBe(false);
                expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
                expect(fs.existsSync(`${destination}.pokie`)).toBe(false);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("validates canonical PAR free games during WASM dry-run without publication", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-wasm-invalid-dry-run-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const destination = path.join(directory, "game.wasm");
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            const featureBlueprint = {
                manifest: {id: "par-free-games", name: "PAR Free Games", version: "1.0.0"},
                reels: 3,
                rows: 1,
                symbols: ["A", "B", "S"],
                scatters: ["S"],
                reelStrips: [["A", "B", "S"], ["B", "S", "A"], ["S", "A", "B"]],
                paytable: {A: {3: 2}, B: {3: 1}, S: {3: 1}},
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 5}}},
            };
            try {
                const issues = await new ParSheetExporter("1.3.0").exportToFile(featureBlueprint, workbookPath);
                expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
                const plan = await registry.preparePlan(source, "wasm", {destinationPath: destination});
                await expect(registry.validate("wasm", source, plan)).resolves.toBeUndefined();
                expect(fs.existsSync(destination)).toBe(false);
                expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("refuses an occupied PAR-to-WASM evidence companion without touching it", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-wasm-evidence-conflict-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const destination = path.join(directory, "game.wasm");
            const evidence = `${destination}.pokie`;
            const source: PokieProject = {type: "parWorkbook", rootPath: workbookPath, capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook, provenance: "test PAR workbook"} as PokieProject;
            try {
                fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
                fs.mkdirSync(evidence);
                fs.writeFileSync(path.join(evidence, "preserve.txt"), "pre-existing evidence");
                await expect(registry.build("wasm", source, destination)).rejects.toThrow(/evidence companion.*already exists/i);
                expect(fs.readFileSync(path.join(evidence, "preserve.txt"), "utf8")).toBe("pre-existing evidence");
                expect(fs.existsSync(destination)).toBe(false);
                expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("removes only PAR-to-WASM files owned by a cancelled publication", async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-wasm-cancel-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const destination = path.join(directory, "game.wasm");
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            const controller = new AbortController();
            try {
                fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);
                await expect(registry.build("wasm", source, destination, {
                    signal: controller.signal,
                    onProgress: (progress) => {
                        if (progress.status === "completed") controller.abort();
                    },
                })).rejects.toThrow(/cancelled/i);

                expect(fs.existsSync(workbookPath)).toBe(true);
                expect(fs.existsSync(destination)).toBe(false);
                expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
                expect(fs.existsSync(`${destination}.pokie`)).toBe(false);
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it.each(["outcomeLibrary", "stakeAdapter"] as const)("removes the managed and Studio registrations when PAR-to-%s promotion is cancelled", async (target) => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-registry-par-promotion-"));
            const workbookPath = path.join(directory, "source.xlsx");
            const destination = path.join(directory, target === "outcomeLibrary" ? "outcomes" : "stake");
            const studioRoots = new Set<string>();
            const managedOutcomes = new ManagedOutcomeProjectService(
                undefined,
                (project) => {
                    studioRoots.add(project.rootPath);
                    return Promise.resolve();
                },
                undefined,
                (rootPath) => {
                    studioRoots.delete(rootPath);
                    return Promise.resolve();
                },
            );
            const controller = new AbortController();
            let registrations = 0;
            const failingPromotionService = {
                findCompatible: (...args: Parameters<ManagedOutcomeProjectService["findCompatible"]>) => managedOutcomes.findCompatible(...args),
                allocateRoot: (...args: Parameters<ManagedOutcomeProjectService["allocateRoot"]>) => managedOutcomes.allocateRoot(...args),
                release: (...args: Parameters<ManagedOutcomeProjectService["release"]>) => managedOutcomes.release(...args),
                registerAndOpen: async (...args: Parameters<ManagedOutcomeProjectService["registerAndOpen"]>) => {
                    registrations++;
                    const project = await managedOutcomes.registerAndOpen(...args);
                    if (registrations === 2) controller.abort();
                    return project;
                },
            };
            const withPromotionFailure = new ArtifactBuilderRegistry("1.3.0", undefined as never, failingPromotionService);
            const source: PokieProject = {
                type: "parWorkbook",
                rootPath: workbookPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.parWorkbook,
                provenance: "test PAR workbook",
            } as PokieProject;
            fs.copyFileSync(path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx"), workbookPath);

            try {
                await expect(withPromotionFailure.build(target, source, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
                expect(fs.existsSync(workbookPath)).toBe(true);
                expect(fs.existsSync(destination)).toBe(false);
                expect(fs.existsSync(path.join(destination, ".pokie", "par-import", "conversion-evidence.json"))).toBe(false);
                expect(fs.existsSync(path.join(directory, ".pokie", "managed-outcome-projects.json"))).toBe(false);
                expect(studioRoots).toEqual(new Set());
            } finally {
                fs.rmSync(directory, {recursive: true, force: true});
            }
        });

        it("rejects a fabricated graph even when its source and destination identities match", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source = projectOf("blueprint");
            const plan = await withBuilder.preparePlan(source, "tsPackage", {destinationPath: "/out/prepared-game"});
            const fabricated = {
                ...plan,
                steps: [],
            } as ArtifactConversionPlan;

            await expect(withBuilder.executePlan(fabricated, source, "/out/prepared-game")).rejects.toThrow(/graph is stale or invalid/);
            expect(builder.calls).toBe(0);
        });

        it("rejects validation against a different target than the prepared plan", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));
            const source = projectOf("blueprint");
            const plan = await withBuilder.preparePlan(source, "tsPackage");

            await expect(withBuilder.validate("outcomeLibrary", source, plan)).rejects.toThrow(/requested target does not match/);
        });

        it("rejects with the matrix diagnostic before invoking any builder", async () => {
            const builder = fakeBuilder("tsPackage");
            const withBuilder = new ArtifactBuilderRegistry("1.3.0", new Map([["tsPackage", builder]]));

            await expect(withBuilder.build("tsPackage", projectOf("tsPackage"), "/out/my-game")).rejects.toThrow(
                /Package extraction malformed:.*package-model-read-failed/,
            );
            expect(builder.calls).toBe(0);
        });

        it("does not advertise a target whose injected configuration cannot build it", async () => {
            const withoutBuilders = new ArtifactBuilderRegistry("1.3.0", new Map());

            // A custom registry can still be incomplete, but it must not retain a dead public target.
            // Production construction supplies every ArtifactTargetType builder.
            expect(withoutBuilders.listTargets()).toEqual([]);
            await expect(withoutBuilders.build("tsPackage", projectOf("blueprint"), "/out/my-game")).rejects.toThrow(
                /Build target "tsPackage" is unavailable.*Next: choose a target shown by `pokie build --help`/,
            );
            expect(() => withoutBuilders.describe("tsPackage")).toThrow(/Build target "tsPackage" is unavailable/);
        });

        it("resolves a Blueprint's registered Outcome Library prerequisite before exporting Stake, and reuses it deterministically", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-stake-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const firstStakeDir = path.join(workDir, "stake-one");
            const secondStakeDir = path.join(workDir, "stake-two");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "registry-slot", name: "Registry Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A"], ["A"], ["A"]],
                    availableBets: [1],
                }),
            );
            const blueprintProject: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;

            try {
                await registry.build("stakeAdapter", blueprintProject, firstStakeDir);
                const managedRoot = path.join(workDir, ".pokie", "outcome-libraries");
                const [managedLibrary] = fs.readdirSync(managedRoot);
                const libraryDir = path.join(managedRoot, managedLibrary);
                const manifestBeforeReuse = fs.readFileSync(path.join(libraryDir, "manifest.json"), "utf-8");
                const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf-8")) as {
                    projects: {rootPath: string; gameId: string; gameVersion: string; configHash: string}[];
                };

                expect(managedRegistry.projects).toEqual([
                    expect.objectContaining({rootPath: libraryDir, gameId: "registry-slot", gameVersion: "1.0.0", configHash: expect.any(String)}),
                ]);

                await registry.build("stakeAdapter", blueprintProject, secondStakeDir);

                expect(fs.existsSync(path.join(firstStakeDir, "index.json"))).toBe(true);
                expect(fs.existsSync(path.join(secondStakeDir, "index.json"))).toBe(true);
                expect(fs.readFileSync(path.join(libraryDir, "manifest.json"), "utf-8")).toBe(manifestBeforeReuse);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("releases a newly materialized managed prerequisite when its planned Stake publication fails", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stake-prerequisite-rollback-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const stakeDir = path.join(workDir, "stake");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "rollback-slot", name: "Rollback Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A"], ["A"], ["A"]],
                    availableBets: [1],
                }),
            );
            const source: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const failingStakeBuilder: ArtifactBuilder = {
                target: "stakeAdapter",
                destinationKind: "directory",
                build: () => Promise.reject(new Error("Stake publication failed")),
            };
            const registry = new ArtifactBuilderRegistry(
                "1.3.0",
                new Map([["stakeAdapter", failingStakeBuilder]]),
                new ManagedOutcomeProjectService(),
            );

            try {
                await expect(registry.build("stakeAdapter", source, stakeDir)).rejects.toThrow("Stake publication failed");
                expect(fs.existsSync(stakeDir)).toBe(false);
                const managedRoot = path.join(workDir, ".pokie", "outcome-libraries");
                expect(fs.existsSync(managedRoot) ? fs.readdirSync(managedRoot) : []).toEqual([]);
                expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("registers and reopens a direct Blueprint Outcome Project before Stake reuses that exact record", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-outcome-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const outcomeDir = path.join(workDir, "direct-outcome");
            const stakeDir = path.join(workDir, "stake");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "direct-outcome-slot", name: "Direct Outcome Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A"], ["A"], ["A"]],
                    availableBets: [1],
                }),
            );
            const blueprintProject: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;

            try {
                const outcome = await registry.build("outcomeLibrary", blueprintProject, outcomeDir);
                expect(outcome).toMatchObject({
                    outputPath: outcomeDir,
                    managedProjectRoots: [outcomeDir],
                    managedOutcomeProjectOwnership: [{rootPath: outcomeDir, sourceRootPath: blueprintPath, disposition: "owned"}],
                });
                expect(fs.existsSync(path.join(outcomeDir, "manifest.json"))).toBe(true);

                const managedRegistry = JSON.parse(fs.readFileSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"), "utf-8")) as {
                    projects: {rootPath: string; gameId: string; gameVersion: string; configHash: string}[];
                };
                expect(managedRegistry.projects).toEqual([
                    expect.objectContaining({rootPath: outcomeDir, gameId: "direct-outcome-slot", gameVersion: "1.0.0", configHash: expect.any(String)}),
                ]);

                // A plan is a public JSON payload, not a process-local token.
                // Reopening this serialized selected reuse plan proves direct
                // execution does not depend on registry WeakMap state.
                const stakePlan = JSON.parse(JSON.stringify(await registry.preparePlan(blueprintProject, "stakeAdapter", {destinationPath: stakeDir}))) as ArtifactConversionPlan;
                expect(stakePlan.steps.map((step) => step.kind)).toEqual(["reuseManagedOutcomeLibrary", "publish"]);
                const stake = await registry.executePlan(stakePlan, blueprintProject, stakeDir);
                expect(stake.prerequisiteProjectRoots).toEqual([outcomeDir]);
                expect(stake.managedProjectRoots).toEqual([outcomeDir]);
                expect(fs.existsSync(path.join(stakeDir, "index.json"))).toBe(true);

                const secondOutcomeDir = path.join(workDir, "second-outcome");
                await expect(registry.build("outcomeLibrary", blueprintProject, secondOutcomeDir)).resolves.toMatchObject({
                    outputPath: secondOutcomeDir,
                    managedProjectRoots: [secondOutcomeDir],
                    reusedCompatibleProject: true,
                });
                expect(fs.existsSync(path.join(secondOutcomeDir, "manifest.json"))).toBe(true);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("validates and executes an unchanged bounded-sample prepared plan", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-bounded-plan-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const outcomeDir = path.join(workDir, "outcome");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "bounded-plan-slot", name: "Bounded Plan Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A", "B"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A", "B"], ["A", "B"], ["A", "B"]],
                    availableBets: [1],
                }),
            );
            const blueprintProject: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const outcomeLibraryGeneration = {sampled: {sampleSize: BigInt(4), seed: "bounded-plan-seed"}};

            try {
                const plan = await registry.preparePlan(blueprintProject, "outcomeLibrary", {destinationPath: outcomeDir, outcomeLibraryGeneration});

                expect(plan.source.configurationProvenance).toMatchObject({
                    generationSemantics: "boundedSample",
                    sampleCount: "4",
                    sampleSeed: "bounded-plan-seed",
                });
                await expect(registry.validate("outcomeLibrary", blueprintProject, plan)).resolves.toBeUndefined();
                await expect(registry.executePlan(plan, blueprintProject, outcomeDir)).resolves.toMatchObject({outputPath: outcomeDir});
                expect(fs.existsSync(path.join(outcomeDir, "manifest.json"))).toBe(true);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("reconstructs automatic and explicit managed generation provenance, reuses only the compatible policy, and rejects a stale plan", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-managed-policy-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const automaticOut = path.join(workDir, "automatic-outcome");
            const explicitOut = path.join(workDir, "explicit-outcome");
            // 20^4 is above the managed 50,000 exact cap, while its 5,000
            // deterministic sampled draws remain small enough for this real
            // public registry test.
            const strip = Array.from({length: 20}, () => "A");
            const writeBlueprint = (version: string) => fs.writeFileSync(blueprintPath, JSON.stringify({
                manifest: {id: "managed-policy-slot", name: "Managed Policy Slot", version}, reels: 4, rows: 1, symbols: ["A"],
                paytable: {A: {3: 1, 4: 2}}, reelStrips: [strip, strip, strip, strip], availableBets: [1],
            }));
            writeBlueprint("1.0.0");
            const source: PokieProject = {
                type: "blueprint", rootPath: blueprintPath, capabilities: PROJECT_TYPE_CAPABILITIES.blueprint, provenance: "test fixture",
            } as PokieProject;

            try {
                const automaticPlan = await registry.preparePlan(source, "outcomeLibrary", {destinationPath: automaticOut});
                expect(automaticPlan.source.configurationProvenance).toMatchObject({
                    generationSemantics: "boundedSample", sampleCount: "5000", maxExactOutcomeSpaceSize: "50000", compatibilityPolicyVersion: "managed-v1",
                });
                await expect(registry.executePlan(automaticPlan, source, automaticOut)).resolves.toMatchObject({outputPath: automaticOut});

                const reusedAutomaticPlan = await registry.preparePlan(source, "outcomeLibrary", {destinationPath: path.join(workDir, "automatic-republish")});
                expect(reusedAutomaticPlan.steps.map((step) => step.kind)).toContain("reuseManagedOutcomeLibrary");
                expect(reusedAutomaticPlan.source.configurationProvenance).toEqual(automaticPlan.source.configurationProvenance);
                await expect(registry.executePlan(reusedAutomaticPlan, source, path.join(workDir, "automatic-republish"))).resolves.toMatchObject({
                    outputPath: path.join(workDir, "automatic-republish"),
                });

                const explicitPlan = await registry.preparePlan(source, "outcomeLibrary", {
                    destinationPath: explicitOut,
                    outcomeLibraryGeneration: {
                        sampled: {sampleSize: BigInt(7), seed: "explicit-policy-seed"},
                        maxExactOutcomeSpaceSize: BigInt(321), compatibilityPolicyVersion: "explicit-v1",
                    },
                });
                expect(explicitPlan.source.configurationProvenance).toMatchObject({
                    generationSemantics: "boundedSample", sampleCount: "7", sampleSeed: "explicit-policy-seed",
                    maxExactOutcomeSpaceSize: "321", compatibilityPolicyVersion: "explicit-v1",
                });
                expect(explicitPlan.steps.map((step) => step.kind)).not.toContain("reuseManagedOutcomeLibrary");
                await expect(registry.executePlan(explicitPlan, source, explicitOut)).resolves.toMatchObject({outputPath: explicitOut});

                const reusedExplicitPlan = await registry.preparePlan(source, "outcomeLibrary", {
                    destinationPath: path.join(workDir, "explicit-republish"),
                    outcomeLibraryGeneration: {
                        sampled: {sampleSize: BigInt(7), seed: "explicit-policy-seed"},
                        maxExactOutcomeSpaceSize: BigInt(321), compatibilityPolicyVersion: "explicit-v1",
                    },
                });
                expect(reusedExplicitPlan.steps.map((step) => step.kind)).toContain("reuseManagedOutcomeLibrary");
                expect(reusedExplicitPlan.source.configurationProvenance).toEqual(explicitPlan.source.configurationProvenance);
                await expect(registry.executePlan(reusedExplicitPlan, source, path.join(workDir, "explicit-republish"))).resolves.toMatchObject({
                    outputPath: path.join(workDir, "explicit-republish"),
                });

                const explicitManifestBeforeDrift = fs.readFileSync(path.join(explicitOut, "manifest.json"), "utf8");
                writeBlueprint("2.0.0");
                await expect(registry.executePlan(explicitPlan, source, explicitOut)).rejects.toThrow(/source configuration or generation provenance changed/i);
                // A stale prepared request is rejected before it can replace
                // an already-compatible explicit publication.
                expect(fs.readFileSync(path.join(explicitOut, "manifest.json"), "utf8")).toBe(explicitManifestBeforeDrift);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        // Planning, validation and publication each snapshot the real package/runtime graph.
        // Use the same bounded lifecycle budget as the other package-source conversions,
        // including when the controller runs this file alongside other Jest workers.
        it("materializes a real tsPackage through the registry for Outcome and Stake, preserving all runtime modes", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-tspackage-outcome-registry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const packageDir = path.join(workDir, "package");
            const outcomeDir = path.join(workDir, "outcome");
            const stakeDir = path.join(workDir, "stake");
            fs.writeFileSync(
                blueprintPath,
                JSON.stringify({
                    manifest: {id: "package-outcome-slot", name: "Package Outcome Slot", version: "1.0.0"},
                    reels: 3,
                    rows: 1,
                    symbols: ["A"],
                    paytable: {A: {2: 1, 3: 2}},
                    reelStrips: [["A"], ["A"], ["A"]],
                    availableBets: [1],
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "ante", runtimeType: "ante", costMultiplier: 2},
                    ],
                }),
            );
            const blueprintProject: PokieProject = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;

            try {
                await registry.build("tsPackage", blueprintProject, packageDir);
                const packageProject = projectOf("tsPackage");
                const tsPackageProject = {...packageProject, rootPath: packageDir};

                // A package's managed Outcome sidecar is the one deliberate
                // descendant output.  Its prepared plan, dry-run validation,
                // and execution must all accept the exact same destination.
                const sidecarDir = path.join(packageDir, "outcomelibrary");
                const sidecarPlan = await registry.preparePlan(tsPackageProject, "outcomeLibrary", {destinationPath: sidecarDir});
                expect(sidecarPlan.status).toBe("planned");
                await expect(registry.validate("outcomeLibrary", tsPackageProject, sidecarPlan)).resolves.toBeUndefined();
                await expect(registry.executePlan(sidecarPlan, tsPackageProject, sidecarDir)).resolves.toMatchObject({outputPath: sidecarDir});
                expect(fs.existsSync(path.join(sidecarDir, "manifest.json"))).toBe(true);

                await expect(registry.build("outcomeLibrary", tsPackageProject, outcomeDir)).resolves.toMatchObject({outputPath: outcomeDir});
                expect(JSON.parse(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")).modes).toEqual([
                    expect.objectContaining({modeName: "base", betMode: "base", stake: 1}),
                    expect.objectContaining({modeName: "ante", betMode: "ante", stake: 2}),
                ]);

                await expect(registry.build("stakeAdapter", tsPackageProject, stakeDir)).resolves.toMatchObject({outputPath: stakeDir});
                expect(JSON.parse(fs.readFileSync(path.join(stakeDir, "pokie-manifest.json"), "utf-8")).modes).toEqual([
                    expect.objectContaining({name: "base", betMode: "base", stake: 1, cost: 1}),
                    expect.objectContaining({name: "ante", betMode: "ante", stake: 2, cost: 2}),
                ]);
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

        it("returns a Game Model fix route for an invalid Blueprint and lets the same Stake request succeed after retry", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-stake-retry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const stakeDir = path.join(workDir, "stake");
            const project = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const writeBlueprint = (reels: number) =>
                fs.writeFileSync(
                    blueprintPath,
                    JSON.stringify({
                        manifest: {id: "retry-slot", name: "Retry Slot", version: "1.0.0"},
                        reels,
                        rows: 1,
                        symbols: ["A"],
                        paytable: {A: {2: 1, 3: 2}},
                        reelStrips: [["A"], ["A"], ["A"]],
                        availableBets: [1],
                    }),
                );

            try {
                writeBlueprint(0);
                await expect(registry.build("stakeAdapter", project, stakeDir)).rejects.toThrow(/fix it in Game Model and retry/i);

                writeBlueprint(3);
                await expect(registry.build("stakeAdapter", project, stakeDir)).resolves.toMatchObject({outputPath: stakeDir, prerequisiteProjectRoots: [expect.any(String)]});
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });

        it("leaves no direct Outcome bundle behind for an invalid Blueprint and succeeds after Game Model retry", async () => {
            const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-outcome-retry-test-"));
            const blueprintPath = path.join(workDir, "game.blueprint.json");
            const outcomeDir = path.join(workDir, "outcome");
            const project = {
                type: "blueprint",
                rootPath: blueprintPath,
                capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
                provenance: "test fixture",
            } as PokieProject;
            const writeBlueprint = (reels: number) =>
                fs.writeFileSync(
                    blueprintPath,
                    JSON.stringify({
                        manifest: {id: "outcome-retry-slot", name: "Outcome Retry Slot", version: "1.0.0"},
                        reels,
                        rows: 1,
                        symbols: ["A"],
                        paytable: {A: {2: 1, 3: 2}},
                        reelStrips: [["A"], ["A"], ["A"]],
                        availableBets: [1],
                    }),
                );

            try {
                writeBlueprint(0);
                await expect(registry.build("outcomeLibrary", project, outcomeDir)).rejects.toThrow(/fix it in Game Model and retry/i);
                expect(fs.existsSync(outcomeDir)).toBe(false);

                writeBlueprint(3);
                await expect(registry.build("outcomeLibrary", project, outcomeDir)).resolves.toMatchObject({
                    outputPath: outcomeDir,
                    managedProjectRoots: [outcomeDir],
                    managedOutcomeProjectOwnership: [{rootPath: outcomeDir, sourceRootPath: blueprintPath, disposition: "owned"}],
                });
            } finally {
                fs.rmSync(workDir, {recursive: true, force: true});
            }
        });
    });

    describe("checkDestination", () => {
        let dir: string;

        beforeEach(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-registry-checkdestination-test-"));
        });

        afterEach(() => {
            fs.rmSync(dir, {recursive: true, force: true});
        });

        it("reports a missing destination as available, without ever invoking the builder", () => {
            const destination = path.join(dir, "not-yet-there");

            expect(registry.checkDestination("tsPackage", destination)).toEqual({available: true});
            expect(fs.existsSync(destination)).toBe(false);
        });

        it("reports an existing, non-empty directory destination as unavailable, using the same conflict message build() itself would throw", () => {
            const destination = path.join(dir, "occupied");
            fs.mkdirSync(destination);
            fs.writeFileSync(path.join(destination, "unrelated.txt"), "pre-existing");

            const result = registry.checkDestination("tsPackage", destination);

            expect(result).toEqual({available: false, message: expect.stringMatching(/already exists and is not empty/)});
        });

        it("reports an empty existing directory as available (the same bar build() itself allows)", () => {
            const destination = path.join(dir, "empty-dir");
            fs.mkdirSync(destination);

            expect(registry.checkDestination("tsPackage", destination)).toEqual({available: true});
        });

        it("checks a 'file' target's destination as a file, not a directory -- an existing file is unavailable even though it's empty", () => {
            const destination = path.join(dir, "workbook.xlsx");
            fs.writeFileSync(destination, "");

            const result = registry.checkDestination("parWorkbook", destination);

            expect(result).toEqual({available: false, message: expect.stringMatching(/already exists/)});
        });

    });
});
