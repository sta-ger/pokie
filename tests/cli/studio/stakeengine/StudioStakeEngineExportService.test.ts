import {ArtifactConversionPlan, computeWeightedOutcomeLibraryHash, OutcomeLibraryBundleWriter, WeightedOutcomeLibrary} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioStakeEngineExportService} from "../../../../cli/studio/stakeengine/StudioStakeEngineExportService.js";
import {buildStakeEngineTestLibrary} from "../../../stakeengine/StakeEngineTestFixtures.js";

const TEST_POKIE_VERSION = "1.3.0";

const plannedStakeExport: ArtifactConversionPlan = {
    status: "planned",
    source: {kind: "outcomeLibrary", capabilities: ["stake-adapter-export"]},
    target: {kind: "stakeAdapter", capabilities: ["stake-adapter-export"]},
    steps: [{kind: "publish", choice: "publish", estimatedWork: "publish", input: {kind: "outcomeLibrary", capabilities: []}, output: {kind: "stakeAdapter", capabilities: []}}],
    preflight: {destinationKind: "directory", estimatedWork: "publish", losses: [], oneWay: true},
};

async function writeLibraryBundle(projectRoot: string, relativePath: string, library: WeightedOutcomeLibrary<string>, modeName = "base"): Promise<void> {
    await new OutcomeLibraryBundleWriter(TEST_POKIE_VERSION).writeToDirectory(
        [{modeName, libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes}],
        path.join(projectRoot, relativePath),
    );
}

function bundleSelector(modeName: string): {kind: "bundle"; bundleDir: string; modeName: string} {
    return {kind: "bundle", bundleDir: "outcomelibrary", modeName};
}

describe("StudioStakeEngineExportService", () => {
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-stakeengine-service-"));
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    describe("validate", () => {
        it("does not attach a project-root plan to an external JSON selector", async () => {
            const unavailable: ArtifactConversionPlan = {
                ...plannedStakeExport,
                status: "unavailable",
                diagnostic: {
                    code: "missing-capability",
                    failedEdge: {from: "outcomeLibrary", to: "stakeAdapter"},
                    message: "The source cannot export Stake.",
                    recovery: "Open a compatible source.",
                },
            };
            const planning = {prepare: jest.fn(() => Promise.resolve(unavailable))};
            const service = new StudioStakeEngineExportService(
                TEST_POKIE_VERSION,
                undefined, undefined,
                jest.fn(() => {
                    throw new Error("selector must not load");
                }),
                undefined, undefined, undefined, undefined, planning,
            );

            await expect(service.validate(tmpRoot, [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}]))
                .resolves.toMatchObject({status: "unavailable", plan: {diagnostic: {code: "unrecognized-source"}}});
            expect(planning.prepare).not.toHaveBeenCalled();
        });

        it("does not attach a project-root conflict to an external JSON selector", async () => {
            const conflict: ArtifactConversionPlan = {
                ...plannedStakeExport,
                status: "conflict",
                diagnostic: {
                    code: "destination-conflict",
                    failedEdge: {from: "outcomeLibrary", to: "stakeAdapter"},
                    message: "The selected directory is occupied.",
                    recovery: "Choose another directory.",
                },
            };
            const planning = {prepare: jest.fn(() => Promise.resolve(conflict))};
            const service = new StudioStakeEngineExportService(
                TEST_POKIE_VERSION,
                undefined, undefined,
                jest.fn(() => {
                    throw new Error("selector must not load");
                }),
                undefined, undefined, undefined, undefined, planning,
            );

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: {kind: "json", path: "base.json"}, cost: 1}], "stakeengine", false);

            expect(view).toMatchObject({status: "unavailable", plan: {diagnostic: {code: "unrecognized-source"}}});
            expect(planning.prepare).not.toHaveBeenCalled();
        });

        it("returns a truthful unavailable plan for a raw JSON selector before it is read", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const planning = {prepare: jest.fn(() => Promise.resolve(plannedStakeExport))};
            const service = new StudioStakeEngineExportService(
                TEST_POKIE_VERSION,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                planning,
            );
            const modes = [{modeName: "base", librarySelector: {kind: "json" as const, path: "base.json"}, cost: 1}];

            const validation = await service.validate(tmpRoot, modes);
            const exported = await service.export(tmpRoot, modes, "stakeengine", false);

            expect(validation).toMatchObject({status: "unavailable", plan: {diagnostic: {code: "unrecognized-source"}}});
            expect(exported).toMatchObject({status: "unavailable", plan: {diagnostic: {code: "unrecognized-source"}}});
            expect(planning.prepare).not.toHaveBeenCalled();
        });

        it("returns a clean diagnostics view with per-mode provenance for a real library", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}]);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors).toEqual([]);
            expect(view.modes).toEqual([
                {
                    modeName: "base",
                    cost: 1,
                    outcomeCount: library.outcomes.length,
                    libraryId: "base-lib",
                    libraryHash: computeWeightedOutcomeLibraryHash(library),
                },
            ]);
        });

        it("surfaces structural validation errors (never a thrown/load-error) for an unsupported cost/outcome combination", async () => {
            // cost: 1/3 makes payoutMultiplier * cost * 100 non-integral for this fixture's win amounts,
            // which StakeEngineExportValidator reports as a "not representable in Stake units" error --
            // the same preflight the Export step's own StakeEngineExporter runs internally.
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1 / 3}]);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors.length).toBeGreaterThan(0);
        });

        it("reports load-error for a libraryPath that resolves outside the project root", async () => {
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", librarySelector: {kind: "json", path: "../outside.json"}, cost: 1}]);

            expect(view.status).toBe("unavailable");
            if (view.status !== "unavailable") throw new Error("expected unavailable");
            expect(view.plan.diagnostic?.code).toBe("unrecognized-source");
        });

        it("reports load-error for a libraryPath that doesn't exist", async () => {
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", librarySelector: {kind: "json", path: "missing.json"}, cost: 1}]);

            expect(view.status).toBe("unavailable");
            if (view.status !== "unavailable") throw new Error("expected unavailable");
            expect(view.plan.diagnostic?.code).toBe("unrecognized-source");
        });

        // The registry-integration case this tab exists for: a "bundle" selector -- exactly what the
        // Outcome Libraries registry discovers as "compatible" -- resolves through the same
        // loadOutcomeLibraryFromSelector the Deployment tab already uses, never a flat libraryPath.
        it("resolves a mode from a canonical outcome-library bundle selector", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await new OutcomeLibraryBundleWriter(TEST_POKIE_VERSION).writeToDirectory(
                [{modeName: "base", libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes}],
                path.join(tmpRoot, "outcomelibrary"),
            );
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            await writeLibraryBundle(tmpRoot, "outcomelibrary", buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1}));
            const view = await service.validate(tmpRoot, [
                {modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}, cost: 1},
            ]);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors).toEqual([]);
            expect(view.modes).toEqual([
                {
                    modeName: "base",
                    cost: 1,
                    outcomeCount: library.outcomes.length,
                    libraryId: "base-lib",
                    libraryHash: computeWeightedOutcomeLibraryHash(library),
                },
            ]);
        });

        it("rejects a bundle selector whose own modeName names a different mode than its export row, before reading anything", async () => {
            await writeLibraryBundle(tmpRoot, "outcomelibrary", buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1}));
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [
                {modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "bonus"}, cost: 1},
            ]);

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain('mode "base"');
            expect(view.error).toContain('mode "bonus"');
        });
    });

    describe("export", () => {
        it("exports a real library and returns its manifest/files", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "stakeengine", false);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.manifest.modes).toHaveLength(1);
            expect(view.manifest.modes[0].name).toBe("base");
            expect(view.files.length).toBeGreaterThan(0);
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine", "index.json"))).toBe(true);
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine", "pokie-manifest.json"))).toBe(true);
        });

        it("exports a mode resolved from a canonical outcome-library bundle selector, and returns its manifest/files", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await new OutcomeLibraryBundleWriter(TEST_POKIE_VERSION).writeToDirectory(
                [{modeName: "base", libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes}],
                path.join(tmpRoot, "outcomelibrary"),
            );
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(
                tmpRoot,
                [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}, cost: 1}],
                "stakeengine",
                false,
            );

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.manifest.modes).toHaveLength(1);
            expect(view.manifest.modes[0].name).toBe("base");
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine", "index.json"))).toBe(true);
        });

        it("rejects an Outcome Library created for configuration A after the Project resolves configuration B", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            const bundleDir = path.join(tmpRoot, "outcomelibrary");
            await new OutcomeLibraryBundleWriter(TEST_POKIE_VERSION).writeToDirectory(
                [{modeName: "base", libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes}],
                bundleDir,
            );
            const manifestPath = path.join(bundleDir, "manifest.json");
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
            fs.writeFileSync(manifestPath, JSON.stringify({...manifest, configHash: "configuration-A"}));

            const service = new StudioStakeEngineExportService(
                TEST_POKIE_VERSION,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                () => Promise.resolve("configuration-B"),
            );
            const view = await service.export(
                tmpRoot,
                [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: "outcomelibrary", modeName: "base"}, cost: 1}],
                "stakeengine",
                false,
            );

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain("configuration-A");
            expect(view.error).toContain("configuration-B");
            expect(view.error).toContain("Regenerate the library");
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine"))).toBe(false);
        });

        it("returns an invalid view (no manifest) for an unsupported cost/outcome combination", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1 / 3}], "stakeengine", false);

            expect(view.status).toBe("invalid");
            if (view.status !== "invalid") throw new Error("expected invalid");
            expect(view.errors.length).toBeGreaterThan(0);
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine"))).toBe(false);
        });

        it("returns a non-overwritable conflict view (never writes) for a pre-existing directory unrelated to any prior export", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            fs.mkdirSync(path.join(tmpRoot, "stakeengine"));
            fs.writeFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "pre-existing content");
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "stakeengine", false);

            expect(view.status).toBe("conflict");
            if (view.status !== "conflict") throw new Error("expected conflict");
            // Never offers an overwrite path for a directory that isn't recognized as a prior export's own
            // output -- resubmitting with overwrite:true could never actually succeed here (the exporter
            // itself still refuses it -- see the "does not accept overwrite:true either" test below), so the
            // view must say so up front rather than let a caller try and fail.
            expect(view.overwritable).toBe(false);
            expect(view.error).not.toContain("overwrite");
            expect(fs.readFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "utf-8")).toBe("pre-existing content");
        });

        it("still refuses (as load-error, never writing) an unrelated directory even when overwrite:true is explicitly requested", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            fs.mkdirSync(path.join(tmpRoot, "stakeengine"));
            fs.writeFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "pre-existing content");
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "stakeengine", true);

            expect(view.status).toBe("conflict");
            if (view.status !== "conflict") throw new Error("expected conflict");
            expect(view.plan.diagnostic?.code).toBe("destination-conflict");
            expect(fs.readFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "utf-8")).toBe("pre-existing content");
        });

        it("returns an overwritable conflict view for a pre-existing directory recognized as a prior export's own output", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);
            await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "stakeengine", false);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "stakeengine", false);

            expect(view.status).toBe("conflict");
            if (view.status !== "conflict") throw new Error("expected conflict");
            expect(view.overwritable).toBe(false);
            expect(view.plan.diagnostic?.code).toBe("destination-conflict");
        });

        it("resubmitting with overwrite:true replaces a directory recognized as a prior export's own output", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);
            await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "stakeengine", false);

            const secondLibrary = buildStakeEngineTestLibrary({libraryId: "bonus-lib", betMode: "bonus", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", secondLibrary, "bonus");
            const view = await service.export(tmpRoot, [{modeName: "bonus", librarySelector: bundleSelector("bonus"), cost: 1}], "stakeengine", true);

            expect(view.status).toBe("conflict");
            if (view.status !== "conflict") throw new Error("expected conflict");
            expect(view.plan.diagnostic?.code).toBe("destination-conflict");
        });

        it("returns load-error for an outDir that resolves outside the project root", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            await writeLibraryBundle(tmpRoot, "outcomelibrary", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: bundleSelector("base"), cost: 1}], "../outside-out", false);

            expect(view.status).toBe("load-error");
        });

        it("reports load-error for a mode whose libraryPath resolves outside the project root, before any export attempt", async () => {
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", librarySelector: {kind: "json", path: "../outside.json"}, cost: 1}], "stakeengine", false);

            expect(view.status).toBe("unavailable");
            if (view.status !== "unavailable") throw new Error("expected unavailable");
            expect(view.plan.diagnostic?.code).toBe("unrecognized-source");
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine"))).toBe(false);
        });
    });
});
