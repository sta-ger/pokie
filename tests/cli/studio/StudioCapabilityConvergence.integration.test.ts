import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT, writeDescriptorPackage} from "../../v2/fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {ParSheetImporter} from "../../../src/parsheet/ParSheetImporter.js";
import {ParSheetExporter} from "../../../src/parsheet/ParSheetExporter.js";

describe("Studio capability convergence (integration)", () => {
    let workDir: string;

    let restoreTemporaryDirectory: () => void;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-capability-convergence-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("keeps PAR exchange and planner-owned artifact materialization isolated by project output", async () => {
        const service = new StudioArtifactBuildService("1.3.0");
        const sourceA = path.join(workDir, "a.par.xlsx");
        const sourceB = path.join(workDir, "b.par.xlsx");
        const blueprintA = {manifest: {id: "a", name: "A", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1]};
        const blueprintB = {manifest: {id: "b", name: "B", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["C", "D"], paytable: {C: {2: 2}}, reelStrips: [["C", "D"], ["C", "D"]], availableBets: [1]};
        const exporter = new ParSheetExporter("1.3.0");
        await exporter.exportToFile(blueprintA, sourceA, sourceA);
        await exporter.exportToFile(blueprintB, sourceB, sourceB);

        const outputA = path.join(workDir, "a", "imported.blueprint.json");
        const outputB = path.join(workDir, "b", "imported.blueprint.json");
        fs.mkdirSync(path.dirname(outputA), {recursive: true});
        fs.mkdirSync(path.dirname(outputB), {recursive: true});
        await expect(service.build(sourceA, "blueprint", outputA)).resolves.toMatchObject({status: "ok", outputPath: outputA, sourceType: "parWorkbook"});
        await expect(service.build(sourceB, "blueprint", outputB)).resolves.toMatchObject({status: "ok", outputPath: outputB, sourceType: "parWorkbook"});

        expect(JSON.parse(fs.readFileSync(outputA, "utf-8"))).toMatchObject({manifest: blueprintA.manifest});
        expect(JSON.parse(fs.readFileSync(outputB, "utf-8"))).toMatchObject({manifest: blueprintB.manifest});
    });

    it("keeps every shared build target aligned across CLI and Studio, including prerequisite diagnostics and recovery", async () => {
        const sourcePath = path.join(workDir, "shared-capability.blueprint.json");
        const blueprint = {
            manifest: {id: "shared-capability", name: "Shared Capability", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 2}},
            reelStrips: [["A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        fs.writeFileSync(sourcePath, JSON.stringify(blueprint));

        const service = new StudioArtifactBuildService("1.3.0");
        const targets = ["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"] as const;
        const outputFor = (surface: "cli" | "studio", target: typeof targets[number]): string =>
            path.join(workDir, surface, target === "parWorkbook" ? `${target}.xlsx` : target);

        for (const target of targets) {
            const cliOutput = outputFor("cli", target);
            const studioOutput = outputFor("studio", target);
            fs.mkdirSync(path.dirname(cliOutput), {recursive: true});
            fs.mkdirSync(path.dirname(studioOutput), {recursive: true});

            expect(await new BuildCommand("1.3.0").run([sourcePath, "--target", target, "--out", cliOutput])).toBe(0);
            expect(fs.existsSync(cliOutput)).toBe(true);

            // Preview is the Studio prerequisite boundary; it must identify
            // the same source/target capability before Build publishes.
            await expect(service.preview(sourcePath, target, studioOutput)).resolves.toMatchObject({
                status: "ok", target, destination: studioOutput, sourceType: "blueprint",
            });
            await expect(service.build(sourcePath, target, studioOutput)).resolves.toMatchObject({
                status: "ok", target, outputPath: studioOutput, sourceType: "blueprint",
            });
            expect(fs.existsSync(studioOutput)).toBe(true);
        }

        // A target capability is not parity merely because both writers can
        // succeed.  The Studio preflight must preserve a caller-owned
        // destination, return its concrete conflict, and allow a corrected
        // destination to complete the same shared Outcome Library operation.
        const occupiedOutput = path.join(workDir, "occupied-outcomes");
        fs.mkdirSync(occupiedOutput);
        const borrowedFile = path.join(occupiedOutput, "caller-owned.txt");
        fs.writeFileSync(borrowedFile, "do not overwrite");
        await expect(service.preview(sourcePath, "outcomeLibrary", occupiedOutput)).resolves.toMatchObject({
            status: "conflict", target: "outcomeLibrary", destination: occupiedOutput,
        });
        await expect(service.build(sourcePath, "outcomeLibrary", occupiedOutput)).resolves.toMatchObject({
            status: "conflict", target: "outcomeLibrary",
        });
        expect(fs.readFileSync(borrowedFile, "utf-8")).toBe("do not overwrite");

        const recoveredOutput = path.join(workDir, "recovered-outcomes");
        await expect(service.build(sourcePath, "outcomeLibrary", recoveredOutput)).resolves.toMatchObject({
            status: "ok", target: "outcomeLibrary", outputPath: recoveredOutput,
        });
        expect(JSON.parse(fs.readFileSync(path.join(recoveredOutput, "manifest.json"), "utf-8"))).toMatchObject({
            game: {id: blueprint.manifest.id},
        });

        // A complete public package descriptor now supports PAR through the shared
        // package -> Blueprint extraction edge. Both callers must retain that path.
        const packagePath = outputFor("cli", "tsPackage");
        const packageBytes = fs.readFileSync(path.join(packagePath, "dist", "index.js"));
        const cliWorkbook = path.join(workDir, "package-cli.xlsx");
        const studioWorkbook = path.join(workDir, "package-studio.xlsx");
        expect(await new BuildCommand("1.3.0").run([
            packagePath, "--target", "parWorkbook", "--out", cliWorkbook,
        ])).toBe(0);
        await expect(service.build(packagePath, "parWorkbook", studioWorkbook)).resolves.toMatchObject({
            status: "ok", target: "parWorkbook", outputPath: studioWorkbook,
            plan: {packageExtraction: {status: "complete"}},
        });
        for (const workbook of [cliWorkbook, studioWorkbook]) {
            const imported = await new ParSheetImporter().importFromFile(workbook);
            expect(imported.blueprint).toMatchObject(blueprint);
            expect(imported.issues.filter(issue => issue.severity === "error")).toEqual([]);
        }
        expect(fs.readFileSync(path.join(packagePath, "dist", "index.js"))).toEqual(packageBytes);

        // A legacy executable without a public descriptor remains unavailable;
        // no fallback may infer a model merely because the package can execute.
        const legacyPath = writeDescriptorPackage(workDir, {legacy: true});
        const unavailable = path.join(workDir, "unavailable.xlsx");
        await expect(new BuildCommand("1.3.0").run([
            legacyPath, "--target", "parWorkbook", "--out", unavailable,
        ])).rejects.toThrow(/extraction|descriptor/i);
        await expect(service.build(legacyPath, "parWorkbook", unavailable)).resolves.toMatchObject({
            status: "unsupported", target: "parWorkbook",
            message: expect.stringContaining("Package extraction partial:"),
            plan: {status: "unavailable", packageExtraction: {status: "partial", source: {kind: "legacy"}, diagnostics: expect.arrayContaining([expect.objectContaining({code: "legacy-model-unavailable"})])}},
        });
        expect(fs.existsSync(unavailable)).toBe(false);
    }, 3 * PACKAGE_EXTRACTION_TEST_TIMEOUT);
});
