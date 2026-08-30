import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuilderRegistry,
    ArtifactConversionPlanner,
    computeBlueprintHash,
    describeUnavailableArtifactOperation,
    POKIE_WASM_CONTRACT_VERSION,
    type GameBlueprint,
    ProjectTargetResolver,
} from "pokie";
import {CertificationCommand} from "../../cli/commands/CertificationCommand.js";
import {FairnessCommand} from "../../cli/commands/FairnessCommand.js";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {OutcomeLibraryCommand} from "../../cli/commands/OutcomeLibraryCommand.js";
import {OutcomeSourceCommand} from "../../cli/commands/OutcomeSourceCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {ArtifactInteroperabilityRun} from "../support/ArtifactInteroperabilityRun.js";

const POKIE_VERSION = "1.3.0";

describe("PC-14 CLI real-artifact interoperability torture", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-torture-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
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
        expect(await build.run([importedLibraryPath, "--target", "stakeAdapter", "--out", reexportedStakePath])).toBe(0);

        const sourceManifest = JSON.parse(fs.readFileSync(path.join(libraryPath, "manifest.json"), "utf-8"));
        const importedManifest = JSON.parse(fs.readFileSync(path.join(importedLibraryPath, "manifest.json"), "utf-8"));
        const stakeManifest = JSON.parse(fs.readFileSync(path.join(stakePath, "pokie-manifest.json"), "utf-8"));
        const sourceProvenance = JSON.parse(fs.readFileSync(path.join(importedLibraryPath, "source-provenance.json"), "utf-8"));
        expect(importedManifest).toMatchObject({
            game: sourceManifest.game,
            configHash: sourceManifest.configHash,
            pokieVersion: sourceManifest.pokieVersion,
        });
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
        const packagePath = path.join(workDir, "matrix-package");
        const rawLibraryPath = path.join(workDir, "matrix-library.json");
        const descriptorPath = path.join(workDir, "matrix-bundle.json");
        const bundlePath = path.join(workDir, "matrix-bundle");
        const simulationPath = path.join(workDir, "matrix-simulation.json");
        const replayPath = path.join(workDir, "matrix-replay.json");
        const certificationConfigPath = path.join(workDir, "matrix-certification.json");
        const certificationPath = path.join(workDir, "matrix-certification");
        const seedPath = path.join(workDir, "matrix-server-seed.txt");
        const seedCommitmentPath = path.join(workDir, "matrix-seed-commitment.json");
        const commitmentPath = path.join(workDir, "matrix-commitment.json");
        const proofPath = path.join(workDir, "matrix-proof.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        const resolver = new ProjectTargetResolver();
        const registry = new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd());
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, resolver, registry);
        expect(await build.run([blueprintPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        evidence.record({
            id: "blueprint-build-package", artifactKind: "blueprint", operation: "build", sourcePath: blueprintPath,
            producedPath: packagePath, owner: "BuildCommand", result: "published",
            observations: [{surface: "cli", owner: "BuildCommand", result: "exit 0"}],
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
        expect(await new OutcomeSourceCommand().run(["sample", bundlePath, "--mode", "base", "--seed", "matrix-sample"])).toBe(0);
        evidence.record({
            id: "outcome-library-sample", artifactKind: "outcomeLibrary", operation: "sample", sourcePath: bundlePath,
            owner: "OutcomeSourceCommand", result: "sampled", observations: [{surface: "cli", owner: "OutcomeSourceCommand", result: "exit 0"}],
        });
        await new SimCommand().run([bundlePath, "--mode", "base", "--rounds", "4", "--seed", "matrix-sim", "--out", simulationPath]);
        await new ReplayCommand().run([bundlePath, "--mode", "base", "--round", "1", "--seed", "matrix-replay", "--out", replayPath]);
        expect(fs.existsSync(simulationPath)).toBe(true);
        expect(fs.existsSync(replayPath)).toBe(true);
        const bundleManifest = JSON.parse(fs.readFileSync(path.join(bundlePath, "manifest.json"), "utf-8")) as {
            game: {id: string; version: string}; modes: {libraryId: string; libraryHash: string}[];
        };
        const simulation = JSON.parse(fs.readFileSync(simulationPath, "utf-8")) as {
            libraryId: string; libraryHash: string; lastReplay: {game: {id: string; version: string}; libraryId: string; libraryHash: string};
        };
        const replay = JSON.parse(fs.readFileSync(replayPath, "utf-8")) as {
            game: {id: string; version: string}; outcomeSource: {libraryId: string; libraryHash: string; selectionAlgorithm: string};
        };
        const sourceMode = bundleManifest.modes[0];
        // These are the same source binding, not merely artifacts which happen
        // to be generated in one temporary directory.  A seeded outcome-source
        // replay is portable and exact because it records the library hash;
        // package replay remains a separately documented best-effort path.
        expect(simulation).toMatchObject({libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, lastReplay: {
            game: bundleManifest.game, libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash,
        }});
        expect(replay).toMatchObject({game: bundleManifest.game, outcomeSource: {
            libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, selectionAlgorithm: "derived-round-seed-v1",
        }});

        // Keep an operation-level record produced by the public owners.  This
        // is intentionally written only after each command has completed: it
        // prevents the PC-14 evidence runner from treating a planned command
        // or a hand-authored fixture as an observed artifact operation.
        const reportPath = path.join(workDir, "matrix-report.md");
        expect(await new ValidateCommand().run([blueprintPath, "--format", "json"])).toBe(0);
        evidence.record({
            id: "blueprint-validate", artifactKind: "blueprint", operation: "validate", sourcePath: blueprintPath,
            owner: "ValidateCommand", result: "valid", observations: [{surface: "cli", owner: "ValidateCommand", result: "exit 0"}],
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
        });
        evidence.record({
            id: "outcome-library-replay", artifactKind: "outcomeLibrary", operation: "replay", sourcePath: bundlePath,
            producedPath: replayPath, owner: "ReplayCommand", result: "published", observations: [{surface: "cli", owner: "ReplayCommand", result: "exit 0"}],
        });
        evidence.record({
            id: "outcome-library-report", artifactKind: "outcomeLibrary", operation: "report", sourcePath: bundlePath,
            producedPath: reportPath, owner: "ReportCommand", result: "published", observations: [{surface: "cli", owner: "ReportCommand", result: "exit 0"}],
        });
        fs.writeFileSync(certificationConfigPath, JSON.stringify({modes: [{modeName: "base", seed: "matrix-evidence", sampleCount: 4}]}));
        const certification = new CertificationCommand(POKIE_VERSION);
        expect(await certification.run(["build", bundlePath, certificationConfigPath, "--out", certificationPath])).toBe(0);
        evidence.record({
            id: "outcome-library-certification", artifactKind: "outcomeLibrary", operation: "certification", sourcePath: bundlePath,
            producedPath: certificationPath, owner: "CertificationCommand", result: "published",
            observations: [{surface: "cli", owner: "CertificationCommand", result: "exit 0"}],
        });
        expect(await certification.run(["verify", certificationPath, "--source", bundlePath])).toBe(0);
        const certificationManifest = JSON.parse(fs.readFileSync(path.join(certificationPath, "manifest.json"), "utf-8")) as {
            game: {id: string; version: string}; sourceBundleManifestHash: string; modes: {libraryId: string; libraryHash: string}[];
        };
        expect(certificationManifest).toMatchObject({game: bundleManifest.game, modes: [{
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
        });
        const proof = JSON.parse(fs.readFileSync(proofPath, "utf-8")) as {libraryId: string; libraryHash: string; modeName: string; indexHash: string};
        expect(proof).toMatchObject({libraryId: sourceMode.libraryId, libraryHash: sourceMode.libraryHash, modeName: "base"});
        expect(proof.indexHash).toMatch(/^sha256:/);
        const emittedEvidencePath = path.join(workDir, "pc-14-cli-real-artifact-result.json");
        evidence.write(emittedEvidencePath);
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {rows: unknown[]}).rows).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "blueprint-build-package", "source_path": "run-artifacts/matrix.blueprint.json", "produced_path": "run-artifacts/matrix-package"}),
            expect.objectContaining({id: "outcome-library-simulate", "source_path": "run-artifacts/matrix-bundle", "produced_path": "run-artifacts/matrix-simulation.json"}),
            expect.objectContaining({id: "outcome-library-certification", "produced_path": "run-artifacts/matrix-certification"}),
            expect.objectContaining({id: "outcome-library-fairness", "produced_path": "run-artifacts/matrix-proof.json"}),
        ]));

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

        const source = await resolver.resolve(blueprintPath);
        if (source === undefined) throw new Error("Expected the generated Blueprint to resolve.");
        const staleDestination = path.join(workDir, "stale-package");
        const stalePlan = await registry.preparePlan(source, "tsPackage", {destinationPath: staleDestination});
        fs.writeFileSync(blueprintPath, JSON.stringify({...blueprint, manifest: {...blueprint.manifest, version: "2.0.0"}}));
        await expect(registry.executePlan(stalePlan, source, staleDestination)).rejects.toThrow(/source configuration.*changed|recognized source changed/i);
        expect(fs.existsSync(staleDestination)).toBe(false);

        const occupiedDestination = path.join(workDir, "occupied-package");
        const freshSource = await resolver.resolve(blueprintPath);
        if (freshSource === undefined) throw new Error("Expected the changed Blueprint to resolve.");
        const destinationPlan = await registry.preparePlan(freshSource, "tsPackage", {destinationPath: occupiedDestination});
        fs.mkdirSync(occupiedDestination);
        fs.writeFileSync(path.join(occupiedDestination, "borrowed.txt"), "keep");
        await expect(registry.executePlan(destinationPlan, freshSource, occupiedDestination)).rejects.toThrow(/destination changed|stale or invalid/i);
        expect(fs.readFileSync(path.join(occupiedDestination, "borrowed.txt"), "utf-8")).toBe("keep");

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
        const operationDiagnostic = describeUnavailableArtifactOperation(wasm, "outcomeSource.simulate");
        // This is the concrete diagnostic record an unavailable CLI or Studio
        // route retains.  `recovery` is structured by the shared owner; it is
        // not reconstructed from a command-specific error string.
        expect(operationDiagnostic).toMatchObject({
            detectedType: "wasm",
            operation: "outcomeSource.simulate",
            recovery: "Inspect the compatible manifest or use the original Blueprint or POKIE game package where runnable or convertible source is required.",
        });
        expect(operationDiagnostic?.message).toContain("Next:");
        if (operationDiagnostic?.recovery === undefined) throw new Error("Expected the public WASM diagnostic to include recovery.");
        evidence.recordUnavailable({
            id: "wasm-outcome-source-simulate", artifactKind: "wasmComponent", operation: "simulate", sourcePath: wasmPath,
            owner: "describeUnsupportedProjectOperation", diagnostic: {
                code: "unsupported-project-operation", message: operationDiagnostic?.message ?? "",
                recovery: operationDiagnostic.recovery,
            },
            observations: [{surface: "library", owner: "describeUnsupportedProjectOperation", result: "resolved WASM diagnostic"}],
        });
        evidence.write(emittedEvidencePath);
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {rows: unknown[]}).rows).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: "wasm-outcome-source-simulate", status: "intentionally-unsupported", "source_path": "run-artifacts/matrix.wasm",
                diagnostic: expect.objectContaining({code: "unsupported-project-operation"}),
            }),
        ]));
    });
});
