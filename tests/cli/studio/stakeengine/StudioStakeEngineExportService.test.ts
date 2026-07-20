import {computeWeightedOutcomeLibraryHash, WeightedOutcomeLibrary} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {StudioStakeEngineExportService} from "../../../../cli/studio/stakeengine/StudioStakeEngineExportService.js";
import {buildStakeEngineTestLibrary} from "../../../stakeengine/StakeEngineTestFixtures.js";

const TEST_POKIE_VERSION = "1.3.0";

function writeLibraryFile(projectRoot: string, relativePath: string, library: WeightedOutcomeLibrary<string>): void {
    fs.writeFileSync(path.join(projectRoot, relativePath), JSON.stringify(library));
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
        it("returns a clean diagnostics view with per-mode provenance for a real library", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}]);

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
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1 / 3}]);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.errors.length).toBeGreaterThan(0);
        });

        it("reports load-error for a libraryPath that resolves outside the project root", async () => {
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", libraryPath: "../outside.json", cost: 1}]);

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain('mode "base"');
            expect(view.error).toContain("outside the project root");
        });

        it("reports load-error for a libraryPath that doesn't exist", async () => {
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.validate(tmpRoot, [{modeName: "base", libraryPath: "missing.json", cost: 1}]);

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain('mode "base"');
        });
    });

    describe("export", () => {
        it("exports a real library and returns its manifest/files", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "stakeengine", false);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.manifest.modes).toHaveLength(1);
            expect(view.manifest.modes[0].name).toBe("base");
            expect(view.files.length).toBeGreaterThan(0);
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine", "index.json"))).toBe(true);
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine", "pokie-manifest.json"))).toBe(true);
        });

        it("returns an invalid view (no manifest) for an unsupported cost/outcome combination", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1 / 3}], "stakeengine", false);

            expect(view.status).toBe("invalid");
            if (view.status !== "invalid") throw new Error("expected invalid");
            expect(view.errors.length).toBeGreaterThan(0);
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine"))).toBe(false);
        });

        it("returns a non-overwritable conflict view (never writes) for a pre-existing directory unrelated to any prior export", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            fs.mkdirSync(path.join(tmpRoot, "stakeengine"));
            fs.writeFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "pre-existing content");
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "stakeengine", false);

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
            writeLibraryFile(tmpRoot, "base.json", library);
            fs.mkdirSync(path.join(tmpRoot, "stakeengine"));
            fs.writeFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "pre-existing content");
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "stakeengine", true);

            expect(view.status).toBe("load-error");
            expect(fs.readFileSync(path.join(tmpRoot, "stakeengine", "unrelated.txt"), "utf-8")).toBe("pre-existing content");
        });

        it("returns an overwritable conflict view for a pre-existing directory recognized as a prior export's own output", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);
            await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "stakeengine", false);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "stakeengine", false);

            expect(view.status).toBe("conflict");
            if (view.status !== "conflict") throw new Error("expected conflict");
            expect(view.overwritable).toBe(true);
            expect(view.error).toContain("overwrite");
        });

        it("resubmitting with overwrite:true replaces a directory recognized as a prior export's own output", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);
            await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "stakeengine", false);

            const secondLibrary = buildStakeEngineTestLibrary({libraryId: "bonus-lib", betMode: "bonus", stake: 1});
            writeLibraryFile(tmpRoot, "bonus.json", secondLibrary);
            const view = await service.export(tmpRoot, [{modeName: "bonus", libraryPath: "bonus.json", cost: 1}], "stakeengine", true);

            expect(view.status).toBe("ok");
            if (view.status !== "ok") throw new Error("expected ok");
            expect(view.manifest.modes.map((mode) => mode.name)).toEqual(["bonus"]);
        });

        it("returns load-error for an outDir that resolves outside the project root", async () => {
            const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
            writeLibraryFile(tmpRoot, "base.json", library);
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "base.json", cost: 1}], "../outside-out", false);

            expect(view.status).toBe("load-error");
        });

        it("reports load-error for a mode whose libraryPath resolves outside the project root, before any export attempt", async () => {
            const service = new StudioStakeEngineExportService(TEST_POKIE_VERSION);

            const view = await service.export(tmpRoot, [{modeName: "base", libraryPath: "../outside.json", cost: 1}], "stakeengine", false);

            expect(view.status).toBe("load-error");
            if (view.status !== "load-error") throw new Error("expected load-error");
            expect(view.error).toContain('mode "base"');
            expect(fs.existsSync(path.join(tmpRoot, "stakeengine"))).toBe(false);
        });
    });
});
