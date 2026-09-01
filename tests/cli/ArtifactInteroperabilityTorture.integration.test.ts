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
    GameBlueprintValidator,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
    ParSheetImporter,
    POKIE_WASM_CONTRACT_VERSION,
    type GameBlueprint,
    ProjectTargetResolver,
    StakeEngineExportValidator,
    StakeEngineImporter,
    StakeEngineOutcomeSourceReader,
    StakeEngineStandaloneValidator,
    loadPokieGame,
} from "pokie";
import {CertificationCommand} from "../../cli/commands/CertificationCommand.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {DiffCommand} from "../../cli/commands/DiffCommand.js";
import {EditCommand} from "../../cli/commands/EditCommand.js";
import {ExportCommand} from "../../cli/commands/ExportCommand.js";
import {FairnessCommand} from "../../cli/commands/FairnessCommand.js";
import {GenerateCommand} from "../../cli/commands/GenerateCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {ImportCommand} from "../../cli/commands/ImportCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "../../cli/commands/OutcomeSourceCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReelCommand} from "../../cli/commands/ReelCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ServeCommand} from "../../cli/commands/ServeCommand.js";
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

    // This runner intentionally exercises every public artifact boundary and
    // emits the evidence consumed by the clean-process remediation contract.
    // It can exceed Jest's default minute when it shares the constrained
    // changed-test workers with the Studio and evidence-regeneration suites.
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
        const simulationJsonReportPath = path.join(workDir, "matrix-simulation-report.json");
        const outcomeDiffPath = path.join(workDir, "matrix-outcome-diff.json");
        const outcomeSourceCommandDiffPath = path.join(workDir, "matrix-outcomesource-diff.json");
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

        // Keep CLI authoring in the same real-artifact run.  These are three
        // separately invoked public paths: the generic command, an explicit
        // destination, and the command's documented default destination.
        // Do not reuse one created file to stand in for either sibling.
        const authoringRoot = path.join(workDir, "cli-authoring");
        fs.mkdirSync(authoringRoot);
        const create = new CreateCommand(POKIE_VERSION);
        const createdGenericPath = path.join(authoringRoot, "generic.blueprint.json");
        expect(await create.run(["generic", "--random", "--seed", "101", "--out", createdGenericPath])).toBe(0);
        evidence.record({
            id: "blueprint-cli-create", artifactKind: "blueprint", operation: "create", sourcePath: createdGenericPath,
            producedPath: createdGenericPath, owner: "cli:create", registryOperation: "created_by", result: "public CLI authoring published a valid generated Blueprint",
            observations: [{surface: "cli", owner: "cli:create", result: "create --random --out exit 0"}],
        });
        const createdExplicitPath = path.join(authoringRoot, "explicit.blueprint.json");
        expect(await create.run(["explicit", "--random", "--seed", "102", "--out", createdExplicitPath])).toBe(0);
        evidence.record({
            id: "blueprint-cli-create-explicit-output", artifactKind: "blueprint", operation: "create:explicit-output", sourcePath: createdExplicitPath,
            producedPath: createdExplicitPath, owner: "cli:create --out", registryOperation: "created_by", result: "public CLI authoring published at its explicit destination",
            observations: [{surface: "cli", owner: "cli:create --out", result: "create --random --out exit 0"}],
        });
        const originalWorkingDirectory = process.cwd();
        process.chdir(authoringRoot);
        try {
            expect(await create.run(["default", "--random", "--seed", "103"])).toBe(0);
        } finally {
            process.chdir(originalWorkingDirectory);
        }
        const createdDefaultPath = path.join(authoringRoot, "default.blueprint.json");
        expect(fs.existsSync(createdDefaultPath)).toBe(true);
        evidence.record({
            id: "blueprint-cli-create-default-output", artifactKind: "blueprint", operation: "create:default-output", sourcePath: createdDefaultPath,
            producedPath: createdDefaultPath, owner: "cli:create without --out", registryOperation: "created_by", result: "public CLI authoring published at its documented default destination",
            observations: [{surface: "cli", owner: "cli:create without --out", result: "create --random without --out exit 0"}],
        });

        // Edit is deliberately unavailable in this non-interactive runner.
        // Keep both public destination forms as concrete diagnostics rather
        // than letting their registry tuples borrow the create observation.
        let editDiagnostic = "";
        (console.error as jest.Mock).mockImplementation((message: unknown) => {
            editDiagnostic += `${String(message)}\n`;
        });
        expect(await new EditCommand().run([createdGenericPath, "--out", path.join(authoringRoot, "edited.blueprint.json")])).toBe(1);
        const explicitEditDiagnostic = editDiagnostic.trim();
        editDiagnostic = "";
        expect(await new EditCommand().run([createdGenericPath])).toBe(1);
        const defaultEditDiagnostic = editDiagnostic.trim();
        (console.error as jest.Mock).mockImplementation(() => undefined);
        const editRecovery = "Re-run inside a terminal, or edit the Blueprint Project's JSON file directly, then validate the saved Blueprint.";
        evidence.recordUnavailable({
            id: "blueprint-cli-edit-explicit-output", artifactKind: "blueprint", operation: "edit:explicit-output", registryOperation: "created_by",
            sourcePath: createdGenericPath, owner: "cli:edit --out",
            diagnostic: {code: "unsupported-project-operation", message: explicitEditDiagnostic, recovery: editRecovery},
            observations: [{surface: "cli", owner: "cli:edit --out", result: "edit --out returned the non-interactive recovery diagnostic"}],
        });
        evidence.recordUnavailable({
            id: "blueprint-cli-edit-default-output", artifactKind: "blueprint", operation: "edit:default-output", registryOperation: "created_by",
            sourcePath: createdGenericPath, owner: "cli:edit without --out",
            diagnostic: {code: "unsupported-project-operation", message: defaultEditDiagnostic, recovery: editRecovery},
            observations: [{surface: "cli", owner: "cli:edit without --out", result: "edit returned the non-interactive recovery diagnostic"}],
        });

        // Reel authoring needs a generated source.  Each persistence form is
        // given a fresh Blueprint, so --apply and --materialize cannot reuse
        // a sibling command's output.
        const generatedReelBlueprint = {
            ...blueprint,
            reelStripGeneration: [
                {type: "generated" as const, length: 4, symbolCounts: {A: 2, B: 2}, seed: 201},
                {type: "generated" as const, length: 4, symbolCounts: {A: 2, B: 2}, seed: 202},
            ],
        };
        const reelExplicitSourcePath = path.join(authoringRoot, "reel-explicit-source.blueprint.json");
        const reelExplicitOutputPath = path.join(authoringRoot, "reel-explicit-output.blueprint.json");
        fs.writeFileSync(reelExplicitSourcePath, JSON.stringify(generatedReelBlueprint));
        expect(await new ReelCommand().run(["generate", reelExplicitSourcePath, "--apply", "--out", reelExplicitOutputPath])).toBe(0);
        evidence.record({
            id: "blueprint-cli-reel-generate-explicit-output", artifactKind: "blueprint", operation: "reel-generate:explicit-output", registryOperation: "created_by",
            sourcePath: reelExplicitSourcePath, producedPath: reelExplicitOutputPath, owner: "cli:reel generate --out",
            result: "reel generation published an explicitly addressed Blueprint", observations: [{surface: "cli", owner: "cli:reel generate --out", result: "reel generate --apply --out exit 0"}],
        });
        const reelApplySourcePath = path.join(authoringRoot, "reel-apply-source.blueprint.json");
        fs.writeFileSync(reelApplySourcePath, JSON.stringify(generatedReelBlueprint));
        expect(await new ReelCommand().run(["generate", reelApplySourcePath, "--apply"])).toBe(0);
        evidence.record({
            id: "blueprint-cli-reel-generate-apply-default", artifactKind: "blueprint", operation: "reel-generate:apply-default", registryOperation: "created_by",
            sourcePath: reelApplySourcePath, producedPath: reelApplySourcePath, owner: "cli:reel generate --apply without --out",
            result: "reel generation persisted its documented default Blueprint", observations: [{surface: "cli", owner: "cli:reel generate --apply without --out", result: "reel generate --apply exit 0"}],
        });
        const reelMaterializeSourcePath = path.join(authoringRoot, "reel-materialize-source.blueprint.json");
        fs.writeFileSync(reelMaterializeSourcePath, JSON.stringify(generatedReelBlueprint));
        expect(await new ReelCommand().run(["generate", reelMaterializeSourcePath, "--materialize"])).toBe(0);
        evidence.record({
            id: "blueprint-cli-reel-generate-materialize-default", artifactKind: "blueprint", operation: "reel-generate:materialize-default", registryOperation: "created_by",
            sourcePath: reelMaterializeSourcePath, producedPath: reelMaterializeSourcePath, owner: "cli:reel generate --materialize without --out",
            result: "reel materialization persisted its documented default Blueprint", observations: [{surface: "cli", owner: "cli:reel generate --materialize without --out", result: "reel generate --materialize exit 0"}],
        });

        // The workbook and imported Blueprint are both real public artifacts.
        // Keep them in the same emitted run as the package chain so the PAR
        // cells are not inferred from a separate unit fixture.
        expect(await new ParCommand(POKIE_VERSION).run(["export", blueprintPath, "--out", workbookPath])).toBe(0);
        evidence.record({
            id: "blueprint-export-par", artifactKind: "parWorkbook", operation: "export", sourcePath: blueprintPath,
            producedPath: workbookPath, owner: "cli:par export --out", registryOperation: "created_by", result: "published",
            observations: [{surface: "cli", owner: "cli:par export --out", result: "export exit 0"}],
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
            id: "par-import-blueprint", artifactKind: "blueprint", operation: "import", sourcePath: workbookPath,
            producedPath: importedBlueprintPath, owner: "cli:par import --out", registryOperation: "created_by", result: "lossless Blueprint published",
            observations: [{surface: "cli", owner: "cli:par import --out", result: "import exit 0 with matching provenance hash"}],
        });

        const resolver = new ProjectTargetResolver();
        const registry = new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd());
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, resolver, registry);
        expect(await build.run([blueprintPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        evidence.record({
            id: "blueprint-build-package", artifactKind: "tsPackage", operation: "build", sourcePath: blueprintPath,
            producedPath: packagePath, owner: "cli:build --target tsPackage --out", registryOperation: "created_by", result: "published",
            observations: [{surface: "cli", owner: "cli:build --target tsPackage --out", result: "exit 0"}],
        });
        const genericPackagePath = path.join(workDir, "matrix-generic-package");
        expect(await build.run([blueprintPath, "--target", "tsPackage", "--out", genericPackagePath])).toBe(0);
        evidence.record({
            id: "blueprint-build-package-generic", artifactKind: "tsPackage", operation: "build:tsPackage-generic", sourcePath: blueprintPath,
            producedPath: genericPackagePath, owner: "cli:build", registryOperation: "created_by", result: "the public build owner published its own package artifact",
            observations: [{surface: "cli", owner: "cli:build", result: "build --target tsPackage --out exit 0"}],
        });
        const explicitBundlePath = path.join(workDir, "matrix-explicit-bundle");
        expect(await build.run([packagePath, "--target", "outcomeLibrary", "--out", explicitBundlePath])).toBe(0);
        evidence.record({
            id: "package-build-outcome-library-explicit-output", artifactKind: "outcomeLibrary", operation: "build:outcomeLibrary-explicit-output", sourcePath: packagePath,
            producedPath: explicitBundlePath, owner: "cli:build --target outcomeLibrary --out", registryOperation: "created_by", result: "public build published an Outcome Library at its explicit destination",
            observations: [{surface: "cli", owner: "cli:build --target outcomeLibrary --out", result: "build --target outcomeLibrary --out exit 0"}],
        });
        const genericBundlePath = path.join(workDir, "matrix-generic-bundle");
        expect(await build.run([packagePath, "--target", "outcomeLibrary", "--out", genericBundlePath])).toBe(0);
        evidence.record({
            id: "package-build-outcome-library-generic", artifactKind: "outcomeLibrary", operation: "build:outcomeLibrary-generic", sourcePath: packagePath,
            producedPath: genericBundlePath, owner: "cli:build --target outcomeLibrary", registryOperation: "created_by", result: "public build owner published its own Outcome Library artifact",
            observations: [{surface: "cli", owner: "cli:build --target outcomeLibrary", result: "build --target outcomeLibrary --out exit 0"}],
        });
        const explicitStakePath = path.join(workDir, "matrix-explicit-stake");
        expect(await build.run([explicitBundlePath, "--target", "stakeAdapter", "--out", explicitStakePath])).toBe(0);
        evidence.record({
            id: "outcome-library-build-stake-explicit-output", artifactKind: "stakeAdapter", operation: "build:stakeAdapter-explicit-output", sourcePath: explicitBundlePath,
            producedPath: explicitStakePath, owner: "cli:build --target stakeAdapter --out", registryOperation: "created_by", result: "public build published a Stake adapter at its explicit destination",
            observations: [{surface: "cli", owner: "cli:build --target stakeAdapter --out", result: "build --target stakeAdapter --out exit 0"}],
        });
        const genericStakePath = path.join(workDir, "matrix-generic-stake");
        expect(await build.run([genericBundlePath, "--target", "stakeAdapter", "--out", genericStakePath])).toBe(0);
        evidence.record({
            id: "outcome-library-build-stake-generic", artifactKind: "stakeAdapter", operation: "build:stakeAdapter-generic", sourcePath: genericBundlePath,
            producedPath: genericStakePath, owner: "cli:build", registryOperation: "created_by", result: "public build owner published its own Stake adapter artifact",
            observations: [{surface: "cli", owner: "cli:build", result: "build --target stakeAdapter --out exit 0"}],
        });
        const explicitParPath = path.join(workDir, "matrix-explicit.par.xlsx");
        expect(await build.run([blueprintPath, "--target", "parWorkbook", "--out", explicitParPath])).toBe(0);
        evidence.record({
            id: "blueprint-build-par-explicit-output", artifactKind: "parWorkbook", operation: "build:parWorkbook-explicit-output", sourcePath: blueprintPath,
            producedPath: explicitParPath, owner: "cli:build --target parWorkbook --out", registryOperation: "created_by", result: "public build published a PAR workbook at its explicit destination",
            observations: [{surface: "cli", owner: "cli:build --target parWorkbook --out", result: "build --target parWorkbook --out exit 0"}],
        });

        // The registry inventory deliberately distinguishes public aliases
        // and default-destination branches.  Exercise those branches here,
        // rather than projecting a single --out build over their names in
        // the evidence merger.  Each source lives in its own directory so a
        // command's documented default cannot be satisfied by an earlier
        // output with the same target-shaped name.
        const ownerAliasRoot = path.join(workDir, "owner-aliases");
        fs.mkdirSync(ownerAliasRoot);
        const aliasBlueprintPath = path.join(ownerAliasRoot, "direct-par.blueprint.json");
        fs.copyFileSync(blueprintPath, aliasBlueprintPath);
        const aliasParPath = path.join(ownerAliasRoot, "direct-par.par.xlsx");
        expect(await new ParCommand(POKIE_VERSION).run(["export", aliasBlueprintPath])).toBe(0);
        expect(fs.existsSync(aliasParPath)).toBe(true);
        evidence.record({
            id: "blueprint-par-export-default", artifactKind: "parWorkbook", operation: "par-export-default", sourcePath: aliasBlueprintPath,
            producedPath: aliasParPath, owner: "cli:par export without --out", registryOperation: "created_by", result: "published at the documented sibling default",
            observations: [{surface: "cli", owner: "cli:par export without --out", result: "par export without --out exit 0"}],
        });
        const aliasImportedBlueprintPath = path.join(ownerAliasRoot, "direct-par.par.blueprint.json");
        expect(await new ParCommand(POKIE_VERSION).run(["import", aliasParPath])).toBe(0);
        expect(fs.existsSync(aliasImportedBlueprintPath)).toBe(true);
        evidence.record({
            id: "par-import-blueprint-default", artifactKind: "blueprint", operation: "par-import-default", sourcePath: aliasParPath,
            producedPath: aliasImportedBlueprintPath, owner: "cli:par import without --out", registryOperation: "created_by", result: "published at the documented sibling default",
            observations: [{surface: "cli", owner: "cli:par import without --out", result: "par import without --out exit 0"}],
        });

        const dispatcherBlueprintPath = path.join(ownerAliasRoot, "dispatcher.blueprint.json");
        const dispatcherParPath = path.join(ownerAliasRoot, "dispatcher.par.xlsx");
        const dispatcherImportedBlueprintPath = path.join(ownerAliasRoot, "dispatcher.par.blueprint.json");
        fs.copyFileSync(blueprintPath, dispatcherBlueprintPath);
        expect(await new ParCommand(POKIE_VERSION).run(["export", dispatcherBlueprintPath, "--out", dispatcherParPath])).toBe(0);
        expect(await new ImportCommand(POKIE_VERSION).run([dispatcherParPath])).toBe(0);
        expect(fs.existsSync(dispatcherImportedBlueprintPath)).toBe(true);
        evidence.record({
            id: "import-par-blueprint-default", artifactKind: "blueprint", operation: "import-default", sourcePath: dispatcherParPath,
            producedPath: dispatcherImportedBlueprintPath, owner: "cli:import XLSX without --out", registryOperation: "created_by", result: "generic public dispatcher published its documented Blueprint default",
            observations: [{surface: "cli", owner: "cli:import XLSX without --out", result: "import XLSX without --out exit 0"}],
        });
        const dispatcherExplicitBlueprintPath = path.join(ownerAliasRoot, "dispatcher-explicit.blueprint.json");
        expect(await new ImportCommand(POKIE_VERSION).run([dispatcherParPath, "--out", dispatcherExplicitBlueprintPath])).toBe(0);
        evidence.record({
            id: "import-par-blueprint-explicit-output", artifactKind: "blueprint", operation: "import:explicit-output", sourcePath: dispatcherParPath,
            producedPath: dispatcherExplicitBlueprintPath, owner: "cli:import --out for an XLSX source", registryOperation: "created_by", result: "generic public dispatcher published its Blueprint at the explicit destination",
            observations: [{surface: "cli", owner: "cli:import --out for an XLSX source", result: "import XLSX --out exit 0"}],
        });

        const defaultBuildRoot = path.join(ownerAliasRoot, "build-default");
        fs.mkdirSync(defaultBuildRoot);
        const defaultBuildBlueprintPath = path.join(defaultBuildRoot, "source.blueprint.json");
        fs.copyFileSync(blueprintPath, defaultBuildBlueprintPath);
        const defaultBuild = new BuildCommand(POKIE_VERSION, undefined, undefined, new ProjectTargetResolver(), new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd()));
        const defaultPackagePath = path.join(defaultBuildRoot, "tsPackage");
        expect(await defaultBuild.run([defaultBuildBlueprintPath, "--target", "tsPackage"])).toBe(0);
        expect(fs.existsSync(defaultPackagePath)).toBe(true);
        evidence.record({
            id: "blueprint-build-package-default", artifactKind: "tsPackage", operation: "build:tsPackage-default", sourcePath: defaultBuildBlueprintPath,
            producedPath: defaultPackagePath, owner: "cli:build --target tsPackage without --out", registryOperation: "created_by", result: "published at the documented target-named sibling",
            observations: [{surface: "cli", owner: "cli:build --target tsPackage without --out", result: "build tsPackage without --out exit 0"}],
        });
        const defaultBundlePath = path.join(defaultBuildRoot, "outcomeLibrary");
        expect(await defaultBuild.run([defaultPackagePath, "--target", "outcomeLibrary"])).toBe(0);
        expect(fs.existsSync(defaultBundlePath)).toBe(true);
        evidence.record({
            id: "package-build-outcome-library-default", artifactKind: "outcomeLibrary", operation: "build:outcomeLibrary-default", sourcePath: defaultPackagePath,
            producedPath: defaultBundlePath, owner: "cli:build --target outcomeLibrary without --out", registryOperation: "created_by", result: "published at the documented target-named sibling",
            observations: [{surface: "cli", owner: "cli:build --target outcomeLibrary without --out", result: "build outcomeLibrary without --out exit 0"}],
        });
        const defaultStakePath = path.join(defaultBuildRoot, "stakeAdapter");
        expect(await defaultBuild.run([defaultBundlePath, "--target", "stakeAdapter"])).toBe(0);
        expect(fs.existsSync(defaultStakePath)).toBe(true);
        evidence.record({
            id: "outcome-library-build-stake-default", artifactKind: "stakeAdapter", operation: "build:stakeAdapter-default", sourcePath: defaultBundlePath,
            producedPath: defaultStakePath, owner: "cli:build --target stakeAdapter without --out", registryOperation: "created_by", result: "published at the documented target-named sibling",
            observations: [{surface: "cli", owner: "cli:build --target stakeAdapter without --out", result: "build stakeAdapter without --out exit 0"}],
        });
        const defaultParPath = path.join(defaultBuildRoot, "parWorkbook.xlsx");
        expect(await defaultBuild.run([defaultBuildBlueprintPath, "--target", "parWorkbook"])).toBe(0);
        expect(fs.existsSync(defaultParPath)).toBe(true);
        evidence.record({
            id: "blueprint-build-par-default", artifactKind: "parWorkbook", operation: "build:parWorkbook-default", sourcePath: defaultBuildBlueprintPath,
            producedPath: defaultParPath, owner: "cli:build --target parWorkbook without --out", registryOperation: "created_by", result: "published at the documented workbook sibling",
            observations: [{surface: "cli", owner: "cli:build --target parWorkbook without --out", result: "build parWorkbook without --out exit 0"}],
        });

        const exportRoot = path.join(ownerAliasRoot, "export-default");
        fs.mkdirSync(exportRoot);
        const exportBlueprintPath = path.join(exportRoot, "source.blueprint.json");
        fs.copyFileSync(blueprintPath, exportBlueprintPath);
        const exportBuild = new BuildCommand(POKIE_VERSION, undefined, undefined, new ProjectTargetResolver(), new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd()));
        const exportPackagePath = path.join(exportRoot, "package");
        expect(await exportBuild.run([exportBlueprintPath, "--target", "tsPackage", "--out", exportPackagePath])).toBe(0);
        const exportCommand = new ExportCommand(POKIE_VERSION);
        const explicitExportBundlePath = path.join(exportRoot, "explicit-outcomes");
        expect(await exportCommand.run([exportPackagePath, "--to", "outcomes", "--out", explicitExportBundlePath])).toBe(0);
        evidence.record({
            id: "package-export-outcome-library-explicit-output", artifactKind: "outcomeLibrary", operation: "export:outcomes-explicit-output", sourcePath: exportPackagePath,
            producedPath: explicitExportBundlePath, owner: "cli:export --to outcomes --out", registryOperation: "created_by", result: "target-oriented export published an Outcome Library at its explicit destination",
            observations: [{surface: "cli", owner: "cli:export --to outcomes --out", result: "export outcomes --out exit 0"}],
        });
        const explicitExportStakePath = path.join(exportRoot, "explicit-adapter");
        expect(await exportCommand.run([explicitExportBundlePath, "--to", "adapter", "--out", explicitExportStakePath])).toBe(0);
        evidence.record({
            id: "outcome-library-export-stake-explicit-output", artifactKind: "stakeAdapter", operation: "export:adapter-explicit-output", sourcePath: explicitExportBundlePath,
            producedPath: explicitExportStakePath, owner: "cli:export --to adapter --out", registryOperation: "created_by", result: "target-oriented export published a Stake adapter at its explicit destination",
            observations: [{surface: "cli", owner: "cli:export --to adapter --out", result: "export adapter --out exit 0"}],
        });
        const explicitExportWorkbookPath = path.join(exportRoot, "explicit-workbook.xlsx");
        expect(await exportCommand.run([exportBlueprintPath, "--to", "workbook", "--out", explicitExportWorkbookPath])).toBe(0);
        evidence.record({
            id: "blueprint-export-par-via-export-explicit-output", artifactKind: "parWorkbook", operation: "export:workbook-explicit-output", sourcePath: exportBlueprintPath,
            producedPath: explicitExportWorkbookPath, owner: "cli:export --to workbook --out", registryOperation: "created_by", result: "target-oriented export published a PAR workbook at its explicit destination",
            observations: [{surface: "cli", owner: "cli:export --to workbook --out", result: "export workbook --out exit 0"}],
        });
        const exportBundlePath = path.join(exportRoot, "outcomelibrary");
        expect(await exportCommand.run([exportPackagePath, "--to", "outcomes"])).toBe(0);
        expect(fs.existsSync(exportBundlePath)).toBe(true);
        evidence.record({
            id: "package-export-outcome-library-default", artifactKind: "outcomeLibrary", operation: "export:outcomes-default", sourcePath: exportPackagePath,
            producedPath: exportBundlePath, owner: "cli:export --to outcomes without --out", registryOperation: "created_by", result: "target-oriented export published its documented default",
            observations: [{surface: "cli", owner: "cli:export --to outcomes without --out", result: "export outcomes without --out exit 0"}],
        });
        const exportStakePath = path.join(exportRoot, "stakeengine");
        expect(await exportCommand.run([exportBundlePath, "--to", "adapter"])).toBe(0);
        expect(fs.existsSync(exportStakePath)).toBe(true);
        evidence.record({
            id: "outcome-library-export-stake-default", artifactKind: "stakeAdapter", operation: "export:adapter-default", sourcePath: exportBundlePath,
            producedPath: exportStakePath, owner: "cli:export --to adapter without --out", registryOperation: "created_by", result: "target-oriented export published its documented default",
            observations: [{surface: "cli", owner: "cli:export --to adapter without --out", result: "export adapter without --out exit 0"}],
        });
        const exportWorkbookPath = path.join(exportRoot, "source.par.xlsx");
        expect(await exportCommand.run([exportBlueprintPath, "--to", "workbook"])).toBe(0);
        expect(fs.existsSync(exportWorkbookPath)).toBe(true);
        evidence.record({
            id: "blueprint-export-par-via-export-default", artifactKind: "parWorkbook", operation: "export:workbook-default", sourcePath: exportBlueprintPath,
            producedPath: exportWorkbookPath, owner: "cli:export --to workbook without --out", registryOperation: "created_by", result: "target-oriented export published its documented workbook default",
            observations: [{surface: "cli", owner: "cli:export --to workbook without --out", result: "export workbook without --out exit 0"}],
        });
        const sourceProject = await resolver.resolve(importedBlueprintPath);
        if (sourceProject === undefined) throw new Error("Expected the imported Blueprint to resolve for the direct-library preflight.");
        evidence.record({
            id: "library-resolve-imported-blueprint", artifactKind: "blueprint", operation: "resolve", registryOperation: "recognized_by",
            sourcePath: importedBlueprintPath, owner: "ProjectTargetResolver", result: "direct resolver recognized the runner-imported Blueprint",
            observations: [{surface: "library", owner: "ProjectTargetResolver", result: "resolve returned blueprint"}],
        });
        expect(new GameBlueprintValidator().validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
        evidence.record({
            id: "library-validate-blueprint", artifactKind: "blueprint", operation: "validate", registryOperation: "validates_by",
            sourcePath: blueprintPath, owner: "GameBlueprintValidator", result: "direct Blueprint validator accepted the runner-produced Blueprint",
            observations: [{surface: "library", owner: "GameBlueprintValidator", result: "validate returned no errors"}],
        });
        const directPackagePath = path.join(workDir, "direct-library-package");
        const directPackage = await registry.build("tsPackage", sourceProject, directPackagePath);
        expect(fs.existsSync(directPackage.outputPath)).toBe(true);
        evidence.record({
            id: "library-build-package", artifactKind: "tsPackage", operation: "build", registryOperation: "created_by",
            sourcePath: importedBlueprintPath, producedPath: directPackage.outputPath, owner: "ArtifactBuilderRegistry:build(tsPackage)",
            result: "direct registry build published a TypeScript package",
            observations: [{surface: "library", owner: "ArtifactBuilderRegistry:build(tsPackage)", result: "build returned a published package"}],
        });
        const directPackageProject = await resolver.resolve(directPackage.outputPath);
        expect(directPackageProject?.type).toBe("tsPackage");
        evidence.record({
            id: "library-resolve-direct-package", artifactKind: "tsPackage", operation: "resolve", registryOperation: "recognized_by",
            sourcePath: directPackage.outputPath, owner: "ProjectTargetResolver", result: "direct resolver recognized the registry-produced package",
            observations: [{surface: "library", owner: "ProjectTargetResolver", result: "resolve returned tsPackage"}],
        });
        const directPackageRecognition = await loadPokieGame(directPackage.outputPath);
        expect(directPackageRecognition.getManifest()).toMatchObject({id: blueprint.manifest.id, version: blueprint.manifest.version});
        evidence.record({
            id: "library-load-direct-package", artifactKind: "tsPackage", operation: "recognize", registryOperation: "recognized_by",
            sourcePath: directPackage.outputPath, owner: "loadPokieGame", result: "direct package loader recognized the registry-produced package",
            observations: [{surface: "library", owner: "loadPokieGame", result: "loadPokieGame returned the package game"}],
        });
        const directPackageValidation = await loadPokieGame(directPackage.outputPath);
        expect(directPackageValidation.getManifest()).toMatchObject({id: blueprint.manifest.id, version: blueprint.manifest.version});
        evidence.record({
            id: "library-validate-direct-package", artifactKind: "tsPackage", operation: "validate", registryOperation: "validates_by",
            sourcePath: directPackage.outputPath, owner: "loadPokieGame", result: "direct package loader validated the registry-produced package entry",
            observations: [{surface: "library", owner: "loadPokieGame", result: "loadPokieGame returned a runnable package game"}],
        });
        if (directPackageProject === undefined) throw new Error("Expected the direct TypeScript package build to resolve.");

        // Execute each remaining registry build owner directly against the
        // artifacts this runner produced.  The registry's matrix preflight
        // below remains useful conversion coverage, but cannot stand in for
        // a tuple whose PC-05 owner is a particular public build method.
        const directBundlePath = path.join(workDir, "direct-library-outcomes");
        const directBundle = await registry.build("outcomeLibrary", directPackageProject, directBundlePath);
        expect(fs.existsSync(directBundle.outputPath)).toBe(true);
        evidence.record({
            id: "library-build-outcome-library", artifactKind: "outcomeLibrary", operation: "build", registryOperation: "created_by",
            sourcePath: directPackage.outputPath, producedPath: directBundle.outputPath, owner: "ArtifactBuilderRegistry:build(outcomeLibrary)",
            result: "direct registry build published an Outcome Library from the generated package",
            observations: [{surface: "library", owner: "ArtifactBuilderRegistry:build(outcomeLibrary)", result: "build returned a published Outcome Library"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        const directBundleProject = await resolver.resolve(directBundle.outputPath);
        expect(directBundleProject?.type).toBe("outcomeLibrary");
        evidence.record({
            id: "library-resolve-direct-outcome-library", artifactKind: "outcomeLibrary", operation: "resolve", registryOperation: "recognized_by",
            sourcePath: directBundle.outputPath, owner: "ProjectTargetResolver", result: "direct resolver recognized the registry-produced Outcome Library",
            observations: [{surface: "library", owner: "ProjectTargetResolver", result: "resolve returned outcomeLibrary"}],
        });
        if (directBundleProject === undefined) throw new Error("Expected the direct Outcome Library build to resolve.");

        const directBundleReader = new OutcomeLibraryBundleReader();
        const directBundleManifest = await directBundleReader.readManifest(directBundle.outputPath);
        const directBundleLibrary = await directBundleReader.readLibrary(directBundle.outputPath, directBundleManifest.modes[0]!.modeName);
        expect(directBundleLibrary.outcomes.length).toBeGreaterThan(0);
        evidence.record({
            id: "library-read-direct-outcome-library", artifactKind: "outcomeLibrary", operation: "recognize", registryOperation: "recognized_by",
            sourcePath: directBundle.outputPath, owner: "OutcomeLibraryBundleReader", result: "direct bundle reader loaded the registry-produced Outcome Library",
            observations: [{surface: "library", owner: "OutcomeLibraryBundleReader", result: "readLibrary returned the generated mode outcomes"}],
        });
        const directBundleValidation = await directBundleReader.readLibrary(directBundle.outputPath, directBundleManifest.modes[0]!.modeName);
        expect(directBundleValidation.outcomes.length).toBeGreaterThan(0);
        evidence.record({
            id: "library-validate-direct-outcome-library", artifactKind: "outcomeLibrary", operation: "validate", registryOperation: "validates_by",
            sourcePath: directBundle.outputPath, owner: "OutcomeLibraryBundleReader", result: "direct bundle reader validated the registry-produced Outcome Library while reading its canonical mode",
            observations: [{surface: "library", owner: "OutcomeLibraryBundleReader", result: "readLibrary returned a complete valid canonical mode"}],
        });

        // The bundle writer is itself the consuming owner for a generated
        // canonical outcome stream.  Keep its source tied to the reader's
        // real returned library and retain the writer's actual publication.
        const directWriterBundlePath = path.join(workDir, "direct-library-writer-outcomes");
        const directWriterResult = await new OutcomeLibraryBundleWriter(POKIE_VERSION).writeToDirectory([{
            modeName: directBundleManifest.modes[0]!.modeName,
            libraryId: directBundleLibrary.libraryId,
            schemaVersion: directBundleLibrary.schemaVersion,
            outcomes: directBundleLibrary.outcomes,
            generator: directBundleManifest.modes[0]!.generator,
        }], directWriterBundlePath);
        expect(directWriterResult.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(fs.existsSync(directWriterBundlePath)).toBe(true);
        evidence.record({
            id: "library-write-canonical-outcomes", artifactKind: "canonicalOutcomeJsonl", operation: "write", registryOperation: "created_by",
            sourcePath: directBundle.outputPath, producedPath: directWriterBundlePath, owner: "OutcomeLibraryBundleWriter per-mode JSONL when a native bundle is later materialized",
            result: "direct bundle writer published canonical outcome JSONL from the reader-returned library",
            observations: [{surface: "library", owner: "OutcomeLibraryBundleWriter per-mode JSONL when a native bundle is later materialized", result: "writeToDirectory published the canonical outcome stream"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });

        const directStakePath = path.join(workDir, "direct-library-stake");
        const directStake = await registry.build("stakeAdapter", directBundleProject, directStakePath);
        expect(fs.existsSync(directStake.outputPath)).toBe(true);
        evidence.record({
            id: "library-build-stake-adapter", artifactKind: "stakeAdapter", operation: "build", registryOperation: "created_by",
            sourcePath: directBundle.outputPath, producedPath: directStake.outputPath, owner: "ArtifactBuilderRegistry:build(stakeAdapter)",
            result: "direct registry build published a Stake adapter from the generated Outcome Library",
            observations: [{surface: "library", owner: "ArtifactBuilderRegistry:build(stakeAdapter)", result: "build returned a published Stake adapter"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        const directStakeProject = await resolver.resolve(directStake.outputPath);
        expect(directStakeProject?.type).toBe("stakeAdapter");
        evidence.record({
            id: "library-resolve-direct-stake-adapter", artifactKind: "stakeAdapter", operation: "resolve", registryOperation: "recognized_by",
            sourcePath: directStake.outputPath, owner: "ProjectTargetResolver", result: "direct resolver recognized the registry-produced Stake adapter",
            observations: [{surface: "library", owner: "ProjectTargetResolver", result: "resolve returned stakeAdapter"}],
        });
        const directStakeRead = await new StakeEngineOutcomeSourceReader(new StakeEngineStandaloneValidator()).readFromDirectory(directStake.outputPath);
        expect(directStakeRead.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        evidence.record({
            id: "library-validate-direct-stake-adapter", artifactKind: "stakeAdapter", operation: "validate", registryOperation: "validates_by",
            sourcePath: directStake.outputPath, owner: "StakeEngineStandaloneValidator", result: "direct standalone validator accepted the reader-assembled Stake adapter",
            observations: [{surface: "library", owner: "StakeEngineStandaloneValidator", result: "validator returned no structural errors during direct reader execution"}],
        });
        const directStakeImport = await new StakeEngineImporter().importFromDirectory(directStake.outputPath);
        expect(directStakeImport.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        const directStakeExportValidation = new StakeEngineExportValidator().validate(directStakeImport.modes);
        expect(directStakeExportValidation.filter((issue) => issue.severity === "error")).toEqual([]);
        evidence.record({
            id: "library-export-validate-direct-stake-adapter", artifactKind: "stakeAdapter", operation: "validate-export", registryOperation: "validates_by",
            sourcePath: directStake.outputPath, owner: "StakeEngineExportValidator", result: "direct Stake export validator accepted modes imported from the registry-produced adapter",
            observations: [{surface: "library", owner: "StakeEngineExportValidator", result: "validate returned no export errors"}],
        });

        const directWorkbookPath = path.join(workDir, "direct-library.par.xlsx");
        const directWorkbook = await registry.build("parWorkbook", sourceProject, directWorkbookPath);
        expect(fs.existsSync(directWorkbook.outputPath)).toBe(true);
        evidence.record({
            id: "library-build-par-workbook", artifactKind: "parWorkbook", operation: "build", registryOperation: "created_by",
            sourcePath: importedBlueprintPath, producedPath: directWorkbook.outputPath, owner: "ArtifactBuilderRegistry:build(parWorkbook)",
            result: "direct registry build published a PAR workbook from the imported Blueprint",
            observations: [{surface: "library", owner: "ArtifactBuilderRegistry:build(parWorkbook)", result: "build returned a published PAR workbook"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        const directWorkbookProject = await resolver.resolve(directWorkbook.outputPath);
        expect(directWorkbookProject?.type).toBe("parWorkbook");
        evidence.record({
            id: "library-resolve-direct-par-workbook", artifactKind: "parWorkbook", operation: "resolve", registryOperation: "recognized_by",
            sourcePath: directWorkbook.outputPath, owner: "ProjectTargetResolver", result: "direct resolver recognized the registry-produced PAR workbook",
            observations: [{surface: "library", owner: "ProjectTargetResolver", result: "resolve returned parWorkbook"}],
        });
        const directParImport = await new ParSheetImporter().importFromFile(workbookPath);
        expect(directParImport.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        evidence.record({
            id: "library-import-par-workbook", artifactKind: "parWorkbook", operation: "validate", registryOperation: "validates_by",
            sourcePath: workbookPath, owner: "ParSheetImporter during import", result: "direct PAR importer accepted the runner-produced workbook",
            observations: [{surface: "library", owner: "ParSheetImporter during import", result: "importFromFile returned no errors"}],
        });
        const directPlan = await registry.preparePlan(sourceProject, "tsPackage", {destinationPath: path.join(workDir, "direct-library-preflight-package")});
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
            id: "package-generate-raw-outcomes", artifactKind: "weightedOutcomeLibraryJson", operation: "generate", sourcePath: packagePath,
            producedPath: rawLibraryPath, owner: "cli:outcomelibrary generate --out", registryOperation: "created_by", result: "published",
            observations: [{surface: "cli", owner: "cli:outcomelibrary generate --out", result: "exit 0"}],
        });
        const genericRawLibraryPath = path.join(workDir, "matrix-generic-library.json");
        expect(await new GenerateCommand(POKIE_VERSION).run([
            packagePath, "--sample", "8", "--seed", "matrix-generic-generation", "--out", genericRawLibraryPath, "--format", "json",
        ])).toBe(0);
        evidence.record({
            id: "package-generate-raw-outcomes-generic", artifactKind: "weightedOutcomeLibraryJson", operation: "generate:generic", sourcePath: packagePath,
            producedPath: genericRawLibraryPath, owner: "cli:generate --out", registryOperation: "created_by", result: "generic generation published a weighted Outcome Library JSON artifact",
            observations: [{surface: "cli", owner: "cli:generate --out", result: "generate --out exit 0"}],
        });
        fs.writeFileSync(descriptorPath, JSON.stringify({modes: [{modeName: "base", libraryPath: path.basename(rawLibraryPath)}]}));
        expect(await new OutcomeLibraryCommand(POKIE_VERSION).run(["build", descriptorPath, "--out", bundlePath])).toBe(0);
        evidence.record({
            id: "raw-outcomes-build-bundle", artifactKind: "weightedOutcomeLibraryJson", operation: "build", sourcePath: rawLibraryPath,
            producedPath: bundlePath, owner: "cli:outcomelibrary build", registryOperation: "recognized_by", result: "published",
            observations: [{surface: "cli", owner: "cli:outcomelibrary build", result: "exit 0"}],
        });
        evidence.record({
            id: "outcome-library-bundle-descriptor-build", artifactKind: "outcomeLibraryBundleDescriptor", operation: "build", sourcePath: descriptorPath,
            producedPath: bundlePath, owner: "OutcomeLibraryCommand", result: "descriptor consumed by the published bundle",
            observations: [{surface: "cli", owner: "OutcomeLibraryCommand", result: "build exit 0 consumed the descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcomelibrary-build-outcome-library", artifactKind: "outcomeLibrary", operation: "build", registryOperation: "created_by",
            sourcePath: descriptorPath, producedPath: bundlePath, owner: "cli:outcomelibrary build",
            result: "the public Outcome Library build published its bundle",
            observations: [{surface: "cli", owner: "cli:outcomelibrary build", result: "build exit 0 published the Outcome Library"}],
            systemicClasses: ["durable-publication-ownership"],
        });
        const delegatedExportBundlePath = path.join(workDir, "matrix-delegated-export-bundle");
        expect(await exportCommand.run([descriptorPath, "--to", "outcomes", "--out", delegatedExportBundlePath])).toBe(0);
        const delegatedExportManifest = JSON.parse(fs.readFileSync(path.join(delegatedExportBundlePath, "manifest.json"), "utf-8")) as {
            modes: {outcomesFile: string}[];
        };
        evidence.record({
            id: "export-outcome-library-weighted-json", artifactKind: "weightedOutcomeLibraryJson", operation: "export:outcomes-delegation", sourcePath: rawLibraryPath,
            producedPath: delegatedExportBundlePath, owner: "cli:export --to outcomes", registryOperation: "recognized_by", result: "the exercised descriptor export published the weighted outcome JSONL consumed by its bundle",
            observations: [{surface: "cli", owner: "cli:export --to outcomes", result: "export outcomes delegated to the Outcome Library writer"}],
        });
        evidence.record({
            id: "export-outcome-library-descriptor", artifactKind: "outcomeLibraryBundleDescriptor", operation: "export:outcomes-delegation", sourcePath: descriptorPath,
            producedPath: delegatedExportBundlePath, owner: "ExportCommand --to outcomes delegation to OutcomeLibraryCommand.build", result: "the exercised export owner consumed the generated descriptor through OutcomeLibraryCommand.build",
            observations: [{surface: "cli", owner: "ExportCommand", result: "export outcomes delegated to OutcomeLibraryCommand.build"}],
        });
        evidence.record({
            id: "export-outcome-library-canonical-jsonl", artifactKind: "canonicalOutcomeJsonl", operation: "export:outcomes-delegation", sourcePath: path.join(delegatedExportBundlePath, delegatedExportManifest.modes[0].outcomesFile),
            owner: "ExportCommand --to outcomes delegation to OutcomeLibraryCommand.build", result: "the exercised export owner published its canonical outcome JSONL",
            observations: [{surface: "cli", owner: "ExportCommand", result: "export outcomes delegated to OutcomeLibraryCommand.build"}],
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
        const rawBundleManifest = await new OutcomeLibraryBundleReader().readManifest(bundlePath);
        expect(rawBundleManifest.modes).toHaveLength(1);
        evidence.record({
            id: "library-read-outcome-library", artifactKind: "outcomeLibrary", operation: "recognize",
            sourcePath: bundlePath, owner: "OutcomeLibraryBundleReader", result: "direct bundle reader retained the produced Outcome Library manifest",
            observations: [{surface: "library", owner: "OutcomeLibraryBundleReader", result: "readManifest returned the generated mode"}],
        });
        evidence.record({
            id: "bundle-canonical-outcomes", artifactKind: "canonicalOutcomeJsonl", operation: "validate", sourcePath: path.join(bundlePath, bundleMode.outcomesFile),
            owner: "OutcomeLibraryCommand", result: "published as the bundle's canonical outcome stream",
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
        const delegatedStakeDescriptorPath = path.join(workDir, "matrix-delegated-stake-export.json");
        fs.writeFileSync(delegatedStakeDescriptorPath, JSON.stringify({modes: [{
            modeName: "base", cost: 1, bundleDir: path.basename(generatedBundlePath), bundleModeName: "base",
        }]}));
        const delegatedStakePath = path.join(workDir, "matrix-delegated-stake");
        expect(await exportCommand.run([delegatedStakeDescriptorPath, "--to", "adapter", "--out", delegatedStakePath])).toBe(0);
        evidence.record({
            id: "export-stake-descriptor", artifactKind: "stakeEngineExportDescriptor", operation: "export:adapter-delegation", sourcePath: delegatedStakeDescriptorPath,
            owner: "ExportCommand --to adapter delegation to StakeEngineCommand.export", result: "the exercised export owner consumed a descriptor bound to the runner-produced Outcome Library",
            observations: [{surface: "cli", owner: "ExportCommand", result: "export adapter delegated to StakeEngineCommand.export"}],
        });
        expect(await build.run([generatedBundlePath, "--target", "stakeAdapter", "--out", stakePath])).toBe(0);
        evidence.record({
            id: "outcome-library-export-stake", artifactKind: "outcomeLibrary", operation: "export", sourcePath: generatedBundlePath,
            producedPath: stakePath, owner: "BuildCommand", result: "Stake Engine export published",
            observations: [
                {surface: "cli", owner: "BuildCommand", result: "exit 0"},
                {surface: "library", owner: "ArtifactBuilderRegistry", result: "executed registry conversion"},
            ],
        });
        const builtStakeRead = await new StakeEngineOutcomeSourceReader().readFromDirectory(stakePath);
        expect(builtStakeRead.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        evidence.record({
            id: "library-read-stake-adapter", artifactKind: "stakeAdapter", operation: "recognize", registryOperation: "recognized_by",
            sourcePath: stakePath, owner: "StakeEngineOutcomeSourceReader", result: "direct Stake reader reconstructed runner-produced outcome modes",
            observations: [{surface: "library", owner: "StakeEngineOutcomeSourceReader", result: "readFromDirectory returned valid modes"}],
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
            // This is the generic user-authored descriptor. Its failure is a
            // real CLI observation, but its owner is not the distinct
            // `stakeImportReExportConfig` validation tuple in PC-05.
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
            id: "stake-engine-analysis-report", artifactKind: "stakeEngineAnalysisReport", operation: "analyze", registryOperation: "created_by", sourcePath: stakeAnalysisPath,
            owner: "cli:stakeengine analyze --out", result: "analysis report published from the generated Stake adapter",
            observations: [{surface: "cli", owner: "cli:stakeengine analyze --out", result: "stakeengine analyze --out exit 0"}],
        });
        evidence.record({
            id: "stake-engine-comparison-report", artifactKind: "stakeEngineComparisonReport", operation: "diff", registryOperation: "created_by", sourcePath: stakeComparisonPath,
            owner: "cli:stakeengine diff --out", result: "comparison report published from two real Stake exports",
            observations: [{surface: "cli", owner: "cli:stakeengine diff --out", result: "stakeengine diff --out exit 0"}],
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
            id: "stake-import-reexport-config", artifactKind: "stakeImportReExportConfig", operation: "export", registryOperation: "created_by", sourcePath: importConfigPath,
            owner: "cli:stakeengine import", result: "public import emitted a re-exportable Stake configuration",
            observations: [{surface: "cli", owner: "cli:stakeengine import", result: "import exit 0 wrote config.json"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "stake-import-source-provenance", artifactKind: "stakeImportSourceProvenance", operation: "inspect", registryOperation: "created_by", sourcePath: importProvenancePath,
            owner: "cli:stakeengine import", result: "public import retained source manifest, index, and mode provenance",
            observations: [{surface: "cli", owner: "cli:stakeengine import", result: "import exit 0 wrote source-provenance.json"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        const genericStakeImport = new ImportCommand(POKIE_VERSION);
        const genericStakeExplicitPath = path.join(workDir, "matrix-generic-stake-import");
        expect(await genericStakeImport.run([stakePath, "--out", genericStakeExplicitPath])).toBe(0);
        evidence.record({
            id: "stake-import-outcome-library-explicit-output", artifactKind: "outcomeLibrary", operation: "import:stake-explicit-output", sourcePath: stakePath,
            producedPath: genericStakeExplicitPath, owner: "cli:import --out", registryOperation: "created_by", result: "generic public import published the Stake Outcome Library at its explicit destination",
            observations: [{surface: "cli", owner: "cli:import --out", result: "import Stake --out exit 0"}],
        });
        evidence.record({
            id: "generic-import-reexport-config", artifactKind: "stakeImportReExportConfig", operation: "import:stake-config", sourcePath: path.join(genericStakeExplicitPath, "config.json"),
            owner: "cli:import", registryOperation: "created_by", result: "the exercised generic import published its re-exportable Stake configuration",
            observations: [{surface: "cli", owner: "cli:import", result: "import Stake --out wrote config.json"}],
        });
        evidence.record({
            id: "generic-import-source-provenance", artifactKind: "stakeImportSourceProvenance", operation: "import:stake-provenance", sourcePath: path.join(genericStakeExplicitPath, "source-provenance.json"),
            owner: "cli:import", registryOperation: "created_by", result: "the exercised generic import published its Stake source provenance",
            observations: [{surface: "cli", owner: "cli:import", result: "import Stake --out wrote source-provenance.json"}],
        });
        const genericStakeDefaultPath = `${stakePath}-imported`;
        expect(await genericStakeImport.run([stakePath])).toBe(0);
        expect(fs.existsSync(genericStakeDefaultPath)).toBe(true);
        evidence.record({
            id: "stake-import-outcome-library-default-output", artifactKind: "outcomeLibrary", operation: "import:stake-default-output", sourcePath: stakePath,
            producedPath: genericStakeDefaultPath, owner: "cli:import Stake without --out", registryOperation: "created_by", result: "generic public import published the Stake Outcome Library at its documented default destination",
            observations: [{surface: "cli", owner: "cli:import Stake without --out", result: "import Stake without --out exit 0"}],
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
        expect(reexportedStakeManifest.sourceProvenance).toEqual(importedSourceProvenance);
        evidence.record({
            id: "stake-import-reexport-stake", artifactKind: "stakeImportReExportConfig", operation: "re-export", sourcePath: importConfigPath,
            producedPath: reexportedStakePath, owner: "StakeEngineCommand", result: "public Stake re-export retained game identity, configuration hash, POKIE version, generation semantics, and imported source provenance",
            observations: [
                {surface: "cli", owner: "StakeEngineCommand", result: "stakeengine export imported config.json exit 0"},
                {surface: "library", owner: "StakeEngineCommand", result: "re-exported Stake manifest retained the original generation semantics"},
                {surface: "library", owner: "StakeEngineCommand", result: "re-exported Stake manifest retained the imported source-provenance manifest/index/mode hashes"},
            ],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        evidence.record({
            id: "stake-import-reexport-config-owner", artifactKind: "stakeImportReExportConfig", operation: "re-export", registryOperation: "recognized_by",
            sourcePath: importConfigPath, producedPath: reexportedStakePath, owner: "StakeEngineCommand:export",
            result: "Stake export consumed the imported re-export configuration and published the matching adapter",
            observations: [{surface: "cli", owner: "StakeEngineCommand:export", result: "stakeengine export consumed imported config.json"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        evidence.record({
            id: "stake-import-reexport-config-descriptor", artifactKind: "stakeImportReExportConfig", operation: "load-descriptor", registryOperation: "recognized_by",
            sourcePath: importConfigPath, producedPath: reexportedStakePath,
            owner: "StakeEngineCommand:loadDescriptor as a bundleDir-only re-export specialization",
            result: "Stake export loaded the imported bundle-directory re-export descriptor and published the matching adapter",
            observations: [{surface: "cli", owner: "StakeEngineCommand:loadDescriptor as a bundleDir-only re-export specialization", result: "stakeengine export resolved imported config.json as its re-export descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });
        evidence.recordScenario({
            id: "stake-outcome-library-round-trip", sourcePath: generatedBundlePath, producedPath: reexportedStakePath,
            result: "Outcome Library to Stake export, public import, and public re-export retain game identity, configuration hash, POKIE version, generation semantics, and source provenance",
            surface: "cli", owner: "StakeEngineCommand",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["imported library manifest matches the exported Stake manifest identity", "re-exported Stake manifest preserves each imported generation descriptor", "re-exported Stake manifest retains the imported source provenance manifest, index, and mode hashes"],
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
            owner: "cli:sample", registryOperation: "runs_by", result: "sampled", observations: [{surface: "cli", owner: "cli:sample", result: "exit 0"}],
        });
        await new SimCommand().run([bundlePath, "--mode", "base", "--rounds", "4", "--seed", "matrix-sim", "--out", simulationPath]);
        await new SimCommand().run([bundlePath, "--mode", "base", "--rounds", "5", "--seed", "matrix-sim-comparison", "--out", comparisonSimulationPath]);
        await new SimCommand().run([packagePath, "--rounds", "4", "--seed", "matrix-package-sim", "--out", packageSimulationPath]);
        await new SimCommand().run([packagePath, "--rounds", "5", "--seed", "matrix-package-sim-comparison", "--out", packageComparisonSimulationPath]);
        let allModesDiagnostic = "";
        try {
            await new SimCommand().run([packagePath, "--mode", "all", "--rounds", "2", "--seed", "matrix-all-modes"]);
        } catch (error) {
            allModesDiagnostic = error instanceof Error ? error.message : String(error);
        }
        expect(allModesDiagnostic).toMatch(/requires the game package to declare its bet modes via getBetModes/);
        await new ReplayCommand().run([bundlePath, "--mode", "base", "--round", "1", "--seed", "matrix-replay", "--out", replayPath]);
        expect(fs.existsSync(simulationPath)).toBe(true);
        expect(fs.existsSync(comparisonSimulationPath)).toBe(true);
        expect(fs.existsSync(packageSimulationPath)).toBe(true);
        expect(fs.existsSync(packageComparisonSimulationPath)).toBe(true);
        expect(fs.existsSync(replayPath)).toBe(true);
        evidence.record({
            id: "package-simulate", artifactKind: "tsPackage", operation: "simulate", sourcePath: packagePath,
            producedPath: packageSimulationPath, owner: "cli:sim", registryOperation: "runs_by", result: "published a seeded runtime simulation report",
            observations: [{surface: "cli", owner: "cli:sim", result: "sim --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "simulation-report-publish", artifactKind: "simulationReport", operation: "simulate", sourcePath: packagePath,
            producedPath: packageSimulationPath, owner: "cli:sim --out", registryOperation: "created_by", result: "published a seeded simulation report from the generated package",
            observations: [{surface: "cli", owner: "cli:sim --out", result: "sim --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
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
        // A package replay remains best-effort because it lacks an Outcome
        // Library identity, but its sampled game result must still be seeded
        // for the runner-owned evidence to be reproducible across processes.
        await new ReplayCommand().run([packagePath, "--round", "1", "--seed", "matrix-package-replay", "--out", packageReplayPath]);
        const packageReplay = JSON.parse(fs.readFileSync(packageReplayPath, "utf-8")) as {outcomeSource?: unknown; seed?: string | null};
        expect(packageReplay.outcomeSource).toBeUndefined();
        expect(packageReplay.seed).toBe("matrix-package-replay");
        evidence.record({
            id: "package-replay", artifactKind: "tsPackage", operation: "replay", sourcePath: packagePath,
            producedPath: packageReplayPath, owner: "cli:replay", registryOperation: "runs_by", result: "published a seeded best-effort runtime replay",
            observations: [{surface: "cli", owner: "cli:replay", result: "replay --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });

        // Serve has deliberately separate runtime-package and native
        // outcome-source routes. Exercise both generated artifacts while
        // retaining the command's start result without leaving an HTTP
        // listener open in this bounded CLI runner.
        const servedPaths: string[] = [];
        const servingStub = {
            start: () => Promise.resolve({host: "127.0.0.1", port: 0}),
        } as unknown as import("pokie").PokieDevServerHandling;
        expect(await new ServeCommand(loadPokieGame, () => {
            servedPaths.push("tsPackage");
            return servingStub;
        }).run([packagePath, "--port", "0"])).toBeUndefined();
        expect(await new ServeCommand(
            loadPokieGame,
            undefined,
            undefined,
            new ProjectTargetResolver(),
            (project, modeName) => {
                servedPaths.push(`${project.type}:${modeName}`);
                return servingStub;
            },
        ).run([bundlePath, "--mode", "base", "--port", "0"])).toBeUndefined();
        expect(servedPaths).toEqual(["tsPackage", "outcomeLibrary:base"]);
        evidence.record({
            id: "package-serve", artifactKind: "tsPackage", operation: "serve", sourcePath: packagePath,
            owner: "cli:serve", registryOperation: "runs_by", result: "started the runtime-package local server route",
            observations: [{surface: "cli", owner: "cli:serve", result: "serve --port 0 started the package route"}],
        });
        evidence.record({
            id: "outcome-library-serve", artifactKind: "outcomeLibrary", operation: "serve", sourcePath: bundlePath,
            owner: "cli:serve", registryOperation: "runs_by", result: "started the native outcome-source local server route",
            observations: [{surface: "cli", owner: "cli:serve", result: "serve --mode base --port 0 started the outcome-source route"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });

        // Keep an operation-level record produced by the public owners.  This
        // is intentionally written only after each command has completed: it
        // prevents the PC-14 evidence runner from treating a planned command
        // or a hand-authored fixture as an observed artifact operation.
        const reportPath = path.join(workDir, "matrix-report.md");
        expect(await new ValidateCommand().run([blueprintPath, "--format", "json", "--out", validationPath])).toBe(0);
        evidence.record({
            id: "blueprint-validate", artifactKind: "blueprint", operation: "validate", registryOperation: "recognized_by", sourcePath: blueprintPath,
            owner: "cli:validate", result: "valid", observations: [{surface: "cli", owner: "cli:validate", result: "exit 0"}],
        });
        evidence.record({
            id: "blueprint-validation-report", artifactKind: "validationReport", operation: "inspect", registryOperation: "created_by", sourcePath: validationPath,
            owner: "cli:validate --out", result: "published JSON validation report",
            observations: [{surface: "cli", owner: "cli:validate --out", result: "validate --out exit 0 wrote the report"}],
        });
        expect(await new InspectCommand().run([blueprintPath])).toBe(0);
        evidence.record({
            id: "blueprint-inspect", artifactKind: "blueprint", operation: "inspect", registryOperation: "recognized_by", sourcePath: blueprintPath,
            owner: "cli:inspect", result: "recognized", observations: [{surface: "cli", owner: "cli:inspect", result: "inspect Blueprint exit 0"}],
        });
        expect(await new InspectCommand().run([workbookPath])).toBe(0);
        evidence.record({
            id: "par-workbook-inspect", artifactKind: "parWorkbook", operation: "inspect", registryOperation: "recognized_by", sourcePath: workbookPath,
            owner: "cli:inspect", result: "recognized", observations: [{surface: "cli", owner: "cli:inspect", result: "inspect PAR workbook exit 0"}],
        });
        expect(await new ValidateCommand().run([bundlePath, "--deep", "--format", "json"])).toBe(0);
        evidence.record({
            id: "outcome-library-validate", artifactKind: "outcomeLibrary", operation: "validate", registryOperation: "validates_by", sourcePath: bundlePath,
            owner: "cli:validate --deep", result: "valid", observations: [{surface: "cli", owner: "cli:validate --deep", result: "exit 0"}],
        });
        expect(await new OutcomeLibraryCommand(POKIE_VERSION).run(["validate", bundlePath, "--deep"])).toBe(0);
        evidence.record({
            id: "outcome-library-command-validate", artifactKind: "outcomeLibrary", operation: "validate:outcomelibrary", registryOperation: "validates_by", sourcePath: bundlePath,
            owner: "cli:outcomelibrary-validate", result: "valid", observations: [{surface: "cli", owner: "cli:outcomelibrary-validate", result: "outcomelibrary validate --deep exit 0"}],
        });
        expect(await new InspectCommand().run([bundlePath])).toBe(0);
        evidence.record({
            id: "outcome-library-inspect", artifactKind: "outcomeLibrary", operation: "inspect", registryOperation: "recognized_by", sourcePath: bundlePath,
            owner: "cli:inspect", result: "recognized", observations: [{surface: "cli", owner: "cli:inspect", result: "exit 0"}],
        });
        expect(await new ValidateCommand().run([stakePath, "--format", "json"])).toBe(0);
        evidence.record({
            id: "stake-adapter-validate", artifactKind: "stakeAdapter", operation: "validate", registryOperation: "validates_by", sourcePath: stakePath,
            owner: "cli:validate", result: "valid", observations: [{surface: "cli", owner: "cli:validate", result: "validate Stake adapter exit 0"}],
        });
        expect(await new InspectCommand().run([stakePath])).toBe(0);
        evidence.record({
            id: "stake-adapter-inspect", artifactKind: "stakeAdapter", operation: "inspect", registryOperation: "recognized_by", sourcePath: stakePath,
            owner: "cli:inspect", result: "recognized", observations: [{surface: "cli", owner: "cli:inspect", result: "inspect Stake adapter exit 0"}],
        });
        await new ReportCommand().run([bundlePath, "--format", "markdown", "--out", reportPath]);
        await new ReportCommand().run([packageSimulationPath, "--format", "json", "--out", simulationJsonReportPath]);
        await new ReportCommand().run([packageSimulationPath, "--format", "html", "--out", renderedReportPath]);
        await new DiffCommand().run([packageSimulationPath, packageComparisonSimulationPath, "--out", simulationDiffPath]);
        await new DiffCommand().run([bundlePath, importedStakeLibraryPath, "--format", "json", "--out", outcomeDiffPath]);
        expect(await new OutcomeSourceCommand().run(["diff", bundlePath, importedStakeLibraryPath, "--format", "json", "--out", outcomeSourceCommandDiffPath])).toBe(0);
        expect(fs.existsSync(renderedReportPath)).toBe(true);
        expect(fs.existsSync(simulationJsonReportPath)).toBe(true);
        expect(fs.existsSync(simulationDiffPath)).toBe(true);
        expect(fs.existsSync(outcomeDiffPath)).toBe(true);
        expect(fs.existsSync(outcomeSourceCommandDiffPath)).toBe(true);
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
            producedPath: simulationPath, owner: "cli:sim", registryOperation: "runs_by", result: "published", observations: [{surface: "cli", owner: "cli:sim", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcome-library-replay", artifactKind: "outcomeLibrary", operation: "replay", sourcePath: bundlePath,
            producedPath: replayPath, owner: "cli:replay", registryOperation: "runs_by", result: "published", observations: [{surface: "cli", owner: "cli:replay", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcome-library-report", artifactKind: "outcomeLibrary", operation: "report", sourcePath: bundlePath,
            producedPath: reportPath, owner: "ReportCommand", result: "published", observations: [{surface: "cli", owner: "ReportCommand", result: "exit 0"}],
        });
        evidence.record({
            id: "outcome-source-analysis-report", artifactKind: "outcomeSourceAnalysisReport", operation: "report", sourcePath: reportPath,
            owner: "cli:report --out for outcome sources", registryOperation: "created_by", result: "analysis report published from the generated Outcome Library",
            observations: [{surface: "cli", owner: "cli:report --out for outcome sources", result: "report --out exit 0 rendered the Outcome Source Report"}],
        });
        evidence.record({
            id: "simulation-comparison-report", artifactKind: "simulationComparisonReport", operation: "diff", sourcePath: simulationDiffPath,
            owner: "cli:diff --out", registryOperation: "created_by", result: "published from two real simulation reports", observations: [{surface: "cli", owner: "cli:diff --out", result: "diff --out exit 0"}],
        });
        evidence.record({
            id: "outcome-source-comparison-report", artifactKind: "outcomeSourceComparisonReport", operation: "diff", sourcePath: outcomeDiffPath,
            owner: "cli:diff --out for outcome sources", registryOperation: "created_by", result: "published from real Outcome Library sources", observations: [{surface: "cli", owner: "cli:diff --out for outcome sources", result: "diff --out exit 0"}],
        });
        evidence.record({
            id: "outcome-source-command-comparison-report", artifactKind: "outcomeSourceComparisonReport", operation: "diff", sourcePath: outcomeSourceCommandDiffPath,
            owner: "cli:outcomesource diff --out", registryOperation: "created_by", result: "published from the outcome-source command's exact analyses",
            observations: [{surface: "cli", owner: "cli:outcomesource diff --out", result: "outcomesource diff --out exit 0"}],
        });
        evidence.record({
            id: "rendered-simulation-report", artifactKind: "renderedReport", operation: "render", sourcePath: renderedReportPath,
            owner: "cli:report --out for simulation reports", registryOperation: "created_by", result: "HTML report published from the real simulation report", observations: [{surface: "cli", owner: "cli:report --out for simulation reports", result: "report --format html --out exit 0"}],
        });
        evidence.record({
            id: "simulation-report-report", artifactKind: "simulationReport", operation: "report", sourcePath: packageSimulationPath,
            owner: "cli:report", registryOperation: "reports_by", result: "parsed the persisted simulation report for rendering",
            observations: [{surface: "cli", owner: "cli:report", result: "report consumed the simulation report"}],
        });
        evidence.record({
            id: "simulation-report-recognized-by-report", artifactKind: "simulationReport", operation: "recognize", sourcePath: packageSimulationPath,
            owner: "cli:report", registryOperation: "recognized_by", result: "recognized the persisted simulation report input",
            observations: [{surface: "cli", owner: "cli:report", result: "report recognized the simulation report"}],
        });
        evidence.record({
            id: "simulation-report-recognized-by-diff", artifactKind: "simulationReport", operation: "recognize", sourcePath: packageSimulationPath,
            owner: "cli:diff", registryOperation: "recognized_by", result: "recognized the persisted simulation report before comparison",
            observations: [{surface: "cli", owner: "cli:diff", result: "diff consumed the simulation report"}],
        });
        evidence.record({
            id: "rendered-simulation-report-report", artifactKind: "renderedReport", operation: "report", sourcePath: renderedReportPath,
            owner: "cli:report", registryOperation: "reports_by", result: "published a rendered view of the persisted simulation report",
            observations: [{surface: "cli", owner: "cli:report", result: "report --format html --out exit 0"}],
        });
        fs.writeFileSync(certificationConfigPath, JSON.stringify({modes: [{modeName: "base", seed: "matrix-evidence", sampleCount: 4}]}));
        const certification = new CertificationCommand(POKIE_VERSION);
        expect(await certification.run(["build", bundlePath, certificationConfigPath, "--out", certificationPath])).toBe(0);
        evidence.record({
            id: "certification-build-descriptor-build", artifactKind: "certificationBuildDescriptor", operation: "build", sourcePath: certificationConfigPath,
            producedPath: certificationPath, owner: "CertificationCommand:executeBuild", registryOperation: "recognized_by", result: "descriptor consumed by the published certification bundle",
            observations: [{surface: "cli", owner: "CertificationCommand:executeBuild", result: "build exit 0 consumed the descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "certification-build-descriptor-load", artifactKind: "certificationBuildDescriptor", operation: "load", sourcePath: certificationConfigPath,
            owner: "CertificationCommand:loadDescriptor", registryOperation: "recognized_by", result: "loaded the durable certification descriptor before build",
            observations: [{surface: "cli", owner: "CertificationCommand:loadDescriptor", result: "build loaded config modes[]"}],
        });
        evidence.record({
            id: "certification-build-descriptor-shape-validation", artifactKind: "certificationBuildDescriptor", operation: "validate", sourcePath: certificationConfigPath,
            owner: "CertificationCommand:loadDescriptor modes[] shape validation", registryOperation: "validates_by", result: "validated the durable modes[] descriptor shape",
            observations: [{surface: "cli", owner: "CertificationCommand:loadDescriptor modes[] shape validation", result: "build accepted valid modes[]"}],
        });
        evidence.record({
            id: "certification-build-source-validation", artifactKind: "certificationBuildDescriptor", operation: "validate-source", sourcePath: bundlePath,
            owner: "CertificationCommand:checkOutcomeLibrarySource", registryOperation: "validates_by", result: "validated the generated Outcome Library before certification sampling",
            observations: [{surface: "cli", owner: "CertificationCommand:checkOutcomeLibrarySource", result: "build accepted the resolved outcome-library source"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "outcome-library-certification", artifactKind: "outcomeLibrary", operation: "certification", sourcePath: bundlePath,
            producedPath: certificationPath, owner: "CertificationCommand", result: "published",
            observations: [{surface: "cli", owner: "CertificationCommand", result: "exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "certification-evidence-publish", artifactKind: "certificationEvidenceBundle", operation: "build", sourcePath: bundlePath,
            producedPath: certificationPath, owner: "cli:certification build --out", registryOperation: "created_by", result: "published a certification evidence bundle from the generated source",
            observations: [{surface: "cli", owner: "cli:certification build --out", result: "certification build --out exit 0"}],
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
            producedPath: simulationJsonReportPath, owner: "cli:report --format json --out for a SimulationReport", registryOperation: "created_by", result: "the real simulation output was parsed and re-emitted as JSON by the report owner",
            observations: [{surface: "cli", owner: "cli:report --format json --out for a SimulationReport", result: "report --format json --out consumed and re-emitted the simulation report"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.recordUnavailable({
            id: "simulation-report-set-mode-diagnostic", artifactKind: "simulationReportSet", operation: "simulate", sourcePath: packagePath,
            owner: "cli:sim --mode all", registryOperation: "created_by", diagnostic: {
                code: "missing-capability",
                message: allModesDiagnostic,
                recovery: "Use a package that declares bet modes before requesting a per-mode simulation report set.",
            },
            observations: [{surface: "cli", owner: "cli:sim --mode all", result: "sim --mode all returned its concrete missing getBetModes diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.record({
            id: "replay-descriptor-round-artifact", artifactKind: "runtimeReplayDescriptor", operation: "inspect", sourcePath: replayPath,
            owner: "cli:replay", registryOperation: "recognized_by", result: "portable replay descriptor retained exact outcome-source provenance",
            observations: [{surface: "cli", owner: "cli:replay", result: "replay --out wrote the inspected descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "round-artifact-replay-provenance", artifactKind: "roundArtifact", operation: "validate", sourcePath: replayPath,
            owner: "ReplayCommand", result: "recorded round artifact retained in the public replay descriptor",
            observations: [{surface: "cli", owner: "ReplayCommand", result: "replay --out published the descriptor containing the round artifact"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "runtime-replay-descriptor-publish", artifactKind: "runtimeReplayDescriptor", operation: "replay", sourcePath: bundlePath,
            producedPath: replayPath, owner: "cli:replay --out", registryOperation: "created_by", result: "published an exact outcome-source replay descriptor",
            observations: [{surface: "cli", owner: "cli:replay --out", result: "replay --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "runtime-replay-descriptor-replay", artifactKind: "runtimeReplayDescriptor", operation: "replay", sourcePath: replayPath,
            owner: "cli:replay", registryOperation: "replays_by", result: "replayed the persisted descriptor's source with its recorded seed and round",
            observations: [{surface: "cli", owner: "cli:replay", result: "replay produced the persisted descriptor"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "certification-evidence-bundle", artifactKind: "certificationEvidenceBundle", operation: "verify", sourcePath: certificationPath,
            owner: "cli:certification verify", registryOperation: "recognized_by", result: "verified against the generated Outcome Library",
            observations: [{surface: "cli", owner: "cli:certification verify", result: "verify exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-round-commitment-publish", artifactKind: "fairnessCommitment", operation: "commit", sourcePath: seedCommitmentPath,
            producedPath: commitmentPath, owner: "cli:fairness commit --out", registryOperation: "created_by", result: "generated round commitment from the public server-seed commitment",
            observations: [{surface: "cli", owner: "cli:fairness commit --out", result: "commit --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-server-seed-commitment-publish", artifactKind: "fairnessServerSeedCommitment", operation: "seed-commit", sourcePath: seedPath,
            producedPath: seedCommitmentPath, owner: "cli:fairness seed-commit --out", registryOperation: "created_by", result: "published the server-seed hash before the round commitment",
            observations: [{surface: "cli", owner: "cli:fairness seed-commit --out", result: "seed-commit --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-server-seed-commitment-recognition", artifactKind: "fairnessServerSeedCommitment", operation: "commit", sourcePath: seedCommitmentPath,
            owner: "cli:fairness commit", registryOperation: "recognized_by", result: "recognized the persisted server-seed commitment before pinning the round",
            observations: [{surface: "cli", owner: "cli:fairness commit", result: "commit consumed the server-seed commitment"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-round-proof", artifactKind: "fairnessProof", operation: "reveal", sourcePath: commitmentPath,
            producedPath: proofPath, owner: "cli:fairness reveal --out", registryOperation: "created_by", result: "generated and verified fairness proof",
            observations: [{surface: "cli", owner: "cli:fairness reveal --out", result: "reveal --out exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-round-proof", artifactKind: "fairnessProof", operation: "verify", sourcePath: proofPath,
            owner: "cli:fairness verify", registryOperation: "recognized_by", result: "verified exact bundle/library provenance",
            observations: [{surface: "cli", owner: "cli:fairness verify", result: "verify exit 0"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-commitment-reveal-recognition", artifactKind: "fairnessCommitment", operation: "reveal", sourcePath: commitmentPath,
            owner: "cli:fairness reveal", registryOperation: "recognized_by", result: "recognized the persisted round commitment for proof generation",
            observations: [{surface: "cli", owner: "cli:fairness reveal", result: "reveal consumed the round commitment"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "fairness-commitment-verify-recognition", artifactKind: "fairnessCommitment", operation: "verify", sourcePath: commitmentPath,
            owner: "cli:fairness verify", registryOperation: "recognized_by", result: "recognized the persisted round commitment for proof verification",
            observations: [{surface: "cli", owner: "cli:fairness verify", result: "verify consumed the round commitment"}],
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
        evidence.recordUnavailable({
            id: "wasm-outcome-source-simulate-diagnostic", artifactKind: "wasmComponent", operation: "diagnose:sim", sourcePath: wasmPath,
            owner: "describeUnavailableArtifactOperation", diagnostic: {
                code: simulationDiagnostic.code, message: simulationDiagnostic.message, recovery: simulationDiagnostic.recovery,
            },
            observations: [{surface: "library", owner: "describeUnavailableArtifactOperation", result: "returned the resolved WASM simulation diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
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
                        owner: "ArtifactBuilderRegistry.preparePlan",
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
        let simulationFailure: {readonly diagnostic: typeof simulationDiagnostic};
        try {
            await new SimCommand().run([wasmPath, "--rounds", "1"]);
            throw new Error("Expected SimCommand to reject the WASM component.");
        } catch (error) {
            expect(error).toMatchObject({
                name: "UnsupportedProjectOperationError",
                diagnostic: expect.objectContaining({
                    detectedType: "wasm",
                    operation: "sim",
                    message: simulationDiagnostic.message,
                    recovery: simulationDiagnostic.recovery,
                }),
            });
            simulationFailure = error as {readonly diagnostic: typeof simulationDiagnostic};
        }
        evidence.recordUnavailable({
            id: "wasm-outcome-source-simulate", artifactKind: "wasmComponent", operation: "simulate", sourcePath: wasmPath,
            owner: "SimCommand", diagnostic: {
                code: simulationFailure.diagnostic.code, message: simulationFailure.diagnostic.message,
                recovery: simulationFailure.diagnostic.recovery,
            },
            observations: [
                {surface: "library", owner: "ArtifactOperationDiagnostic", result: "resolved WASM diagnostic"},
                {surface: "cli", owner: "SimCommand", result: "rejected the same resolved WASM operation diagnostic"},
            ],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        const replayDiagnostic = describeUnavailableArtifactOperation(wasm, "replay");
        if (replayDiagnostic === undefined) throw new Error("Expected the public WASM replay diagnostic to include recovery.");
        evidence.recordUnavailable({
            id: "wasm-outcome-source-replay-diagnostic", artifactKind: "wasmComponent", operation: "diagnose:replay", sourcePath: wasmPath,
            owner: "describeUnavailableArtifactOperation", diagnostic: {
                code: replayDiagnostic.code, message: replayDiagnostic.message, recovery: replayDiagnostic.recovery,
            },
            observations: [{surface: "library", owner: "describeUnavailableArtifactOperation", result: "returned the resolved WASM replay diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        let replayFailure: {readonly diagnostic: typeof replayDiagnostic};
        try {
            await new ReplayCommand().run([wasmPath, "--round", "1"]);
            throw new Error("Expected ReplayCommand to reject the WASM component.");
        } catch (error) {
            expect(error).toMatchObject({
                name: "UnsupportedProjectOperationError",
                diagnostic: expect.objectContaining({
                    detectedType: "wasm",
                    operation: "replay",
                    message: replayDiagnostic.message,
                    recovery: replayDiagnostic.recovery,
                }),
            });
            replayFailure = error as {readonly diagnostic: typeof replayDiagnostic};
        }
        evidence.recordUnavailable({
            id: "wasm-outcome-source-replay", artifactKind: "wasmComponent", operation: "replay", sourcePath: wasmPath,
            owner: "ReplayCommand", diagnostic: {
                code: replayFailure.diagnostic.code, message: replayFailure.diagnostic.message, recovery: replayFailure.diagnostic.recovery,
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
        const emittedOwnerTuples = (JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {
            rows: {artifact_kind: string; registry_operation?: string; operation_owner: string; observations: {owner: string}[]}[];
        }).rows.flatMap((row) => row.registry_operation === undefined ? [] : row.observations
            .filter((observation) => observation.owner === row.operation_owner)
            .map(() => `${row.artifact_kind}:${row.registry_operation}:${row.operation_owner}`));
        // The ledger is only owner evidence when its public observation names
        // the command variant that actually ran. These aliases intentionally
        // cover explicit and default destinations across every CLI authoring,
        // import/export, recognition, and validation owner in this packet.
        expect(emittedOwnerTuples).toEqual(expect.arrayContaining([
            "blueprint:created_by:cli:par import --out",
            "blueprint:created_by:cli:par import without --out",
            "blueprint:created_by:cli:import --out for an XLSX source",
            "blueprint:created_by:cli:import XLSX without --out",
            "tsPackage:created_by:cli:build",
            "tsPackage:created_by:cli:build --target tsPackage --out",
            "tsPackage:created_by:cli:build --target tsPackage without --out",
            "outcomeLibrary:created_by:cli:build --target outcomeLibrary",
            "outcomeLibrary:created_by:cli:build --target outcomeLibrary --out",
            "outcomeLibrary:created_by:cli:build --target outcomeLibrary without --out",
            "outcomeLibrary:created_by:cli:export --to outcomes --out",
            "outcomeLibrary:created_by:cli:export --to outcomes without --out",
            "outcomeLibrary:created_by:cli:outcomelibrary build",
            "outcomeLibrary:created_by:cli:import --out",
            "outcomeLibrary:created_by:cli:import Stake without --out",
            "stakeAdapter:created_by:cli:build",
            "stakeAdapter:created_by:cli:build --target stakeAdapter --out",
            "stakeAdapter:created_by:cli:build --target stakeAdapter without --out",
            "stakeAdapter:created_by:cli:export --to adapter --out",
            "stakeAdapter:created_by:cli:export --to adapter without --out",
            "parWorkbook:created_by:cli:build --target parWorkbook --out",
            "parWorkbook:created_by:cli:build --target parWorkbook without --out",
            "parWorkbook:created_by:cli:par export --out",
            "parWorkbook:created_by:cli:par export without --out",
            "parWorkbook:created_by:cli:export --to workbook --out",
            "parWorkbook:created_by:cli:export --to workbook without --out",
            "weightedOutcomeLibraryJson:created_by:cli:outcomelibrary generate --out",
            "outcomeLibrary:recognized_by:cli:inspect",
            "outcomeLibrary:validates_by:cli:validate --deep",
            "validationReport:created_by:cli:validate --out",
            "stakeEngineAnalysisReport:created_by:cli:stakeengine analyze --out",
            "stakeEngineComparisonReport:created_by:cli:stakeengine diff --out",
            "stakeImportReExportConfig:created_by:cli:import",
            "stakeImportReExportConfig:created_by:cli:stakeengine import",
            "stakeImportReExportConfig:recognized_by:StakeEngineCommand:export",
            "stakeImportSourceProvenance:created_by:cli:import",
            "stakeImportSourceProvenance:created_by:cli:stakeengine import",
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
    }, 120000);
});
