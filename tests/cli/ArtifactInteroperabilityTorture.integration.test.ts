import fs from "fs";
import {EventEmitter} from "events";
import os from "os";
import path from "path";
import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanner,
    BUILD_PRODUCT_MATRIX_TARGETS,
    computeBlueprintHash,
    describeUnavailableArtifactOperation,
    POKIE_WASM_CONTRACT_VERSION,
    type GameBlueprint,
    ProjectTargetResolver,
} from "pokie";
import {CertificationCommand} from "../../cli/commands/CertificationCommand.js";
import {DiffCommand} from "../../cli/commands/DiffCommand.js";
import {FairnessCommand} from "../../cli/commands/FairnessCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {ImportCommand} from "../../cli/commands/ImportCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "../../cli/commands/OutcomeSourceCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {ArtifactInteroperabilityRun, installPc14FixedRunnerClock} from "../support/ArtifactInteroperabilityRun.js";

const POKIE_VERSION = "1.3.0";

describe("PC-14 CLI real-artifact interoperability torture", () => {
    let workDir: string;
    let restoreRunnerClock: () => void;

    beforeEach(() => {
        restoreRunnerClock = installPc14FixedRunnerClock();
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-torture-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        restoreRunnerClock();
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("chains generated PAR, package, Outcome Library and Stake artifacts without replacing provenance", async () => {
        const blueprint: GameBlueprint = {
            manifest: {id: "artifact-torture", name: "Artifact Torture", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 3}},
            reelStrips: [["A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const workbookPath = path.join(workDir, "source.par.xlsx");
        const importedBlueprintPath = path.join(workDir, "imported.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        expect(await new ParCommand(POKIE_VERSION).run(["export", blueprintPath, "--out", workbookPath])).toBe(0);
        expect(await new ParCommand(POKIE_VERSION).run(["import", workbookPath, "--out", importedBlueprintPath])).toBe(0);
        const parEvidence = JSON.parse(fs.readFileSync(`${importedBlueprintPath}.conversion-evidence.json`, "utf-8"));
        expect(parEvidence).toMatchObject({
            provenance: {blueprintHash: computeBlueprintHash(blueprint)},
            importedBlueprintHash: computeBlueprintHash(blueprint),
            provenanceHashMatches: true,
            losslessEligible: true,
        });

        const resolver = new ProjectTargetResolver();
        const registry = new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd());
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, resolver, registry);
        const packagePath = path.join(workDir, "package");
        const libraryPath = path.join(workDir, "library");
        const stakePath = path.join(workDir, "stake");
        const importedLibraryPath = path.join(workDir, "imported-library");
        const reexportedStakePath = path.join(workDir, "stake-reexported");

        expect(await build.run([importedBlueprintPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        expect(await build.run([packagePath, "--target", "outcomeLibrary", "--out", libraryPath])).toBe(0);
        expect(await build.run([libraryPath, "--target", "stakeAdapter", "--out", stakePath])).toBe(0);
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["import", stakePath, "--out", importedLibraryPath])).toBe(0);
        // Exercise the Stake public re-export owner itself. Building from the
        // imported library proves registry conversion, but it cannot stand in
        // for the config-driven `stakeengine export` boundary users receive
        // after an import.
        const importedConfigPath = path.join(importedLibraryPath, "config.json");
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["export", importedConfigPath, "--out", reexportedStakePath])).toBe(0);

        const sourceManifest = JSON.parse(fs.readFileSync(path.join(libraryPath, "manifest.json"), "utf-8"));
        const importedManifest = JSON.parse(fs.readFileSync(path.join(importedLibraryPath, "manifest.json"), "utf-8"));
        const stakeManifest = JSON.parse(fs.readFileSync(path.join(stakePath, "pokie-manifest.json"), "utf-8"));
        const reexportedStakeManifest = JSON.parse(fs.readFileSync(path.join(reexportedStakePath, "pokie-manifest.json"), "utf-8"));
        const sourceProvenance = JSON.parse(fs.readFileSync(path.join(importedLibraryPath, "source-provenance.json"), "utf-8"));
        expect(importedManifest).toMatchObject({
            game: sourceManifest.game,
            configHash: sourceManifest.configHash,
            pokieVersion: sourceManifest.pokieVersion,
        });
        expect(stakeManifest.modes).toEqual(expect.arrayContaining([
            expect.objectContaining({name: "base", generator: sourceManifest.modes[0].generator}),
        ]));
        expect(importedManifest.modes).toEqual(expect.arrayContaining([
            expect.objectContaining({modeName: "base", generator: sourceManifest.modes[0].generator}),
        ]));
        expect(reexportedStakeManifest.modes).toEqual(expect.arrayContaining([
            expect.objectContaining({name: "base", generator: sourceManifest.modes[0].generator}),
        ]));
        expect(sourceProvenance).toMatchObject({
            manifestHash: expect.stringMatching(/^sha256:/),
            indexHash: expect.stringMatching(/^sha256:/),
            modes: [{modeName: "base", csvHash: expect.stringMatching(/^sha256:/), booksHash: expect.stringMatching(/^sha256:/)}],
        });
        expect(stakeManifest).toMatchObject({game: sourceManifest.game, configHash: sourceManifest.configHash, pokieVersion: sourceManifest.pokieVersion});
        expect(fs.existsSync(path.join(reexportedStakePath, "pokie-manifest.json"))).toBe(true);
    });

    it("executes the provenance, drift, recovery and diagnostic matrix from public artifacts", async () => {
        const evidence = new ArtifactInteroperabilityRun(workDir);
        const blueprint: GameBlueprint = {
            manifest: {id: "matrix-slot", name: "Matrix Slot", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 3}},
            reelStrips: [["A", "A", "B"], ["A", "B"]],
        };
        const blueprintPath = path.join(workDir, "matrix.blueprint.json");
        const workbookPath = path.join(workDir, "matrix.par.xlsx");
        const importedBlueprintPath = path.join(workDir, "matrix-imported.blueprint.json");
        const packagePath = path.join(workDir, "matrix-package");
        const rawLibraryPath = path.join(workDir, "matrix-library.json");
        const descriptorPath = path.join(workDir, "matrix-bundle.json");
        const bundlePath = path.join(workDir, "matrix-bundle");
        const generatedBundlePath = path.join(workDir, "matrix-generated-bundle");
        const stakePath = path.join(workDir, "matrix-stake");
        const stakeDescriptorPath = path.join(workDir, "matrix-stake-export.json");
        const stakeAnalysisPath = path.join(workDir, "matrix-stake-analysis.json");
        const stakeComparisonPath = path.join(workDir, "matrix-stake-comparison.json");
        const importedStakeLibraryPath = path.join(workDir, "matrix-stake-imported-library");
        const reexportedStakePath = path.join(workDir, "matrix-stake-reexported");
        const simulationPath = path.join(workDir, "matrix-simulation.json");
        const comparisonSimulationPath = path.join(workDir, "matrix-comparison-simulation.json");
        const packageSimulationPath = path.join(workDir, "matrix-package-simulation.json");
        const packageComparisonSimulationPath = path.join(workDir, "matrix-package-comparison-simulation.json");
        const simulationDiffPath = path.join(workDir, "matrix-simulation-diff.json");
        const outcomeDiffPath = path.join(workDir, "matrix-outcome-diff.json");
        const renderedReportPath = path.join(workDir, "matrix-rendered-report.html");
        const replayPath = path.join(workDir, "matrix-replay.json");
        const packageReplayPath = path.join(workDir, "matrix-package-replay.json");
        const certificationConfigPath = path.join(workDir, "matrix-certification.json");
        const certificationPath = path.join(workDir, "matrix-certification");
        const seedPath = path.join(workDir, "matrix-server-seed.txt");
        const seedCommitmentPath = path.join(workDir, "matrix-seed-commitment.json");
        const commitmentPath = path.join(workDir, "matrix-commitment.json");
        const proofPath = path.join(workDir, "matrix-proof.json");
        const validationPath = path.join(workDir, "matrix-validation.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        // The workbook and imported Blueprint are both real public artifacts.
        // Keep them in the same emitted run as the package chain so the PAR
        // cells are not inferred from a separate unit fixture.
        expect(await new ParCommand(POKIE_VERSION).run(["export", blueprintPath, "--out", workbookPath])).toBe(0);
        evidence.record({
            id: "blueprint-export-par", artifactKind: "blueprint", operation: "export", sourcePath: blueprintPath,
            producedPath: workbookPath, owner: "ParCommand", result: "published",
            observations: [{surface: "cli", owner: "ParCommand", result: "export exit 0"}],
        });
        expect(await new ParCommand(POKIE_VERSION).run(["import", workbookPath, "--out", importedBlueprintPath])).toBe(0);
        const parConversion = JSON.parse(fs.readFileSync(`${importedBlueprintPath}.conversion-evidence.json`, "utf-8"));
        expect(parConversion).toMatchObject({
            provenance: {blueprintHash: computeBlueprintHash(blueprint)},
            importedBlueprintHash: computeBlueprintHash(blueprint),
            provenanceHashMatches: true,
            losslessEligible: true,
        });
        evidence.record({
            id: "par-import-blueprint", artifactKind: "parWorkbook", operation: "import", sourcePath: workbookPath,
            producedPath: importedBlueprintPath, owner: "ParCommand", result: "lossless Blueprint published",
            observations: [{surface: "cli", owner: "ParCommand", result: "import exit 0 with matching provenance hash"}],
        });

        const resolver = new ProjectTargetResolver();
        const registry = new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd());
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, resolver, registry);
        expect(await build.run([blueprintPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        evidence.record({
            id: "blueprint-build-package", artifactKind: "blueprint", operation: "build", sourcePath: blueprintPath,
            producedPath: packagePath, owner: "BuildCommand", result: "published",
            observations: [{surface: "cli", owner: "BuildCommand", result: "exit 0"}],
        });
        const sourceProject = await resolver.resolve(importedBlueprintPath);
        if (sourceProject === undefined) throw new Error("Expected the imported Blueprint to resolve for the direct-library preflight.");
        const directPlan = await registry.preparePlan(sourceProject, "tsPackage", {destinationPath: path.join(workDir, "direct-library-package")});
        expect(directPlan.status).toBe("planned");
        evidence.record({
            id: "blueprint-plan-package", artifactKind: "blueprint", operation: "build-preflight", sourcePath: importedBlueprintPath,
            owner: "ArtifactBuilderRegistry.preparePlan", result: "planned for a fresh package destination",
            observations: [{surface: "library", owner: "ArtifactBuilderRegistry.preparePlan", result: "planned"}],
        });
        expect(await new OutcomeLibraryCommand(POKIE_VERSION).run([
            "generate", packagePath, "--sample", "8", "--seed", "matrix-generation", "--out", rawLibraryPath, "--format", "json",
        ])).toBe(0);
        evidence.record({
            id: "package-generate-raw-outcomes", artifactKind: "tsPackage", operation: "generate", sourcePath: packagePath,
            producedPath: rawLibraryPath, owner: "OutcomeLibraryCommand", result: "published",
            observations: [{surface: "cli", owner: "OutcomeLibraryCommand", result: "exit 0"}],
        });
        fs.writeFileSync(descriptorPath, JSON.stringify({modes: [{modeName: "base", libraryPath: path.basename(rawLibraryPath)}]}));
        expect(await new OutcomeLibraryCommand(POKIE_VERSION).run(["build", descriptorPath, "--out", bundlePath])).toBe(0);
        evidence.record({
            id: "raw-outcomes-build-bundle", artifactKind: "weightedOutcomeLibraryJson", operation: "build", sourcePath: rawLibraryPath,
            producedPath: bundlePath, owner: "OutcomeLibraryCommand", result: "published",
            observations: [{surface: "cli", owner: "OutcomeLibraryCommand", result: "exit 0"}],
        });
        evidence.record({
            id: "outcome-library-bundle-descriptor-build", artifactKind: "outcomeLibraryBundleDescriptor", operation: "build", sourcePath: descriptorPath,
            producedPath: bundlePath, owner: "OutcomeLibraryCommand", result: "descriptor consumed by the published bundle",
            observations: [{surface: "cli", owner: "OutcomeLibraryCommand", result: "build exit 0 consumed the descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        // These are durable companion files emitted by the public bundle
        // writer.  Record their actual paths separately: validating the
        // parent bundle is not evidence that the companions are merely
        // theoretical registry entries.
        const bundleManifest = JSON.parse(fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf-8")) as {
            modes: {outcomesFile: string; indexFile: string}[];
        };
        const bundleMode = bundleManifest.modes[0];
        expect(bundleMode).toBeDefined();
        evidence.record({
            id: "bundle-canonical-outcomes", artifactKind: "canonicalOutcomeJsonl", operation: "validate", sourcePath: path.join(bundlePath, bundleMode.outcomesFile),
            owner: "OutcomeLibraryCommand / OutcomeLibraryBundleWriter", result: "published as the bundle's canonical outcome stream",
            observations: [{surface: "cli", owner: "OutcomeLibraryCommand", result: "build exit 0 wrote the referenced canonical JSONL"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        // The raw-output bundle above deliberately has no generator
        // diagnostics. Produce the Stake round trip from the public package
        // conversion instead, whose writer persists the exact generation
        // strategy and policy selected for the real artifact.
        expect(await build.run([packagePath, "--target", "outcomeLibrary", "--out", generatedBundlePath])).toBe(0);
        const generatedBundleManifest = JSON.parse(fs.readFileSync(path.join(generatedBundlePath, "manifest.json"), "utf-8"));
        expect(generatedBundleManifest.modes).toEqual(expect.arrayContaining([
            expect.objectContaining({generator: expect.objectContaining({strategy: expect.any(String)})}),
        ]));
        expect(await build.run([generatedBundlePath, "--target", "stakeAdapter", "--out", stakePath])).toBe(0);
        evidence.record({
            id: "outcome-library-export-stake", artifactKind: "outcomeLibrary", operation: "export", sourcePath: generatedBundlePath,
            producedPath: stakePath, owner: "BuildCommand / ArtifactBuilderRegistry", result: "Stake Engine export published",
            observations: [
                {surface: "cli", owner: "BuildCommand", result: "exit 0"},
                {surface: "library", owner: "ArtifactBuilderRegistry", result: "executed registry conversion"},
            ],
        });
        fs.writeFileSync(stakeDescriptorPath, JSON.stringify({modes: [{modeName: "base", cost: 1, bundleDir: path.basename(bundlePath), bundleModeName: "base"}]}));
        let stakeExportDiagnostic = "";
        (console.error as jest.Mock).mockImplementation((message: unknown) => {
            stakeExportDiagnostic += `${String(message)}\n`;
        });
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["export", stakeDescriptorPath, "--out", path.join(workDir, "matrix-descriptor-stake")])).toBe(1);
        expect(stakeExportDiagnostic).toMatch(/integer|canonical|id/i);
        (console.error as jest.Mock).mockImplementation(() => undefined);
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["analyze", stakePath, "--format", "json", "--out", stakeAnalysisPath])).toBe(0);
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["diff", stakePath, stakePath, "--format", "json", "--out", stakeComparisonPath])).toBe(0);
        evidence.recordUnavailable({
            id: "stake-export-descriptor", artifactKind: "stakeEngineExportDescriptor", operation: "export", sourcePath: stakeDescriptorPath,
            owner: "StakeEngineCommand", diagnostic: {
                code: "unsupported-project-operation",
                message: stakeExportDiagnostic.trim(),
                recovery: "Assign canonical integer outcome IDs in the Stake export descriptor or export the generated Outcome Library through the supported stakeAdapter build target.",
            },
            observations: [{surface: "cli", owner: "StakeEngineCommand", result: "stakeengine export exit 1 retained the concrete canonical-ID diagnostic"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "stake-engine-analysis-report", artifactKind: "stakeEngineAnalysisReport", operation: "analyze", sourcePath: stakeAnalysisPath,
            owner: "StakeEngineCommand", result: "analysis report published from the generated Stake adapter",
            observations: [{surface: "cli", owner: "StakeEngineCommand", result: "stakeengine analyze --out exit 0"}],
        });
        evidence.record({
            id: "stake-engine-comparison-report", artifactKind: "stakeEngineComparisonReport", operation: "diff", sourcePath: stakeComparisonPath,
            owner: "StakeEngineCommand", result: "comparison report published from two real Stake exports",
            observations: [{surface: "cli", owner: "StakeEngineCommand", result: "stakeengine diff --out exit 0"}],
        });
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["import", stakePath, "--out", importedStakeLibraryPath])).toBe(0);
        const stakeManifest = JSON.parse(fs.readFileSync(path.join(stakePath, "pokie-manifest.json"), "utf-8"));
        const importedStakeManifest = JSON.parse(fs.readFileSync(path.join(importedStakeLibraryPath, "manifest.json"), "utf-8"));
        expect(importedStakeManifest).toMatchObject({
            game: stakeManifest.game,
            configHash: stakeManifest.configHash,
            pokieVersion: stakeManifest.pokieVersion,
        });
        evidence.record({
            id: "stake-import-outcome-library", artifactKind: "stakeAdapter", operation: "import", sourcePath: stakePath,
            producedPath: importedStakeLibraryPath, owner: "StakeEngineCommand", result: "Outcome Library published with matching Stake provenance",
            observations: [{surface: "cli", owner: "StakeEngineCommand", result: "import exit 0 with matching game/config/version"}],
        });
        const importConfigPath = path.join(importedStakeLibraryPath, "config.json");
        const importProvenancePath = path.join(importedStakeLibraryPath, "source-provenance.json");
        expect(fs.existsSync(importConfigPath)).toBe(true);
        expect(fs.existsSync(importProvenancePath)).toBe(true);
        evidence.record({
            id: "stake-import-reexport-config", artifactKind: "stakeImportReExportConfig", operation: "export", sourcePath: importConfigPath,
            owner: "StakeEngineCommand", result: "public import emitted a re-exportable Stake configuration",
            observations: [{surface: "cli", owner: "StakeEngineCommand", result: "import exit 0 wrote config.json"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "stake-import-source-provenance", artifactKind: "stakeImportSourceProvenance", operation: "inspect", sourcePath: importProvenancePath,
            owner: "StakeEngineCommand", result: "public import retained source manifest, index, and mode provenance",
            observations: [{surface: "cli", owner: "StakeEngineCommand", result: "import exit 0 wrote source-provenance.json"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        // A re-exportable import configuration is not itself a round trip.
        // Exercise the config-driven public Stake owner, rather than the
        // generic build alias, so the artifact ledger proves the same
        // re-export boundary users receive after `stakeengine import`.
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["export", importConfigPath, "--out", reexportedStakePath])).toBe(0);
        const reexportedStakeManifest = JSON.parse(fs.readFileSync(path.join(reexportedStakePath, "pokie-manifest.json"), "utf-8"));
        const importedSourceProvenance = JSON.parse(fs.readFileSync(importProvenancePath, "utf-8"));
        expect(reexportedStakeManifest).toMatchObject({
            game: stakeManifest.game,
            configHash: stakeManifest.configHash,
            pokieVersion: stakeManifest.pokieVersion,
            modes: stakeManifest.modes.map((mode: {name: string; libraryId: string; generator: unknown}) => expect.objectContaining({
                name: mode.name,
                libraryId: mode.libraryId,
                generator: mode.generator,
            })),
        });
        expect(importedSourceProvenance).toMatchObject({
            manifestHash: expect.stringMatching(/^sha256:/),
            indexHash: expect.stringMatching(/^sha256:/),
            modes: expect.arrayContaining([expect.objectContaining({modeName: "base", csvHash: expect.stringMatching(/^sha256:/), booksHash: expect.stringMatching(/^sha256:/)})]),
        });
        evidence.record({
            id: "stake-import-reexport-stake", artifactKind: "stakeImportReExportConfig", operation: "re-export", sourcePath: importConfigPath,
            producedPath: reexportedStakePath, owner: "StakeEngineCommand", result: "public Stake re-export retained game identity, configuration hash, POKIE version, generation semantics, and imported source provenance",
            observations: [
                {surface: "cli", owner: "StakeEngineCommand", result: "stakeengine export imported config.json exit 0"},
                {surface: "library", owner: "StakeEngineCommand", result: "re-exported Stake manifest retained the original generation semantics"},
                {surface: "library", owner: "StakeEngineCommand", result: "imported source-provenance manifest/index/mode hashes remained available to the public re-export path"},
            ],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        evidence.recordScenario({
            id: "stake-outcome-library-round-trip", sourcePath: generatedBundlePath, producedPath: reexportedStakePath,
            result: "Outcome Library to Stake export, public import, and public re-export retain game identity, configuration hash, POKIE version, generation semantics, and source provenance",
            surface: "cli", owner: "StakeEngineCommand",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["imported library manifest matches the exported Stake manifest identity", "re-exported Stake manifest preserves each imported generation descriptor", "imported source provenance retains manifest, index, and mode hashes through the re-export boundary"],
            observations: [{route: "pokie build --target stakeAdapter / pokie stakeengine import / pokie stakeengine export", result: "complete public round trip completed with matching identity, generation, and source provenance"}],
        });
        // A pre-existing interrupted import destination is externally owned:
        // the public import must reject it without deleting its bytes.  Once
        // that partial state is explicitly removed, the same real Stake
        // export can be imported cleanly through the generic dispatcher.
        const partialImportPath = path.join(workDir, "matrix-partial-import");
        fs.mkdirSync(partialImportPath);
        fs.writeFileSync(path.join(partialImportPath, "partial.json"), "caller-owned partial import");
        const genericImport = new ImportCommand(POKIE_VERSION);
        await expect(genericImport.run([stakePath, "--out", partialImportPath])).rejects.toThrow(/destination|exist|occupied|stale/i);
        expect(fs.readFileSync(path.join(partialImportPath, "partial.json"), "utf-8")).toBe("caller-owned partial import");
        fs.rmSync(partialImportPath, {recursive: true});
        expect(await genericImport.run([stakePath, "--out", partialImportPath])).toBe(0);
        expect(fs.existsSync(path.join(partialImportPath, "manifest.json"))).toBe(true);
        evidence.recordScenario({
            id: "partial-import-recovery", sourcePath: stakePath, producedPath: partialImportPath,
            result: "generic public import preserves a caller-owned partial destination on rejection, then recovers by importing the same real Stake export after the partial state is removed",
            surface: "cli", owner: "ImportCommand / StakeEngineCommand.runPreparedImport",
            systemicClasses: ["durable-publication-ownership", "provenance-and-freshness-binding"],
            assertions: ["occupied partial destination is rejected without deletion", "fresh retry publishes the imported Outcome Library"],
            observations: [{route: "pokie import", result: "public dispatcher rejected partial state then completed a clean retry"}],
        });
        expect(await new OutcomeSourceCommand().run(["sample", bundlePath, "--mode", "base", "--seed", "matrix-sample"])).toBe(0);
        evidence.record({
            id: "outcome-library-sample", artifactKind: "outcomeLibrary", operation: "sample", sourcePath: bundlePath,
            owner: "OutcomeSourceCommand", result: "sampled", observations: [{surface: "cli", owner: "OutcomeSourceCommand", result: "exit 0"}],
        });
        await new SimCommand().run([bundlePath, "--mode", "base", "--rounds", "4", "--seed", "matrix-sim", "--out", simulationPath]);
        await new SimCommand().run([bundlePath, "--mode", "base", "--rounds", "5", "--seed", "matrix-sim-comparison", "--out", comparisonSimulationPath]);
        await new SimCommand().run([packagePath, "--rounds", "4", "--seed", "matrix-package-sim", "--out", packageSimulationPath]);
        await new SimCommand().run([packagePath, "--rounds", "5", "--seed", "matrix-package-sim-comparison", "--out", packageComparisonSimulationPath]);
        await expect(new SimCommand().run([packagePath, "--mode", "all", "--rounds", "2", "--seed", "matrix-all-modes"])).rejects.toThrow(/requires the game package to declare its bet modes via getBetModes/);
        await new ReplayCommand().run([bundlePath, "--mode", "base", "--round", "1", "--seed", "matrix-replay", "--out", replayPath]);
        expect(fs.existsSync(simulationPath)).toBe(true);
        expect(fs.existsSync(comparisonSimulationPath)).toBe(true);
        expect(fs.existsSync(packageSimulationPath)).toBe(true);
        expect(fs.existsSync(packageComparisonSimulationPath)).toBe(true);
        expect(fs.existsSync(replayPath)).toBe(true);
        const provenanceBundleManifest = JSON.parse(fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf-8")) as {
            game: {id: string; version: string}; modes: {libraryId: string; libraryHash: string}[];
        };
        const simulation = JSON.parse(fs.readFileSync(simulationPath, "utf-8")) as {
            libraryId: string; libraryHash: string; lastReplay: {game: {id: string; version: string}; libraryId: string; libraryHash: string};
        };
        const replay = JSON.parse(fs.readFileSync(replayPath, "utf-8")) as {
            game: {id: string; version: string}; outcomeSource: {libraryId: string; libraryHash: string; selectionAlgorithm: string};
        };
        const sourceMode = provenanceBundleManifest.modes[0];
        // These are the same source binding, not merely artifacts which happen
        // to be generated in one temporary directory.  A seeded outcome-source
        // replay is portable and exact because it records the library hash;
        // package replay remains a separately documented best-effort path.
        expect(simulation).toMatchObject({libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, lastReplay: {
            game: provenanceBundleManifest.game, libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash,
        }});
        expect(replay).toMatchObject({game: provenanceBundleManifest.game, outcomeSource: {
            libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, selectionAlgorithm: "derived-round-seed-v1",
        }});
        // Keep the other public replay class in the same execution record.
        // A generated package can record a useful round artifact, but it has
        // no immutable Outcome Library identity and must never be advertised
        // as the portable/exact outcome-source replay above.
        await new ReplayCommand().run([packagePath, "--round", "1", "--out", packageReplayPath]);
        const packageReplay = JSON.parse(fs.readFileSync(packageReplayPath, "utf-8")) as {outcomeSource?: unknown};
        expect(packageReplay.outcomeSource).toBeUndefined();

        // Keep an operation-level record produced by the public owners.  This
        // is intentionally written only after each command has completed: it
        // prevents the PC-14 evidence runner from treating a planned command
        // or a hand-authored fixture as an observed artifact operation.
        const reportPath = path.join(workDir, "matrix-report.md");
        expect(await new ValidateCommand().run([blueprintPath, "--format", "json", "--out", validationPath])).toBe(0);
        evidence.record({
            id: "blueprint-validate", artifactKind: "blueprint", operation: "validate", sourcePath: blueprintPath,
            owner: "ValidateCommand", result: "valid", observations: [{surface: "cli", owner: "ValidateCommand", result: "exit 0"}],
        });
        evidence.record({
            id: "blueprint-validation-report", artifactKind: "validationReport", operation: "inspect", sourcePath: validationPath,
            owner: "ValidateCommand", result: "published JSON validation report",
            observations: [{surface: "cli", owner: "ValidateCommand", result: "validate --out exit 0 wrote the report"}],
        });
        expect(await new ValidateCommand().run([bundlePath, "--deep", "--format", "json"])).toBe(0);
        evidence.record({
            id: "outcome-library-validate", artifactKind: "outcomeLibrary", operation: "validate", sourcePath: bundlePath,
            owner: "ValidateCommand", result: "valid", observations: [{surface: "cli", owner: "ValidateCommand", result: "exit 0"}],
        });
        expect(await new InspectCommand().run([bundlePath])).toBe(0);
        evidence.record({
            id: "outcome-library-inspect", artifactKind: "outcomeLibrary", operation: "inspect", sourcePath: bundlePath,
            owner: "InspectCommand", result: "recognized", observations: [{surface: "cli", owner: "InspectCommand", result: "exit 0"}],
        });
        await new ReportCommand().run([bundlePath, "--format", "markdown", "--out", reportPath]);
        await new ReportCommand().run([packageSimulationPath, "--format", "html", "--out", renderedReportPath]);
        await new DiffCommand().run([packageSimulationPath, packageComparisonSimulationPath, "--out", simulationDiffPath]);
        await new DiffCommand().run([bundlePath, importedStakeLibraryPath, "--format", "json", "--out", outcomeDiffPath]);
        expect(fs.existsSync(renderedReportPath)).toBe(true);
        expect(fs.existsSync(simulationDiffPath)).toBe(true);
        expect(fs.existsSync(outcomeDiffPath)).toBe(true);
        const operationObservationPath = path.join(workDir, "pc-14-operation-observations.json");
        const operationObservations = [
            {id: "blueprint:validate", sourcePath: blueprintPath, producedPath: null, owner: "ValidateCommand", result: "valid"},
            {id: "outcomeLibrary:validate", sourcePath: bundlePath, producedPath: null, owner: "ValidateCommand", result: "valid"},
            {id: "outcomeLibrary:inspect", sourcePath: bundlePath, producedPath: null, owner: "InspectCommand", result: "recognized"},
            {id: "outcomeLibrary:report", sourcePath: bundlePath, producedPath: reportPath, owner: "ReportCommand", result: "published"},
            {id: "outcomeLibrary:simulate", sourcePath: bundlePath, producedPath: simulationPath, owner: "SimCommand", result: "published"},
            {id: "outcomeLibrary:replay", sourcePath: bundlePath, producedPath: replayPath, owner: "ReplayCommand", result: "published"},
        ];
        fs.writeFileSync(operationObservationPath, JSON.stringify(operationObservations, null, 2));
        expect(JSON.parse(fs.readFileSync(operationObservationPath, "utf-8"))).toEqual(operationObservations);
        expect(fs.readFileSync(reportPath, "utf-8")).toContain("Outcome Source Report");
        evidence.record({
            id: "outcome-library-simulate", artifactKind: "outcomeLibrary", operation: "simulate", sourcePath: bundlePath,
            producedPath: simulationPath, owner: "SimCommand", result: "published", observations: [{surface: "cli", owner: "SimCommand", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcome-library-replay", artifactKind: "outcomeLibrary", operation: "replay", sourcePath: bundlePath,
            producedPath: replayPath, owner: "ReplayCommand", result: "published", observations: [{surface: "cli", owner: "ReplayCommand", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcome-library-report", artifactKind: "outcomeLibrary", operation: "report", sourcePath: bundlePath,
            producedPath: reportPath, owner: "ReportCommand", result: "published", observations: [{surface: "cli", owner: "ReportCommand", result: "exit 0"}],
        });
        evidence.record({
            id: "outcome-source-analysis-report", artifactKind: "outcomeSourceAnalysisReport", operation: "report", sourcePath: reportPath,
            owner: "ReportCommand", result: "analysis report published from the generated Outcome Library",
            observations: [{surface: "cli", owner: "ReportCommand", result: "report --out exit 0 rendered the Outcome Source Report"}],
        });
        evidence.record({
            id: "simulation-comparison-report", artifactKind: "simulationComparisonReport", operation: "diff", sourcePath: simulationDiffPath,
            owner: "DiffCommand", result: "published from two real simulation reports", observations: [{surface: "cli", owner: "DiffCommand", result: "diff --out exit 0"}],
        });
        evidence.record({
            id: "outcome-source-comparison-report", artifactKind: "outcomeSourceComparisonReport", operation: "diff", sourcePath: outcomeDiffPath,
            owner: "DiffCommand", result: "published from real Outcome Library sources", observations: [{surface: "cli", owner: "DiffCommand", result: "outcome-source diff --out exit 0"}],
        });
        evidence.record({
            id: "rendered-simulation-report", artifactKind: "renderedReport", operation: "render", sourcePath: renderedReportPath,
            owner: "ReportCommand", result: "HTML report published from the real simulation report", observations: [{surface: "cli", owner: "ReportCommand", result: "report --format html --out exit 0"}],
        });
        fs.writeFileSync(certificationConfigPath, JSON.stringify({modes: [{modeName: "base", seed: "matrix-evidence", sampleCount: 4}]}));
        const certification = new CertificationCommand(POKIE_VERSION);
        expect(await certification.run(["build", bundlePath, certificationConfigPath, "--out", certificationPath])).toBe(0);
        evidence.record({
            id: "certification-build-descriptor-build", artifactKind: "certificationBuildDescriptor", operation: "build", sourcePath: certificationConfigPath,
            producedPath: certificationPath, owner: "CertificationCommand", result: "descriptor consumed by the published certification bundle",
            observations: [{surface: "cli", owner: "CertificationCommand", result: "build exit 0 consumed the descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcome-library-certification", artifactKind: "outcomeLibrary", operation: "certification", sourcePath: bundlePath,
            producedPath: certificationPath, owner: "CertificationCommand", result: "published",
            observations: [{surface: "cli", owner: "CertificationCommand", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        expect(await certification.run(["verify", certificationPath, "--source", bundlePath])).toBe(0);
        const certificationManifest = JSON.parse(fs.readFileSync(path.join(certificationPath, "manifest.json"), "utf-8")) as {
            game: {id: string; version: string}; sourceBundleManifestHash: string; modes: {libraryId: string; libraryHash: string}[];
        };
        expect(certificationManifest).toMatchObject({game: provenanceBundleManifest.game, modes: [{
            libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash,
        }]});
        expect(certificationManifest.sourceBundleManifestHash).toMatch(/^sha256:/);
        fs.writeFileSync(seedPath, "matrix-server-seed\n");
        const fairness = new FairnessCommand();
        expect(await fairness.run(["seed-commit", seedPath, "--out", seedCommitmentPath])).toBe(0);
        expect(await fairness.run(["commit", seedCommitmentPath, "--client-seed", "matrix-client", "--nonce", "1", "--source", bundlePath, "--mode", "base", "--out", commitmentPath])).toBe(0);
        expect(await fairness.run(["reveal", commitmentPath, "--server-seed", seedPath, "--source", bundlePath, "--out", proofPath])).toBe(0);
        expect(await fairness.run(["verify", proofPath, "--commitment", commitmentPath, "--source", bundlePath])).toBe(0);
        evidence.record({
            id: "outcome-library-fairness", artifactKind: "outcomeLibrary", operation: "fairness", sourcePath: bundlePath,
            producedPath: proofPath, owner: "FairnessCommand", result: "verified",
            observations: [{surface: "cli", owner: "FairnessCommand", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8")) as {libraryId: string; libraryHash: string; modeName: string; indexHash: string};
        expect(proof).toMatchObject({libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, modeName: "base"});
        expect(proof.indexHash).toMatch(/^sha256:/);
        evidence.record({
            id: "simulation-report-inspect", artifactKind: "simulationReport", operation: "report", sourcePath: packageSimulationPath,
            owner: "ReportCommand", result: "the real simulation output was consumed by the report owner",
            observations: [{surface: "cli", owner: "ReportCommand", result: "simulation report was rendered"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.recordUnavailable({
            id: "simulation-report-set-mode-diagnostic", artifactKind: "simulationReportSet", operation: "simulate", sourcePath: packagePath,
            owner: "SimCommand", diagnostic: {
                code: "missing-capability",
                message: "The real generated package has no declared getBetModes() contract for --mode all.",
                recovery: "Use a package that declares bet modes before requesting a per-mode simulation report set.",
            },
            observations: [{surface: "cli", owner: "SimCommand", result: "sim --mode all returned its concrete missing getBetModes diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.record({
            id: "replay-descriptor-round-artifact", artifactKind: "runtimeReplayDescriptor", operation: "inspect", sourcePath: replayPath,
            owner: "ReplayCommand", result: "portable replay descriptor retained exact outcome-source provenance",
            observations: [{surface: "cli", owner: "ReplayCommand", result: "replay --out wrote the inspected descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "round-artifact-replay-provenance", artifactKind: "roundArtifact", operation: "validate", sourcePath: replayPath,
            owner: "ReplayCommand / RoundArtifactValidator", result: "recorded round artifact retained in the public replay descriptor",
            observations: [{surface: "cli", owner: "ReplayCommand", result: "replay --out published the descriptor containing the round artifact"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "certification-evidence-bundle", artifactKind: "certificationEvidenceBundle", operation: "verify", sourcePath: certificationPath,
            owner: "CertificationCommand", result: "verified against the generated Outcome Library",
            observations: [{surface: "cli", owner: "CertificationCommand", result: "verify exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-server-seed-commitment", artifactKind: "fairnessServerSeedCommitment", operation: "commit", sourcePath: seedCommitmentPath,
            producedPath: commitmentPath, owner: "FairnessCommand", result: "generated round commitment from the public server-seed commitment",
            observations: [{surface: "cli", owner: "FairnessCommand", result: "commit exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-round-commitment", artifactKind: "fairnessCommitment", operation: "reveal", sourcePath: commitmentPath,
            producedPath: proofPath, owner: "FairnessCommand", result: "generated and verified fairness proof",
            observations: [{surface: "cli", owner: "FairnessCommand", result: "reveal and verify exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-round-proof", artifactKind: "fairnessProof", operation: "verify", sourcePath: proofPath,
            owner: "FairnessCommand", result: "verified exact bundle/library provenance",
            observations: [{surface: "cli", owner: "FairnessCommand", result: "verify exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.recordScenario({
            id: "exact-source-provenance", sourcePath: bundlePath, producedPath: proofPath,
            result: "simulation, replay, certification, and fairness retain the generated bundle game, library id, and library hash",
            surface: "cli", owner: "SimCommand / ReplayCommand / CertificationCommand / FairnessCommand",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["simulation, replay, certification, and fairness source bindings match the generated bundle"],
            observations: [{route: "pokie sim/replay/certification/fairness", result: "all public commands completed against the same bundle"}],
        });
        evidence.recordScenario({
            id: "portable-exact-outcome-replay", sourcePath: bundlePath, producedPath: replayPath,
            result: "seeded outcome-library replay records the source library hash and derived-round-seed-v1 selection algorithm",
            surface: "cli", owner: "ReplayCommand",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["replay stores the source library hash and selection algorithm"],
            observations: [{route: "pokie replay", result: "public replay output is portable and exact"}],
        });
        evidence.recordScenario({
            id: "package-replay-best-effort-classification", sourcePath: packagePath, producedPath: packageReplayPath,
            result: "generated package replay has no Outcome Library identity and remains documented best-effort replay",
            surface: "cli", owner: "ReplayCommand",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["package replay descriptor omits outcomeSource provenance"],
            observations: [{route: "pokie replay", result: "public package replay completed without portable outcome-source identity"}],
        });

        // This is an actual CLI cancellation/recovery boundary, rather than a
        // scenario copied from the workflow suite.  The package is produced
        // by BuildCommand, SIGINT is observed at the generator's real
        // progress checkpoint, and resume consumes that persisted checkpoint.
        const cancellationBlueprintPath = path.join(workDir, "matrix-cancellation.blueprint.json");
        const cancellationPackagePath = path.join(workDir, "matrix-cancellation-package");
        const cancellationOutputPath = path.join(workDir, "matrix-cancellation-library.json");
        const cancellationCheckpointPath = path.join(workDir, "matrix-cancellation-checkpoint.json");
        const cancellationStrip = (offset: number): string[] => Array.from({length: 20}, (_unused, index) => ((index + offset) % 3 === 0 ? "A" : "B"));
        fs.writeFileSync(cancellationBlueprintPath, JSON.stringify({
            manifest: {id: "matrix-cancellation", name: "Matrix Cancellation", version: "1.0.0"},
            reels: 3, rows: 1, symbols: ["A", "B"], paytable: {A: {3: 5}},
            reelStrips: [cancellationStrip(0), cancellationStrip(1), cancellationStrip(2)],
        } satisfies GameBlueprint));
        expect(await build.run([cancellationBlueprintPath, "--target", "tsPackage", "--out", cancellationPackagePath])).toBe(0);
        const cancellationProcess = new EventEmitter() as unknown as NodeJS.Process;
        let cancellationObserved = false;
        (console.error as jest.Mock).mockImplementation((message: unknown) => {
            if (!cancellationObserved && typeof message === "string" && message.includes("progress")) {
                cancellationObserved = true;
                cancellationProcess.emit("SIGINT");
            }
        });
        const cancellingCommand = new OutcomeLibraryCommand(
            POKIE_VERSION, undefined, undefined, undefined, undefined, undefined, undefined,
            undefined, undefined, undefined, undefined, cancellationProcess,
        );
        expect(await cancellingCommand.run([
            "generate", cancellationPackagePath, "--out", cancellationOutputPath,
            "--resume", cancellationCheckpointPath, "--progress",
        ])).toBe(130);
        expect(cancellationObserved).toBe(true);
        expect(fs.existsSync(cancellationOutputPath)).toBe(false);
        expect(fs.existsSync(cancellationCheckpointPath)).toBe(true);
        const checkpointEvidencePath = path.join(workDir, "matrix-cancellation-checkpoint-observed.json");
        fs.copyFileSync(cancellationCheckpointPath, checkpointEvidencePath);
        evidence.record({
            id: "outcome-library-generation-checkpoint-resume", artifactKind: "outcomeLibraryGenerationCheckpoint", operation: "resume", sourcePath: checkpointEvidencePath,
            owner: "OutcomeLibraryCommand", result: "persisted cancellation checkpoint accepted for public resume",
            observations: [{surface: "cli", owner: "OutcomeLibraryCommand", result: "generate --resume exit 130 created this checkpoint"}],
            systemicClasses: ["durable-publication-ownership"],
        });
        (console.error as jest.Mock).mockImplementation(() => undefined);
        expect(await new OutcomeLibraryCommand(POKIE_VERSION).run([
            "generate", cancellationPackagePath, "--out", cancellationOutputPath,
            "--resume", cancellationCheckpointPath,
        ])).toBe(0);
        expect(fs.existsSync(cancellationOutputPath)).toBe(true);
        expect(fs.existsSync(cancellationCheckpointPath)).toBe(false);
        evidence.recordScenario({
            id: "cli-generation-cancellation-recovery", sourcePath: cancellationPackagePath, producedPath: cancellationOutputPath,
            result: "SIGINT cancellation leaves no partial raw library, then the saved checkpoint resumes into a published library and is removed",
            surface: "cli", owner: "OutcomeLibraryCommand",
            systemicClasses: ["durable-publication-ownership"],
            assertions: ["cancelled command returns 130 with no output and a checkpoint", "resume publishes output and removes stale checkpoint"],
            observations: [{route: "pokie outcomelibrary generate --resume", result: "public CLI cancellation and recovery completed"}],
        });
        const generatedBlueprintPath = path.join(workDir, "generated.blueprint.json");
        const generatedWorkbookPath = path.join(workDir, "generated.par.xlsx");
        const {reelStrips: _literalReels, ...generatedBlueprintBase} = blueprint;
        fs.writeFileSync(generatedBlueprintPath, JSON.stringify({...generatedBlueprintBase, reelStripGeneration: [
            {type: "generated", length: 3, symbolCounts: {A: 2, B: 1}, seed: 1},
            {type: "generated", length: 3, symbolCounts: {A: 2, B: 1}, seed: 2},
        ]}));
        expect(await new ParCommand(POKIE_VERSION).run(["export", generatedBlueprintPath, "--out", generatedWorkbookPath])).toBe(0);
        expect(await new ParCommand(POKIE_VERSION).run(["import", generatedWorkbookPath, "--out", path.join(workDir, "generated-import.blueprint.json")])).toBe(0);
        const generatedEvidence = JSON.parse(fs.readFileSync(path.join(workDir, "generated-import.blueprint.json.conversion-evidence.json"), "utf-8"));
        expect(generatedEvidence.losslessEligible).toBe(false);
        evidence.recordScenario({
            id: "generated-reel-non-lossless", sourcePath: generatedBlueprintPath, producedPath: generatedWorkbookPath,
            result: "generated reel provenance is retained but the imported PAR evidence marks the round trip non-lossless",
            surface: "cli", owner: "ParCommand",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["PAR import conversion evidence sets losslessEligible false"],
            observations: [{route: "pokie par export/import", result: "public PAR round trip preserves the non-lossless boundary"}],
        });

        const source = await resolver.resolve(blueprintPath);
        if (source === undefined) throw new Error("Expected the generated Blueprint to resolve.");
        const staleDestination = path.join(workDir, "stale-package");
        const stalePlan = await registry.preparePlan(source, "tsPackage", {destinationPath: staleDestination});
        fs.writeFileSync(blueprintPath, JSON.stringify({...blueprint, manifest: {...blueprint.manifest, version: "2.0.0"}}));
        await expect(registry.executePlan(stalePlan, source, staleDestination)).rejects.toThrow(/source (artifact bytes|configuration).*changed|recognized source changed/i);
        expect(fs.existsSync(staleDestination)).toBe(false);
        evidence.recordScenario({
            id: "configuration-drift", sourcePath: blueprintPath,
            result: "prepared package publication rejects the changed source before creating its destination",
            surface: "library", owner: "ArtifactBuilderRegistry",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["stale execution rejects and destination does not exist"],
            observations: [{route: "ArtifactBuilderRegistry.executePlan", result: "source configuration drift rejected before publication"}],
        });

        const occupiedDestination = path.join(workDir, "occupied-package");
        const freshSource = await resolver.resolve(blueprintPath);
        if (freshSource === undefined) throw new Error("Expected the changed Blueprint to resolve.");
        const destinationPlan = await registry.preparePlan(freshSource, "tsPackage", {destinationPath: occupiedDestination});
        fs.mkdirSync(occupiedDestination);
        fs.writeFileSync(path.join(occupiedDestination, "borrowed.txt"), "keep");
        await expect(registry.executePlan(destinationPlan, freshSource, occupiedDestination)).rejects.toThrow(/destination changed|stale or invalid/i);
        expect(fs.readFileSync(path.join(occupiedDestination, "borrowed.txt"), "utf-8")).toBe("keep");
        evidence.recordScenario({
            id: "borrowed-output-cleanup", sourcePath: blueprintPath, producedPath: occupiedDestination,
            result: "destination drift rejects publication and preserves the caller-owned borrowed.txt",
            surface: "library", owner: "ArtifactBuilderRegistry",
            systemicClasses: ["durable-publication-ownership"],
            assertions: ["borrowed destination contents remain unchanged"],
            observations: [{route: "ArtifactBuilderRegistry.executePlan", result: "destination drift rejected without deleting caller output"}],
        });

        // Each freshness binding is exercised from a separately copied real
        // bundle.  The copies are corruption inputs only: the source bundle
        // above was generated and validated through public commands before it
        // is copied, then its manifest or index is changed after preflight.
        // This keeps the emitted result attached to the actual registry
        // boundary instead of describing a mutation which only a unit fixture
        // happened to make.
        for (const [id, entryName] of [["manifest-drift", "manifest.json"], ["index-drift", "index.json"]] as const) {
            const driftBundlePath = path.join(workDir, `matrix-${id}-bundle`);
            fs.cpSync(bundlePath, driftBundlePath, {recursive: true});
            const driftSource = await resolver.resolve(driftBundlePath);
            if (driftSource === undefined) throw new Error(`Expected the real ${id} bundle copy to resolve.`);
            const driftDestination = path.join(workDir, `matrix-${id}-stake`);
            const driftPlan = await registry.preparePlan(driftSource, "stakeAdapter", {destinationPath: driftDestination});
            fs.appendFileSync(path.join(driftBundlePath, entryName), "\n");
            await expect(registry.executePlan(driftPlan, driftSource, driftDestination)).rejects.toThrow(/source.*changed|manifest|index|stale/i);
            expect(fs.existsSync(driftDestination)).toBe(false);
            evidence.recordScenario({
                id, sourcePath: driftBundlePath,
                result: `prepared Stake export rejects ${entryName} mutation before publication`,
                surface: "library", owner: "ArtifactBuilderRegistry.executePlan",
                systemicClasses: ["provenance-and-freshness-binding"],
                assertions: [`mutated ${entryName} rejects execution`, "no Stake destination is published"],
                observations: [{route: "ArtifactBuilderRegistry.executePlan", result: `${entryName} freshness drift rejected before publication`}],
            });
        }

        // PAR byte provenance has an independent binding from descriptor and
        // Outcome Library metadata.  Mutate the real exported workbook after
        // its direct conversion preflight and retain the public registry
        // rejection alongside the artifact that was actually imported above.
        const parDriftPath = path.join(workDir, "matrix-par-source-drift.xlsx");
        fs.copyFileSync(workbookPath, parDriftPath);
        const parDriftSource = await resolver.resolve(parDriftPath);
        if (parDriftSource === undefined) throw new Error("Expected the exported PAR workbook copy to resolve.");
        const parDriftDestination = path.join(workDir, "matrix-par-source-drift-package");
        const parDriftPlan = await registry.preparePlan(parDriftSource, "tsPackage", {destinationPath: parDriftDestination});
        fs.appendFileSync(parDriftPath, "PC-14 source drift");
        await expect(registry.executePlan(parDriftPlan, parDriftSource, parDriftDestination)).rejects.toThrow(/PAR workbook changed after this conversion was prepared/i);
        expect(fs.existsSync(parDriftDestination)).toBe(false);
        evidence.recordScenario({
            id: "par-source-drift", sourcePath: parDriftPath,
            result: "prepared PAR conversion rejects mutated workbook bytes before package publication",
            surface: "library", owner: "ArtifactBuilderRegistry.executePlan",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["PAR byte binding rejects execution", "no package destination is published"],
            observations: [{route: "ArtifactBuilderRegistry.executePlan", result: "PAR source-byte drift rejected before publication"}],
        });

        const wasmPath = path.join(workDir, "matrix.wasm");
        fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify({
            schemaVersion: POKIE_WASM_CONTRACT_VERSION,
            component: {id: "matrix-component", version: "1.0.0"},
            serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
            host: {rng: "pokie.rng.v1", services: []},
            capabilities: [],
        }));
        const wasm = await resolver.resolve(wasmPath);
        if (wasm === undefined || wasm.type !== "wasm") throw new Error("Expected the produced WASM component to resolve.");
        const planner = new ArtifactConversionPlanner();
        const unavailable = planner.plan(wasm, "outcomeLibrary");
        expect(unavailable).toMatchObject({status: "unavailable", diagnostic: {code: "unsupported-boundary"}});
        const simulationDiagnostic = describeUnavailableArtifactOperation(wasm, "sim");
        // This is the exact diagnostic returned by the public CLI owner.
        // `recovery` is structured by the shared owner; it is not
        // reconstructed from a command-specific error string.
        expect(simulationDiagnostic).toMatchObject({
            detectedType: "wasm",
            operation: "sim",
            recovery: "Inspect the compatible manifest or use the original Blueprint or POKIE game package where runnable or convertible source is required.",
        });
        expect(simulationDiagnostic?.message).toContain("Next:");
        if (simulationDiagnostic?.recovery === undefined) throw new Error("Expected the public WASM diagnostic to include recovery.");
        const plannerSources = [
            {path: blueprintPath, project: await resolver.resolve(blueprintPath)},
            {path: packagePath, project: await resolver.resolve(packagePath)},
            {path: bundlePath, project: await resolver.resolve(bundlePath)},
            {path: stakePath, project: await resolver.resolve(stakePath)},
            {path: workbookPath, project: await resolver.resolve(workbookPath)},
            {path: wasmPath, project: wasm},
        ];
        if (plannerSources.some((entry) => entry.project === undefined)) throw new Error("Expected every produced PC-05 artifact to resolve before planning its matrix cells.");

        // A planner cell is not evidence that its selected writer can consume
        // the resolved artifact. Execute every *planned* PC-05 build edge
        // through the public direct-library owner before persisting the cell.
        // This deliberately uses distinct destinations, including identity
        // edges, so a successful earlier command cannot stand in for a later
        // producer/consumer pair.
        for (const {path: sourcePath, project} of plannerSources) {
            for (const target of BUILD_PRODUCT_MATRIX_TARGETS) {
                const destinationPath = path.join(workDir, `matrix-edge-${project!.type}-${target}`);
                const plan = await registry.preparePlan(project!, target, {destinationPath});
                if (plan.status !== "planned") {
                    // A complete product matrix must retain the diagnostic
                    // the public direct-library owner actually returned for
                    // every unavailable pair.  This is intentionally not a
                    // synthetic type-string diagnostic: preparePlan resolved
                    // the real generated/imported source above and delegated
                    // to the shared conversion planner before this record is
                    // emitted.
                    if (plan.diagnostic === undefined) throw new Error(`Expected ${project!.type} -> ${target} to retain a planner diagnostic.`);
                    evidence.recordUnavailable({
                        id: `matrix-${project!.type}-${target}-build`,
                        artifactKind: project!.type,
                        operation: `build:${target}`,
                        sourcePath,
                        owner: "ArtifactBuilderRegistry.preparePlan / ArtifactConversionPlanner",
                        diagnostic: {
                            code: plan.diagnostic.code,
                            message: plan.diagnostic.message,
                            recovery: plan.diagnostic.recovery,
                        },
                        observations: [{
                            surface: "library",
                            owner: "ArtifactBuilderRegistry.preparePlan",
                            result: `resolved ${project!.type} -> ${target} as ${plan.status}: ${plan.diagnostic.code}`,
                        }],
                        systemicClasses: ["shared-conversion-diagnostic-parity"],
                    });
                    continue;
                }
                const execution = await registry.executePlan(plan, project!, destinationPath);
                expect(fs.existsSync(execution.outputPath)).toBe(true);
                evidence.record({
                    id: `matrix-${project!.type}-${target}-build`, artifactKind: project!.type, operation: `build:${target}`,
                    sourcePath, producedPath: execution.outputPath, owner: "ArtifactBuilderRegistry.executePlan",
                    result: `planned ${project!.type} to ${target} conversion published`,
                    observations: [{surface: "library", owner: "ArtifactBuilderRegistry.executePlan", result: `executed ${project!.type} -> ${target}`}],
                    systemicClasses: ["shared-conversion-diagnostic-parity"],
                });
            }
        }
        evidence.recordPlannerCells(plannerSources.flatMap(({path: sourcePath, project}) =>
            BUILD_PRODUCT_MATRIX_TARGETS.map((target) => {
                const plan = planner.plan(project!, target);
                return {
                    sourcePath,
                    sourceType: project!.type,
                    target,
                    status: plan.status,
                    ...(plan.diagnostic === undefined ? {} : {diagnostic: {code: plan.diagnostic.code, recovery: plan.diagnostic.recovery}}),
                };
            }),
        ));
        // Exercise the CLI owner too.  The emitted ledger must never promote a
        // library-only diagnostic into a CLI observation without taking this
        // real public route through the same resolved WASM artifact.
        await expect(new SimCommand().run([wasmPath, "--rounds", "1"])).rejects.toMatchObject({
            name: "UnsupportedProjectOperationError",
            diagnostic: expect.objectContaining({
                detectedType: "wasm",
                operation: "sim",
                message: simulationDiagnostic.message,
                recovery: simulationDiagnostic.recovery,
            }),
        });
        evidence.recordUnavailable({
            id: "wasm-outcome-source-simulate", artifactKind: "wasmComponent", operation: "simulate", sourcePath: wasmPath,
            owner: "SimCommand / ArtifactOperationDiagnostic", diagnostic: {
                code: simulationDiagnostic?.code ?? "", message: simulationDiagnostic?.message ?? "",
                recovery: simulationDiagnostic.recovery,
            },
            observations: [
                {surface: "library", owner: "ArtifactOperationDiagnostic", result: "resolved WASM diagnostic"},
                {surface: "cli", owner: "SimCommand", result: "rejected the same resolved WASM operation diagnostic"},
            ],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        const replayDiagnostic = describeUnavailableArtifactOperation(wasm, "replay");
        if (replayDiagnostic === undefined) throw new Error("Expected the public WASM replay diagnostic to include recovery.");
        await expect(new ReplayCommand().run([wasmPath, "--round", "1"])).rejects.toMatchObject({
            name: "UnsupportedProjectOperationError",
            diagnostic: expect.objectContaining({
                detectedType: "wasm",
                operation: "replay",
                message: replayDiagnostic.message,
                recovery: replayDiagnostic.recovery,
            }),
        });
        evidence.recordUnavailable({
            id: "wasm-outcome-source-replay", artifactKind: "wasmComponent", operation: "replay", sourcePath: wasmPath,
            owner: "ReplayCommand / ArtifactOperationDiagnostic", diagnostic: {
                code: replayDiagnostic.code, message: replayDiagnostic.message, recovery: replayDiagnostic.recovery,
            },
            observations: [
                {surface: "library", owner: "ArtifactOperationDiagnostic", result: "resolved WASM replay diagnostic"},
                {surface: "cli", owner: "ReplayCommand", result: "rejected the same resolved WASM replay diagnostic"},
            ],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.recordScenario({
            id: "wasm-boundary", sourcePath: wasmPath,
            result: "the public simulation command rejects the resolved WASM component with the shared diagnostic and recovery",
            surface: "cli", owner: "SimCommand / ArtifactOperationDiagnostic",
            systemicClasses: ["shared-conversion-diagnostic-parity"],
            assertions: ["SimCommand throws the resolved shared WASM operation diagnostic"],
            observations: [{route: "pokie sim", result: "public CLI returned the shared diagnostic recovery"}],
        });

        // A descriptor build binds both the durable descriptor and the raw
        // library it names.  They are distinct freshness boundaries: a
        // descriptor edit must not be hidden by an unchanged raw file, and a
        // raw-source edit must not be hidden by an unchanged descriptor.
        // Exercise the same prepared operation used by ExportCommand rather
        // than modelling either failure as a synthetic JSON fixture.
        const descriptorDriftCommand = new OutcomeLibraryCommand(POKIE_VERSION);
        const descriptorDriftOut = path.join(workDir, "matrix-descriptor-drift-bundle");
        const descriptorDriftPrepared = descriptorDriftCommand.prepareDescriptorBuildOperation(descriptorPath, descriptorDriftOut);
        fs.appendFileSync(descriptorPath, "\n");
        await expect(new ArtifactConversionPlanner().executeConversionPlan(
            descriptorDriftPrepared.plan,
            descriptorDriftPrepared.execution,
        )).rejects.toThrow(/source artifact bytes changed|source.*changed|fresh preflight/i);
        expect(fs.existsSync(descriptorDriftOut)).toBe(false);
        evidence.recordScenario({
            id: "descriptor-drift", sourcePath: descriptorPath,
            result: "prepared Outcome Library publication rejects a changed bundle descriptor before creating its destination",
            surface: "library", owner: "OutcomeLibraryCommand.prepareDescriptorBuildOperation",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: ["descriptor byte binding rejects execution", "no bundle destination is published"],
            observations: [{route: "OutcomeLibraryCommand.prepareDescriptorBuildOperation", result: "descriptor drift rejected before publication"}],
        });

        const rawDriftDescriptorPath = path.join(workDir, "matrix-raw-drift-bundle.json");
        fs.writeFileSync(rawDriftDescriptorPath, JSON.stringify({modes: [{modeName: "base", libraryPath: path.basename(rawLibraryPath)}]}));
        const rawDriftOut = path.join(workDir, "matrix-raw-source-drift-bundle");
        const rawDriftPrepared = descriptorDriftCommand.prepareDescriptorBuildOperation(rawDriftDescriptorPath, rawDriftOut);
        fs.appendFileSync(rawLibraryPath, "\n");
        await expect(new ArtifactConversionPlanner().executeConversionPlan(
            rawDriftPrepared.plan,
            rawDriftPrepared.execution,
        )).rejects.toThrow(/source artifact bytes changed|source.*changed|fresh preflight/i);
        expect(fs.existsSync(rawDriftOut)).toBe(false);
        evidence.recordScenario({
            id: "raw-source-drift", sourcePath: rawLibraryPath,
            result: "prepared Outcome Library publication rejects changed generated raw-library bytes before creating its destination",
            surface: "library", owner: "OutcomeLibraryCommand.prepareDescriptorBuildOperation",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: ["raw source byte binding rejects execution", "no bundle destination is published"],
            observations: [{route: "OutcomeLibraryCommand.prepareDescriptorBuildOperation", result: "raw source drift rejected before publication"}],
        });
        // Write only after every lifecycle and conversion assertion has
        // completed.  Writing at the first successful chain left the saved
        // ledger blind to the later, independently exercised drift and
        // planner cells even though this runner had already performed them.
        // PC-14's checked-in result is deliberately emitted by this runner,
        // not maintained as a second hand-written matrix.
        const evidenceDirectory = process.env.PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR;
        if (evidenceDirectory !== undefined) fs.mkdirSync(evidenceDirectory, {recursive: true});
        const emittedEvidencePath = evidenceDirectory === undefined
            ? path.join(workDir, "pc-14-cli-real-artifact-result.json")
            : path.join(evidenceDirectory, "cli-real-artifact-result.json");
        evidence.write(emittedEvidencePath);
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {rows: unknown[]}).rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: "wasm-outcome-source-simulate", status: "intentionally-unsupported", "source_path": "run-artifacts/matrix.wasm",
                diagnostic: expect.objectContaining({code: "unsupported-project-operation"}),
            }),
        ]));
        const emittedMatrixRows = (JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {
            rows: {id: string; status: string; diagnostic?: {code: string; recovery: string}}[];
        }).rows.filter((row) => row.id.startsWith("matrix-"));
        expect(emittedMatrixRows).toHaveLength(BUILD_PRODUCT_MATRIX_TARGETS.length * plannerSources.length);
        for (const source of plannerSources) {
            for (const target of BUILD_PRODUCT_MATRIX_TARGETS) {
                const row = emittedMatrixRows.find((candidate) => candidate.id === `matrix-${source.project!.type}-${target}-build`);
                expect(row).toBeDefined();
                const plan = planner.plan(source.project!, target);
                expect(row?.status).toBe(plan.status === "planned" ? "supported" : "intentionally-unsupported");
                if (plan.status !== "planned") expect(row?.diagnostic).toMatchObject({code: plan.diagnostic?.code, recovery: plan.diagnostic?.recovery});
            }
        }
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {"scenario_results": {id: string; "source_path": string}[]}).scenario_results).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "configuration-drift", "source_path": "run-artifacts/matrix.blueprint.json"}),
            expect.objectContaining({id: "borrowed-output-cleanup", "source_path": "run-artifacts/matrix.blueprint.json"}),
            expect.objectContaining({id: "wasm-boundary", "source_path": "run-artifacts/matrix.wasm"}),
        ]));
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {"scenario_results": {execution: {assertions: string[]; observations: unknown[]}}[]}).scenario_results).toEqual(expect.arrayContaining([
            expect.objectContaining({execution: expect.objectContaining({assertions: expect.any(Array), observations: expect.any(Array)})}),
        ]));
    });
});
