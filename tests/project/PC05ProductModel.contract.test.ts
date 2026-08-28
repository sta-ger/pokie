import fs from "fs";
import path from "path";
import {registerCliCommands} from "../../cli/registerCliCommands.js";

type InventoryItem = {
    id: string;
    type?: string;
    created_by?: string[];
    recognized_by?: string[];
    imports_from?: string[];
    exports_to?: string[];
    validates_by?: string[];
    prerequisite_for?: string[];
    provenance?: string;
    stale?: string;
    compatibility?: string;
    containment?: string;
    diagnostics?: string;
    recovery?: string;
    support_status?: string;
};

type ProductModelRegistry = {
    schema_version: number;
    reference_fields: Array<keyof InventoryItem>;
    artifact_kinds: InventoryItem[];
    non_artifact_prerequisites: InventoryItem[];
    persisted_public_output_contracts: PersistedPublicOutputContract[];
};

type PersistedPublicOutputContract = {
    id: string;
    producer: string;
    artifact_id: string;
    command_file: string;
    persistence_trigger: string;
};

const PRODUCT_MODEL_DIR = path.join(__dirname, "..", "..", "docs", "evidence", "phase7-product-coherence", "pc-05-product-model");
const REGISTRY_PATH = path.join(PRODUCT_MODEL_DIR, "artifact-registry.json");
const MATRIX_PATH = path.join(PRODUCT_MODEL_DIR, "CAPABILITY-MATRIX.md");
const PRODUCT_MODEL_PATH = path.join(PRODUCT_MODEL_DIR, "PRODUCT-MODEL.md");

function readRegistry(): ProductModelRegistry {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")) as ProductModelRegistry;
}

function closureRow(matrix: string, id: string): string {
    const row = matrix.split("\n").find((line) => line.startsWith(`| ${id} |`));
    if (row === undefined) throw new Error(`Missing PC-05 closure row ${id}.`);
    return row;
}

function closureOwner(matrix: string, id: string): string {
    const cells = closureRow(matrix, id).split("|");
    const owner = cells[5]?.trim();
    if (owner === undefined || owner.length === 0) throw new Error(`Missing PC-05 closure owner for ${id}.`);
    return owner;
}

function acceptanceOwnershipRow(productModel: string, step: string): string {
    const row = productModel.split("\n").find((line) => line.startsWith(`| ${step} `));
    if (row === undefined) throw new Error(`Missing PC-05 acceptance ownership row for ${step}.`);
    return row;
}

type CommanderSurface = {
    options: Array<{flags: string}>;
    commands: CommanderSurface[];
    name(): string;
};

type PublicPersistenceSurface = {route: string; option: "--out" | "--resume"};

// This starts with the real public Commander tree, rather than registry ids or
// command-file names. Any newly registered public leaf that exposes --out or
// --resume has to be represented by a ledger producer before this test passes.
function publicPersistenceSurfaces(): PublicPersistenceSurface[] {
    const roots = registerCliCommands({
        version: "test-version",
        pokiePackageRoot: "/fake/pokie/root",
        clientRoot: "/fake/pokie/root/dist/cli/client",
        studioRoot: "/fake/pokie/root/dist/cli/studio-client",
    }).filter((command) => command.getName() !== "__studio").map((command) => command.getCommanderCommand() as unknown as CommanderSurface);
    const surfaces: PublicPersistenceSurface[] = [];
    const visit = (command: CommanderSurface, parentRoute: string[]): void => {
        const route = [...parentRoute, command.name()].join(" ");
        for (const option of command.options) {
            for (const persistenceOption of ["--out", "--resume"] as const) {
                if (option.flags.includes(persistenceOption)) {
                    surfaces.push({route, option: persistenceOption});
                }
            }
        }
        command.commands.forEach((child) => visit(child, [...parentRoute, command.name()]));
    };
    roots.forEach((root) => visit(root, []));
    return surfaces;
}

function operationOwner(matrix: string, operation: string): string {
    const row = matrix.split("\n").find((line) => line.startsWith(`| ${operation} |`));
    if (row === undefined) throw new Error(`Missing capability-matrix operation ${operation}.`);
    const owner = row.split("|")[8]?.trim();
    if (owner === undefined || owner.length === 0) throw new Error(`Missing owner for ${operation}.`);
    return owner;
}

describe("PC-05 product-model contract", () => {
    it("closes the artifact graph and inventories sources, descriptors, runtime state, durable registries, portable rounds, Stake-import companions and the three fairness artifacts", () => {
        const registry = readRegistry();
        const items = [...registry.artifact_kinds, ...registry.non_artifact_prerequisites];
        const ids = items.map((item) => item.id);

        expect(registry.schema_version).toBeGreaterThanOrEqual(2);
        expect(new Set(ids).size).toBe(ids.length);
        expect(registry.reference_fields).toEqual(["imports_from", "exports_to", "prerequisite_for"]);
        for (const prerequisite of registry.non_artifact_prerequisites) {
            expect(prerequisite.type).toBe("non-artifact-prerequisite");
        }
        for (const artifact of registry.artifact_kinds) {
            for (const field of registry.reference_fields) {
                for (const reference of artifact[field] ?? []) {
                    expect(ids).toContain(reference);
                }
            }
        }

        expect(ids).toEqual(
            expect.arrayContaining([
                "blueprint",
                "studioSymbolArtworkPng",
                "tsPackage",
                "parWorkbook",
                "weightedOutcomeLibraryJson",
                "canonicalOutcomeJsonl",
                "outcomeLibraryBundleDescriptor",
                "outcomeLibraryGenerationCheckpoint",
                "outcomeLibrary",
                "stakeEngineExportDescriptor",
                "stakeAdapter",
                "wasmComponent",
                "roundArtifact",
                "runtimeSession",
                "fileSessionRepositoryRecord",
                "simulationReport",
                "simulationReportSet",
                "validationReport",
                "simulationComparisonReport",
                "outcomeSourceComparisonReport",
                "stakeEngineAnalysisReport",
                "stakeEngineComparisonReport",
                "outcomeSourceAnalysisReport",
                "renderedReport",
                "runtimeReplayDescriptor",
                "certificationEvidenceBundle",
                "certificationBuildDescriptor",
                "blueprintRuntimeMaterializationCache",
                "blueprintRuntimeMaterializationMarker",
                "fairnessServerSeedCommitment",
                "fairnessCommitment",
                "fairnessProof",
                "externalDeploymentArtifact",
                "managedOutcomeProjectsRegistry",
                "studioOutcomeLibraryRegistryIndex",
                "stakeImportReExportConfig",
                "stakeImportSourceProvenance",
            ]),
        );
        const roundArtifact = registry.artifact_kinds.find((item) => item.id === "roundArtifact");
        expect(roundArtifact?.imports_from).toEqual(expect.arrayContaining(["tsPackage", "outcomeLibrary", "runtimeSession"]));
        expect(roundArtifact?.exports_to).toEqual(expect.arrayContaining(["runtimeReplayDescriptor", "certificationEvidenceBundle"]));
        const fileSessionRecord = registry.artifact_kinds.find((item) => item.id === "fileSessionRepositoryRecord");
        expect(fileSessionRecord).toEqual(expect.objectContaining({
            label: "FileSessionRepository session-state record",
            "imports_from": ["runtimeSession"],
            "exports_to": ["runtimeSession"],
            "prerequisite_for": ["runtimeSession"],
            "support_status": "supported-opt-in-durable-server-state-with-cross-process-consistency-limit",
            provenance: expect.stringContaining("legacy raw PokieSessionState"),
            stale: expect.stringContaining("wallet/idempotency"),
            compatibility: expect.stringContaining("VersionedSessionRepository"),
            containment: expect.stringContaining("SHA-256"),
            diagnostics: expect.stringContaining("404"),
            recovery: expect.stringContaining("cross-process atomicity"),
        }));
        expect(fileSessionRecord?.shape).toContain("not a project artifact, replay descriptor");
        const stakeImportConfig = registry.artifact_kinds.find((item) => item.id === "stakeImportReExportConfig");
        expect(stakeImportConfig?.imports_from).toEqual(expect.arrayContaining(["stakeAdapter", "outcomeLibrary"]));
        const outcomeLibraryDescriptor = registry.artifact_kinds.find((item) => item.id === "outcomeLibraryBundleDescriptor");
        const stakeExportDescriptor = registry.artifact_kinds.find((item) => item.id === "stakeEngineExportDescriptor");
        for (const descriptor of [outcomeLibraryDescriptor, stakeExportDescriptor]) {
            expect(descriptor).toEqual(expect.objectContaining({
                provenance: expect.any(String),
                stale: expect.any(String),
                compatibility: expect.any(String),
                containment: expect.any(String),
                diagnostics: expect.any(String),
                recovery: expect.any(String),
                "support_status": "supported-user-supplied-prerequisite-contract",
            }));
        }
        expect(outcomeLibraryDescriptor).toEqual(expect.objectContaining({
            label: "Outcome Library bundle descriptor",
            "created_by": ["user-authored Outcome Library bundle config (POKIE does not create this descriptor)"],
            "imports_from": expect.arrayContaining(["weightedOutcomeLibraryJson", "canonicalOutcomeJsonl"]),
            "exports_to": ["outcomeLibrary"],
        }));
        expect(outcomeLibraryDescriptor?.compatibility).toContain("outcomesPath");
        expect(stakeExportDescriptor).toEqual(expect.objectContaining({
            label: "Stake Engine export descriptor",
            "created_by": ["user-authored Stake Engine export config (POKIE does not create the generic descriptor)"],
            "imports_from": expect.arrayContaining(["weightedOutcomeLibraryJson", "outcomeLibrary"]),
            "exports_to": ["stakeAdapter"],
        }));
        expect(stakeExportDescriptor?.compatibility).toContain("bundleModeName");
        expect(stakeImportConfig).toEqual(expect.objectContaining({
            label: "Stake-import re-export configuration",
            compatibility: expect.stringContaining("specialization of the generic Stake Engine export descriptor"),
            provenance: expect.stringContaining("unlike the user-authored generic stakeEngineExportDescriptor"),
        }));
        const rawLibrary = registry.artifact_kinds.find((item) => item.id === "weightedOutcomeLibraryJson");
        const generationCheckpoint = registry.artifact_kinds.find((item) => item.id === "outcomeLibraryGenerationCheckpoint");
        const outcomeLibrary = registry.artifact_kinds.find((item) => item.id === "outcomeLibrary");
        expect(rawLibrary).toEqual(
            expect.objectContaining({
                "label": "WeightedOutcomeLibrary JSON",
                "created_by": expect.arrayContaining(["cli:generate --out", "cli:outcomelibrary generate --out"]),
                "recognized_by": expect.arrayContaining(["cli:export --to outcomes"]),
                "imports_from": ["tsPackage"],
                "exports_to": expect.arrayContaining(["outcomeLibrary"]),
                "prerequisite_for": expect.arrayContaining(["outcomeLibrary"]),
            }),
        );
        expect(generationCheckpoint).toEqual(
            expect.objectContaining({
                "label": "ExactEnumerationCheckpoint",
                "created_by": expect.arrayContaining(["cli:generate --resume on cancellation"]),
                "recognized_by": expect.arrayContaining(["cli:generate --resume"]),
                "exports_to": ["weightedOutcomeLibraryJson"],
                "prerequisite_for": ["weightedOutcomeLibraryJson"],
            }),
        );
        expect(outcomeLibrary?.created_by).not.toContain("cli:generate");
        expect(outcomeLibrary).toEqual(
            expect.objectContaining({
                "imports_from": expect.arrayContaining(["weightedOutcomeLibraryJson"]),
                "created_by": expect.arrayContaining(["cli:outcomelibrary build", "studio:outcome-library-generate"]),
            }),
        );
        expect(rawLibrary?.recovery).toContain("pokie export <config.json> --to outcomes --out <dir>");
        expect(registry.artifact_kinds.find((item) => item.id === "studioSymbolArtworkPng")).toEqual(
            expect.objectContaining({
                "label": "Studio Symbol Artwork PNG",
                "shape": expect.stringContaining("separate"),
                "created_by": expect.arrayContaining(["studio:blueprint-symbol-artwork-import (temporary staging)", "studio:blueprint-save/materializeSymbolArtwork"]),
                "recognized_by": expect.arrayContaining([
                    "StudioBlueprintService:resolveSymbolArtwork",
                    "studio:editor SymbolPresentation",
                    "studio:player CanonicalPlayerView (Studio adapter resolves declared references and supplies URLs)",
                ]),
                provenance: expect.stringContaining("not embedded"),
                stale: expect.stringContaining("session-local"),
                compatibility: expect.stringContaining("assets/symbols/"),
                recovery: expect.stringContaining("404"),
            }),
        );
        for (const artifactId of [
            "weightedOutcomeLibraryJson",
            "outcomeLibraryGenerationCheckpoint",
            "validationReport",
            "simulationComparisonReport",
            "outcomeSourceComparisonReport",
            "stakeEngineAnalysisReport",
            "stakeEngineComparisonReport",
            "outcomeSourceAnalysisReport",
            "renderedReport",
        ]) {
            expect(registry.artifact_kinds.find((item) => item.id === artifactId)).toEqual(
                expect.objectContaining({
                    provenance: expect.any(String),
                    stale: expect.any(String),
                    compatibility: expect.any(String),
                    recovery: expect.any(String),
                }),
            );
        }
        expect(registry.artifact_kinds.find((item) => item.id === "validationReport")?.created_by).toEqual(["cli:validate --out"]);
        expect(registry.artifact_kinds.find((item) => item.id === "simulationComparisonReport")?.created_by).toEqual(["cli:diff --out"]);
        expect(registry.artifact_kinds.find((item) => item.id === "outcomeSourceComparisonReport")?.created_by).toEqual(
            expect.arrayContaining(["cli:diff --out for outcome sources", "cli:outcomesource diff --out"]),
        );
        expect(registry.artifact_kinds.find((item) => item.id === "stakeEngineAnalysisReport")?.created_by).toEqual(["cli:stakeengine analyze --out"]);
        expect(registry.artifact_kinds.find((item) => item.id === "stakeEngineComparisonReport")?.created_by).toEqual(["cli:stakeengine diff --out"]);
        expect(registry.artifact_kinds.find((item) => item.id === "outcomeSourceAnalysisReport")?.created_by).toEqual(["cli:report --out for outcome sources"]);
        expect(registry.artifact_kinds.find((item) => item.id === "simulationReport")?.created_by).toEqual(
            expect.arrayContaining(["cli:sim --out", "cli:report --format json --out for a SimulationReport"]),
        );
        expect(registry.artifact_kinds.find((item) => item.id === "simulationReportSet")?.created_by).toEqual(
            expect.arrayContaining(["cli:sim --mode all", "cli:report --format json --out for a SimulationReportSet"]),
        );
        const serverSeedCommitment = registry.artifact_kinds.find((item) => item.id === "fairnessServerSeedCommitment");
        const fairnessCommitment = registry.artifact_kinds.find((item) => item.id === "fairnessCommitment");
        const fairnessProof = registry.artifact_kinds.find((item) => item.id === "fairnessProof");
        expect(serverSeedCommitment).toEqual(
            expect.objectContaining({
                "label": "FairnessServerSeedCommitment",
                "created_by": expect.arrayContaining(["cli:fairness seed-commit", "studio:fairness-configure"]),
                "recognized_by": expect.arrayContaining(["computeFairnessCommitment", "cli:fairness commit", "studio:fairness-configure"]),
                "imports_from": ["serverSeedFile"],
                "exports_to": ["fairnessCommitment"],
                "validates_by": expect.arrayContaining(["FairnessServerSeedCommitmentValidator"]),
                "prerequisite_for": ["fairnessCommitment"],
            }),
        );
        expect(fairnessCommitment).toEqual(
            expect.objectContaining({
                "label": "FairnessCommitment",
                "created_by": expect.arrayContaining(["cli:fairness commit", "studio:fairness-configure"]),
                "recognized_by": expect.arrayContaining(["cli:fairness reveal", "cli:fairness verify", "studio:fairness-generate", "studio:fairness-verify"]),
                "imports_from": ["fairnessServerSeedCommitment", "outcomeLibrary"],
                "exports_to": ["fairnessProof"],
                "validates_by": expect.arrayContaining(["FairnessCommitmentValidator"]),
                "prerequisite_for": ["fairnessProof"],
            }),
        );
        expect(fairnessProof).toEqual(expect.objectContaining({"label": "FairnessRoundProof"}));
        expect(fairnessProof?.imports_from).toEqual(expect.arrayContaining(["fairnessCommitment", "serverSeedFile", "outcomeLibrary"]));
        for (const nonArtifactId of ["stakeAdapterImport", "simulationReplayDescriptor", "studioReplayDownload", "wasmPackagingPreflight"]) {
            expect(registry.non_artifact_prerequisites).toContainEqual(expect.objectContaining({id: nonArtifactId, type: "non-artifact-prerequisite"}));
        }

        for (const metadataId of ["managedOutcomeProjectsRegistry", "studioOutcomeLibraryRegistryIndex"]) {
            expect(registry.artifact_kinds.find((item) => item.id === metadataId)).toEqual(
                expect.objectContaining({
                    provenance: expect.any(String),
                    stale: expect.any(String),
                    compatibility: expect.any(String),
                    recovery: expect.any(String),
                    "support_status": "supported-durable-metadata-companion",
                }),
            );
        }
        expect(registry.artifact_kinds.find((item) => item.id === "managedOutcomeProjectsRegistry")).toEqual(
            expect.objectContaining({
                shape: expect.stringContaining(".pokie/managed-outcome-projects.json"),
                "created_by": expect.arrayContaining(["ManagedOutcomeProjectService:registerAndOpen"]),
                "recognized_by": expect.arrayContaining(["ManagedOutcomeProjectService:findCompatible"]),
                "validates_by": expect.arrayContaining(["OutcomeLibraryBundleReader manifest read", "ProjectTargetResolver"]),
            }),
        );
        expect(registry.artifact_kinds.find((item) => item.id === "studioOutcomeLibraryRegistryIndex")).toEqual(
            expect.objectContaining({
                shape: expect.stringContaining(".pokie/outcome-library-registry.json"),
                "created_by": ["StudioOutcomeLibraryGenerateService:recordDiscoveredBundleDir after successful generate"],
                "recognized_by": expect.arrayContaining(["StudioOutcomeLibraryGenerateService:readRegistryIndex", "StudioOutcomeLibraryGenerateService:registry"]),
                "validates_by": expect.arrayContaining(["resolveProjectDirectory containment/realpath check", "OutcomeLibraryBundleReader manifest read"]),
            }),
        );
    });

    it("source-backs both descriptor prerequisites and their public export delegation", () => {
        const registry = readRegistry();
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const outcomeLibraryCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "OutcomeLibraryCommand.ts"), "utf-8");
        const stakeEngineCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "StakeEngineCommand.ts"), "utf-8");
        const exportCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "ExportCommand.ts"), "utf-8");

        expect(outcomeLibraryCommand).toContain("private loadDescriptor(configPath: string): BuildDescriptor");
        expect(outcomeLibraryCommand).toContain('must specify exactly one of "libraryPath" or "outcomesPath"');
        expect(outcomeLibraryCommand).toContain('uses "outcomesPath" and so requires a string "libraryId"');
        expect(stakeEngineCommand).toContain("private loadDescriptor(configPath: string): ExportDescriptor");
        expect(stakeEngineCommand).toContain('must specify exactly one of "libraryPath" or "bundleDir"');
        expect(stakeEngineCommand).toContain('must have a string "modeName" and a number "cost"');
        expect(exportCommand).toContain('this.outcomeLibrary.run(["build", ...forwarded])');
        expect(exportCommand).toContain('this.stake.run(["export", ...forwarded])');

        const outcomeDescriptor = registry.artifact_kinds.find((item) => item.id === "outcomeLibraryBundleDescriptor");
        const stakeDescriptor = registry.artifact_kinds.find((item) => item.id === "stakeEngineExportDescriptor");
        expect(outcomeDescriptor?.recognized_by).toEqual(expect.arrayContaining([
            "OutcomeLibraryCommand:loadDescriptor",
            "ExportCommand --to outcomes delegation to OutcomeLibraryCommand.build",
        ]));
        expect(stakeDescriptor?.recognized_by).toEqual(expect.arrayContaining([
            "StakeEngineCommand:loadDescriptor",
            "ExportCommand --to adapter delegation to StakeEngineCommand.export",
        ]));
        expect(matrix).toContain("canonical `outcomeLibraryBundleDescriptor`");
        expect(matrix).toContain("canonical `stakeEngineExportDescriptor`");
        expect(matrix).toContain("POKIE-created `stakeImportReExportConfig`");
        expect(productModel).toContain("`outcomeLibraryBundleDescriptor`");
        expect(productModel).toContain("`stakeEngineExportDescriptor`");
        expect(productModel).toContain("`stakeImportReExportConfig`");
    });

    it("source-backs the opt-in durable FileSessionRepository contract without treating server state as a project or replay artifact", () => {
        const registry = readRegistry();
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const repository = fs.readFileSync(path.join(__dirname, "..", "..", "src", "server", "session", "FileSessionRepository.ts"), "utf-8");
        const server = fs.readFileSync(path.join(__dirname, "..", "..", "src", "server", "PokieDevServer.ts"), "utf-8");
        const rootIndex = fs.readFileSync(path.join(__dirname, "..", "..", "src", "index.ts"), "utf-8");
        const cliDocs = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "cli.md"), "utf-8");

        expect(repository).toContain("export class FileSessionRepository implements VersionedSessionRepository");
        expect(repository).toContain('createHash("sha256").update(sessionId).digest("hex")');
        expect(repository).toContain(["return path.join(this.directory, `", String.fromCharCode(36), "{fileName}.json`)"].join(""));
        expect(repository).toContain("return {version: 0, state: parsed as unknown as PokieSessionState}");
        expect(repository).toContain("} catch {\n            return undefined;");
        expect(repository).toContain("there is no OS-level file lock");
        expect(server).toContain("this.sessionRepository = options.sessionRepository ?? new InMemorySessionRepository()");
        expect(server).toContain("await this.sessionRepository.save(sessionId, state)");
        expect(server).toContain("await this.sessionRepository.loadVersioned(sessionId)");
        expect(server).toContain(["this.sendJson(res, 404, {error: `Unknown sessionId \"", String.fromCharCode(36), "{sessionId}\".`})"].join(""));
        expect(rootIndex).toContain('export * from "./server/session/FileSessionRepository.js"');
        expect(cliDocs).toContain("`FileSessionRepository` — one JSON file per session under a directory you choose");
        expect(cliDocs).toContain("ids are hashed into filenames");
        expect(cliDocs).toContain("no OS-level file lock");
        expect(cliDocs).toContain("sessionRepository: new FileSessionRepository(\"./sessions\")");

        const record = registry.artifact_kinds.find((item) => item.id === "fileSessionRepositoryRecord");
        expect(record?.created_by).toEqual(expect.arrayContaining([
            "PokieDevServer:POST /sessions via configured FileSessionRepository.save",
            "SpinCommandHandler:POST /sessions/:id/spin via configured FileSessionRepository.save/saveVersioned",
        ]));
        expect(record?.recognized_by).toEqual(expect.arrayContaining([
            "FileSessionRepository:load/loadVersioned",
            "PokieDevServer:GET /sessions/:id",
            "SpinCommandHandler cache-miss session reconstruction after restart",
        ]));
        expect(record?.shape).toContain("not a project artifact, replay descriptor, round record, or wallet ledger");
        expect(matrix).toContain("| Persist a dev-server session across restart |");
        expect(matrix).toContain("`serve` itself always uses process-local `InMemorySessionRepository`");
        expect(matrix).toContain("no OS lock closes a two-process shared-directory race");
        expect(productModel).toContain("The dev server has a separate, opt-in durable session boundary.");
        expect(productModel).toContain("This\nrecord is mutable server state, not a Blueprint/project asset, RoundArtifact,");
        expect(productModel).toMatch(/two repository\nobjects\/processes sharing a directory can still race and lose one write/);
    });

    it("source-backs streamed outcomes, certification descriptors, runtime cache state and persisted Studio Projects", () => {
        const registry = readRegistry();
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const outcomeLibraryCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "OutcomeLibraryCommand.ts"), "utf-8");
        const certificationCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "CertificationCommand.ts"), "utf-8");
        const materializer = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "materialize", "BlueprintProjectMaterializer.ts"), "utf-8");
        const runtimeResolver = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "materialize", "materializeRuntimePackage.ts"), "utf-8");
        const cliRegistration = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "registerCliCommands.ts"), "utf-8");
        const studioCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "StudioCommand.ts"), "utf-8");
        const studioServer = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio", "StudioServer.ts"), "utf-8");
        const fileRegistry = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio", "FileStudioProjectRegistry.ts"), "utf-8");
        const studioRegistry = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio", "StudioProjectRegistrationService.ts"), "utf-8");

        expect(outcomeLibraryCommand).toContain("private loadDescriptor(configPath: string): BuildDescriptor");
        expect(outcomeLibraryCommand).toContain('uses "outcomesPath" and so requires a string "libraryId"');
        expect(outcomeLibraryCommand).toContain("private async readStreamedOutcomes(filePath: string)");
        expect(certificationCommand).toContain("private loadDescriptor(configPath: string): BuildDescriptor");
        expect(certificationCommand).toContain('must be an object with a string "modeName"/"seed" and a number "sampleCount"');
        expect(certificationCommand).toContain("await this.builder.buildFromBundle(bundleDir, modes, outDir)");
        expect(materializer).toContain('const MATERIALIZED_MARKER_FILE = ".pokie-materialized.json"');
        expect(materializer).toContain("private async acquireLock(lockDir: string)");
        expect(materializer).toContain("await this.evictStale(cacheDir)");
        expect(materializer).toContain("this.markReady(stagingDir, cacheKey)");
        expect(runtimeResolver).toContain("new BlueprintProjectMaterializer(");
        for (const operation of ["DEV_OPERATION", "REPLAY_OPERATION", "SERVE_OPERATION", "SIM_OPERATION"]) {
            expect(cliRegistration).toContain(`createMaterializingRuntimePackageResolver(version, ${operation}, pokiePackageRoot)`);
        }
        expect(studioCommand).toContain("createMaterializingRuntimePackageResolver(pokieVersion, STUDIO_OPERATION, pokiePackageRoot)");
        expect(studioServer).toContain("new StudioSimulationService(");
        expect(studioServer).toContain("this.resolveRuntimePackageRoot,");
        expect(studioServer).toContain("new StudioReplayExecutionService(undefined, loadCurrentProjectGame");
        expect(studioServer).toContain("new StudioPlayService(this.loadGame, this.resolveRuntimePackageRoot");
        expect(fileRegistry).toContain("writeFileAtomically(this.registryFile");
        expect(fileRegistry).toContain('if ((error as NodeJS.ErrnoException)?.code === "ENOENT")');
        expect(fileRegistry).toContain("return Array.isArray(parsed) ?");
        expect(studioRegistry).toContain('export const PROJECT_REGISTRY_FILE_NAME = "projects.json"');
        expect(studioRegistry).toContain("new FileStudioProjectRegistry(path.join(appDataDirectory, PROJECT_REGISTRY_FILE_NAME))");
        expect(studioRegistry).toContain("status: this.pathExists(location) ? \"ok\" : \"missing\"");
        expect(studioRegistry).toContain("public async relocate(");
        expect(studioRegistry).toContain("private async canonicalize(location: string)");

        const stream = registry.artifact_kinds.find((item) => item.id === "canonicalOutcomeJsonl");
        const certificationDescriptor = registry.artifact_kinds.find((item) => item.id === "certificationBuildDescriptor");
        const runtimeCache = registry.artifact_kinds.find((item) => item.id === "blueprintRuntimeMaterializationCache");
        const runtimeMarker = registry.artifact_kinds.find((item) => item.id === "blueprintRuntimeMaterializationMarker");
        const studioProjects = registry.artifact_kinds.find((item) => item.id === "studioProjectRegistryEntry");
        for (const contract of [stream, certificationDescriptor, runtimeCache, runtimeMarker, studioProjects]) {
            expect(contract).toEqual(expect.objectContaining({
                provenance: expect.any(String),
                stale: expect.any(String),
                compatibility: expect.any(String),
                containment: expect.any(String),
                diagnostics: expect.any(String),
                recovery: expect.any(String),
            }));
        }
        expect(stream).toEqual(expect.objectContaining({
            "recognized_by": expect.arrayContaining(["OutcomeLibraryCommand:loadDescriptor outcomesPath", "OutcomeLibraryCommand:readStreamedOutcomes"]),
            "exports_to": expect.arrayContaining(["outcomeLibraryBundleDescriptor", "outcomeLibrary"]),
        }));
        expect(certificationDescriptor).toEqual(expect.objectContaining({
            "recognized_by": expect.arrayContaining(["CertificationCommand:loadDescriptor", "CertificationCommand:executeBuild"]),
            "imports_from": ["outcomeLibrary"],
            "exports_to": ["certificationEvidenceBundle"],
            "support_status": "supported-user-supplied-prerequisite-contract",
        }));
        expect(runtimeCache).toEqual(expect.objectContaining({
            "imports_from": expect.arrayContaining(["blueprint", "blueprintRuntimeMaterializationMarker"]),
            "prerequisite_for": expect.arrayContaining(["runtimeSession", "simulationReport", "runtimeReplayDescriptor"]),
            "support_status": "supported-internal-runtime-state-not-user-artifact",
        }));
        expect(runtimeMarker?.exports_to).toEqual(["blueprintRuntimeMaterializationCache"]);
        expect(registry.non_artifact_prerequisites).toContainEqual(expect.objectContaining({
            id: "blueprintRuntimeMaterializationLock",
            type: "non-artifact-prerequisite",
        }));
        expect(studioProjects).toEqual(expect.objectContaining({
            shape: expect.stringContaining("projects.json"),
            "created_by": expect.arrayContaining(["FileStudioProjectRegistry:upsert atomically writes projects.json"]),
            "recognized_by": expect.arrayContaining(["FileStudioProjectRegistry:list/read", "StudioProjectRegistrationService:list"]),
            "support_status": "supported-durable-app-data-metadata-companion",
        }));
        expect(matrix).toContain("canonical streamed `outcomesPath` JSONL");
        expect(matrix).toContain("canonical `certificationBuildDescriptor`");
        expect(matrix).toContain("`blueprintRuntimeMaterializationCache`");
        expect(matrix).toContain("| Persist and recover Studio Projects |");
        expect(productModel).toContain("`canonicalOutcomeJsonl`");
        expect(productModel).toContain("`certificationBuildDescriptor`");
        expect(productModel).toContain("`blueprintRuntimeMaterializationCache`");
        expect(productModel).toContain("`FileStudioProjectRegistry`");
    });

    it("covers every registered public route and records its legacy aliases without advertising them", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const routeInventory = matrix.slice(matrix.indexOf("## Public route inventory and aliases"), matrix.indexOf("## Closure ledger"));

        expect(routeInventory).toContain("The public CLI inventory is the command tree registered by `registerCliCommands()`.");
        const registeredRoutes = registerCliCommands({
            version: "test-version",
            pokiePackageRoot: "/fake/pokie/root",
            clientRoot: "/fake/pokie/root/dist/cli/client",
            studioRoot: "/fake/pokie/root/dist/cli/studio-client",
        }).map((command) => command.getName());
        const publicRoutes = registeredRoutes.filter((route) => route !== "__studio");
        expect(registeredRoutes).toEqual(expect.arrayContaining(["__studio"]));
        expect(publicRoutes.sort()).toEqual([
            "build",
            "certification",
            "client",
            "create",
            "dev",
            "diff",
            "edit",
            "export",
            "fairness",
            "generate",
            "import",
            "init",
            "inspect",
            "par",
            "reel",
            "replay",
            "report",
            "sample",
            "serve",
            "sim",
            "validate",
        ].sort());
        for (const route of publicRoutes) {
            expect(routeInventory).toContain(`\`${route}\``);
        }
        for (const route of ["certification build", "certification verify", "fairness seed-commit", "fairness commit", "fairness reveal", "fairness verify", "par export", "par import", "reel generate"]) {
            expect(routeInventory).toContain(`\`${route}\``);
        }
        for (const legacyAlias of [
            "outcomelibrary build",
            "outcomelibrary generate",
            "outcomelibrary validate",
            "outcomesource inspect",
            "outcomesource sample",
            "outcomesource diff",
            "stakeengine export",
            "stakeengine import",
            "stakeengine analyze",
            "stakeengine diff",
            "`__studio`",
        ]) {
            expect(routeInventory).toContain(legacyAlias);
        }
        expect(routeInventory).toContain("Studio domain route");
    });

    it("does not conflate public raw generation with bundle materialization or omit persisted public result branches", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const registry = readRegistry();

        expect(matrix).toContain("| Generate raw weighted outcomes | `generate --out <file>`");
        expect(matrix).toContain("one `WeightedOutcomeLibrary` JSON value");
        expect(matrix).toContain("`--resume` persists an `ExactEnumerationCheckpoint` only on cancellation");
        expect(matrix).toContain("| Materialize a canonical Outcome Library bundle | `build --target outcomeLibrary` from a recognized compatible project, `export <config.json> --to outcomes` from an Outcome Library bundle descriptor");
        expect(matrix).toContain("`generate` as already having built a directory bundle");
        expect(matrix).toContain("`validate --out <file>` writes a `ValidateReport`");
        expect(matrix).toContain("`report --out <file>`");
        expect(matrix).toContain("`diff --out <file>`; legacy/internal `outcomesource diff --out`, `stakeengine diff --out`");
        expect(matrix).toContain("`stakeengine analyze/diff --out`");
        expect(closureOwner(matrix, "PC-05-HANDOFF-01")).toBe("PC-09 Outcome Library sweep");
        expect(closureRow(matrix, "PC-05-HANDOFF-01")).toContain("raw `WeightedOutcomeLibrary` JSON");
        expect(productModel).toContain("`pokie generate` is deliberately the first, raw stage");
        expect(productModel).toContain("`pokie outcomelibrary build` consumes");
        expect(productModel).toContain("PC-05-HANDOFF-01");
        const generateFacade = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "GenerateCommand.ts"), "utf-8");
        const outcomeLibraryCommand = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "commands", "OutcomeLibraryCommand.ts"), "utf-8");
        expect(generateFacade).toContain('this.outcomeLibrary.run(["generate", ...args])');
        expect(outcomeLibraryCommand).toContain('this.writeFile(options.out, JSON.stringify(result.library, null, 4))');
        expect(outcomeLibraryCommand).toContain('this.writeFile(options.resume, JSON.stringify(this.serializeCheckpoint(error.checkpoint), null, 4))');
        expect(outcomeLibraryCommand).toContain("private async executeBuild(configPath: string, outDir: string)");
        const contracts = registry.persisted_public_output_contracts;
        expect(new Set(contracts.map((contract) => contract.id)).size).toBe(contracts.length);
        const persistenceSurfaces = publicPersistenceSurfaces();
        expect(persistenceSurfaces).toEqual(expect.arrayContaining([
            {route: "generate", option: "--out"},
            {route: "generate", option: "--resume"},
            {route: "import", option: "--out"},
            {route: "par import", option: "--out"},
            {route: "fairness reveal", option: "--out"},
        ]));
        for (const surface of persistenceSurfaces) {
            expect(
                contracts.some((contract) => contract.producer.startsWith(`cli:${surface.route}`) && contract.producer.includes(surface.option)),
            ).toBe(true);
        }
        for (const contract of contracts) {
            expect(contract.persistence_trigger).toEqual(expect.any(String));
            const artifact = registry.artifact_kinds.find((item) => item.id === contract.artifact_id);
            if (
                contract.artifact_id === "weightedOutcomeLibraryJson" ||
                contract.artifact_id === "outcomeLibraryGenerationCheckpoint" ||
                artifact?.support_status === "supported-result-artifact"
            ) {
                expect(artifact).toEqual(expect.objectContaining({
                    provenance: expect.any(String),
                    stale: expect.any(String),
                    compatibility: expect.any(String),
                    recovery: expect.any(String),
                }));
            }
            expect(artifact?.created_by).toContain(contract.producer);

            // Check the actual command implementation advertises its write
            // surface. This keeps registry coverage independent of prose.
            const source = fs.readFileSync(path.join(__dirname, "..", "..", contract.command_file), "utf-8");
            if (!contract.producer.includes("without --out") && contract.producer !== "cli:init") {
                expect(source).toContain("--out");
            }
            if (contract.producer.includes("--resume")) {
                expect(source).toContain("--resume");
            }
        }
    });

    it("directly audits default public write branches, including their conditional no-write paths", () => {
        const registry = readRegistry();
        const contracts = registry.persisted_public_output_contracts;
        const expectedDefaults: Array<{id: string; artifactId: string; commandFile: string; sourceAssertions: string[]}> = [
            {id: "create-blueprint-default", artifactId: "blueprint", commandFile: "cli/commands/CreateCommand.ts", sourceAssertions: ["out ?? this.defaultBlueprintPath"]},
            {id: "edit-blueprint-default", artifactId: "blueprint", commandFile: "cli/commands/EditCommand.ts", sourceAssertions: ["defaultPathFor: () => out ?? blueprintPath", "if (!confirmed)"]},
            {id: "reel-apply-blueprint-default", artifactId: "blueprint", commandFile: "cli/commands/ReelCommand.ts", sourceAssertions: ["if (!failed && options.apply)", "options.out ?? blueprintPath"]},
            {id: "reel-materialize-blueprint-default", artifactId: "blueprint", commandFile: "cli/commands/ReelCommand.ts", sourceAssertions: ["const outPath = out ?? blueprintPath", "if (!resolution.success)"]},
            {id: "par-import-blueprint-default", artifactId: "blueprint", commandFile: "cli/commands/ParCommand.ts", sourceAssertions: ["options.out ?? defaultBlueprintPath(inputPath)", "this.assertDestinationIsAvailable(inputPath, outPath)"]},
            {id: "import-par-blueprint-default", artifactId: "blueprint", commandFile: "cli/commands/ImportCommand.ts", sourceAssertions: ["path.extname(options.input).toLowerCase() === \".xlsx\"", "options.out === undefined ? []"]},
            {id: "par-export-workbook-default", artifactId: "parWorkbook", commandFile: "cli/commands/ParCommand.ts", sourceAssertions: ["options.out ?? defaultParSheetPath(blueprintPath)", "this.assertDestinationIsAvailable(blueprintPath, outPath)"]},
            {id: "build-ts-package-default", artifactId: "tsPackage", commandFile: "cli/commands/BuildCommand.ts", sourceAssertions: ["options.out ?? this.resolveDestination(project.rootPath, options.target)", "if (options.dryRun)", "this.registry.build(\"tsPackage\", project, out, lifecycle)"]},
            {id: "build-outcome-bundle-default", artifactId: "outcomeLibrary", commandFile: "cli/commands/BuildCommand.ts", sourceAssertions: ["options.out ?? this.resolveDestination(project.rootPath, options.target)", "this.registry.build(target, project, out"]},
            {id: "build-stake-default", artifactId: "stakeAdapter", commandFile: "cli/commands/BuildCommand.ts", sourceAssertions: ["options.out ?? this.resolveDestination(project.rootPath, options.target)", "this.registry.build(target, project, out"]},
            {id: "build-par-default", artifactId: "parWorkbook", commandFile: "cli/commands/BuildCommand.ts", sourceAssertions: ["options.out ?? this.resolveDestination(project.rootPath, options.target)", "this.registry.build(target, project, out"]},
            {id: "export-outcome-bundle-default", artifactId: "outcomeLibrary", commandFile: "cli/commands/ExportCommand.ts", sourceAssertions: ["if (args.out !== undefined) return args.out", "return path.join(path.dirname(args.source), \"outcomelibrary\")", "if (args.dryRun)", "this.registry.build(target, project, destination)", "this.outcomeLibrary.run([\"build\", ...forwarded])"]},
            {id: "export-stake-default", artifactId: "stakeAdapter", commandFile: "cli/commands/ExportCommand.ts", sourceAssertions: ["if (args.out !== undefined) return args.out", "return path.join(path.dirname(args.source), \"stakeengine\")", "if (args.dryRun)", "this.registry.build(target, project, destination)", "this.stake.run([\"export\", ...forwarded])"]},
            {id: "export-par-default", artifactId: "parWorkbook", commandFile: "cli/commands/ExportCommand.ts", sourceAssertions: ["if (args.out !== undefined) return args.out", ".par.xlsx", "if (args.dryRun)", "this.registry.build(target, project, destination)", "this.par.run([\"export\", ...forwarded])"]},
            {id: "stake-import-library-default", artifactId: "outcomeLibrary", commandFile: "cli/commands/ImportCommand.ts", sourceAssertions: ["const delegate = path.extname(options.input).toLowerCase() === \".xlsx\" ? this.par : this.stake", "options.out === undefined ? []"]},
            {id: "certification-bundle-default", artifactId: "certificationEvidenceBundle", commandFile: "cli/commands/CertificationCommand.ts", sourceAssertions: ["options.out ?? path.join(path.dirname(configPath), \"certification\")", "await this.builder.buildFromBundle(bundleDir, modes, outDir)"]},
            {id: "init-ts-package-default", artifactId: "tsPackage", commandFile: "cli/commands/InitCommand.ts", sourceAssertions: ["directory: directory ?? \".\"", "const scaffold = this.merger.merge(projectRoot, overrides)"]},
        ];

        expect(contracts.filter((contract) => contract.producer.includes("without --out") || contract.producer === "cli:init")).toHaveLength(expectedDefaults.length);
        for (const expected of expectedDefaults) {
            const contract = contracts.find((candidate) => candidate.id === expected.id);
            expect(contract).toEqual(expect.objectContaining({
                "artifact_id": expected.artifactId,
                "command_file": expected.commandFile,
                "persistence_trigger": expect.any(String),
            }));
            const source = fs.readFileSync(path.join(__dirname, "..", "..", expected.commandFile), "utf-8");
            for (const assertion of expected.sourceAssertions) expect(source).toContain(assertion);
            expect(registry.artifact_kinds.find((item) => item.id === expected.artifactId)?.created_by).toContain(contract?.producer);
        }
    });

    it("traces Studio symbol artwork from staged import through Blueprint save to contained editor and player serving", () => {
        const registry = readRegistry();
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const service = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio", "blueprint", "StudioBlueprintService.ts"), "utf-8");
        const server = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio", "StudioServer.ts"), "utf-8");
        const presentation = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio-client", "src", "components", "common", "SymbolPresentation.tsx"), "utf-8");
        const player = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio-client", "src", "components", "common", "CanonicalPlayerView.tsx"), "utf-8");
        const sharedRenderer = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "client", "player", "renderPlayer.ts"), "utf-8");

        expect(service).toContain("public importSymbolArtwork(sourcePath: string)");
        expect(service).toContain("this.stagedArtwork.set(reference, staged)");
        expect(service).toContain("this.materializeSymbolArtwork(resolved, blueprint)");
        expect(service).toContain("this.materializeSymbolArtwork(destination.targetPath, blueprint)");
        expect(service).toContain(["return normalized.startsWith(`", String.fromCharCode(36, 123), "SYMBOL_ARTWORK_DIRECTORY}/`) && !normalized.split(\"/\").includes(\"..\")"].join(""));
        expect(server).toContain('"/api/home/blueprints/symbol-artwork/import"');
        expect(server).toContain('"/api/project/symbol-artwork"');
        expect(server).toContain("if (!Object.values(artwork).includes(reference))");
        expect(presentation).toContain("/api/project/symbol-artwork?path=");
        expect(player).toContain("/api/project/symbol-artwork?path=");
        expect(player).toContain("artworkUrlForSymbol: (symbolId)");
        expect(sharedRenderer).toContain("artworkUrlForSymbol?: (symbolId: string) => string | undefined");
        expect(sharedRenderer).not.toContain("/api/project/symbol-artwork");
        expect(registry.artifact_kinds.find((item) => item.id === "studioSymbolArtworkPng")?.recognized_by).toEqual(
            expect.arrayContaining([
                "studio:player CanonicalPlayerView (Studio adapter resolves declared references and supplies URLs)",
                "cli:client player renderPlayer artworkUrlForSymbol callback (shared renderer; no endpoint or declared-reference consumer)",
            ]),
        );
        expect(matrix).toContain("| Attach Studio symbol artwork |");
        expect(matrix).toContain("Studio's `CanonicalPlayerView` use declared references only");
        expect(matrix).toContain("not embedded Blueprint JSON");
        expect(productModel).toContain("Studio's optional symbol artwork follows a separate companion path");
        expect(productModel).toContain("The Blueprint remains the editable game-model source and stores only");
        expect(productModel).toContain("`cli/client/player/renderPlayer`\nonly renders that optional caller-supplied URL");
    });

    it("traces durable registry companions through their real persistence, containment and recovery boundaries", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const managedService = fs.readFileSync(path.join(__dirname, "..", "..", "src", "project", "ManagedOutcomeProjectService.ts"), "utf-8");
        const studioService = fs.readFileSync(path.join(__dirname, "..", "..", "cli", "studio", "outcomeLibrary", "StudioOutcomeLibraryGenerateService.ts"), "utf-8");

        expect(managedService).toContain('path.join(path.dirname(sourceRootPath), ".pokie", "managed-outcome-projects.json")');
        expect(managedService).toContain("await this.files.rename(temporaryPath, registryPath)");
        expect(managedService).toContain("if ((error as NodeJS.ErrnoException).code === \"ENOENT\") return {projects: []}");
        expect(managedService).toContain("const project = await this.openIfCompatible(entry.rootPath, compatibility)");
        expect(managedService).toContain("await rollback().catch(() => undefined)");
        expect(studioService).toContain('path.join(".pokie", "outcome-library-registry.json")');
        expect(studioService).toContain("this.recordDiscoveredBundleDir(projectRoot, outDirRelative)");
        expect(studioService).toContain("const resolvedEntry = resolveProjectDirectory(projectRoot, entry, this.realpath)");
        expect(studioService).toContain("if (!Array.isArray(parsed))");
        expect(studioService).toContain("called after generate()'s own bundle write has already succeeded");
        expect(matrix).toContain("| Reuse a managed compatible Outcome Library |");
        expect(matrix).toContain("| Discover Studio custom Outcome Library bundles across restart |");
        expect(productModel).toContain("`.pokie/managed-outcome-projects.json`");
        expect(productModel).toContain("`.pokie/outcome-library-registry.json`");
        expect(productModel).toMatch(/malformed\s+registry read surfaces for repair/);
        expect(productModel).toContain("Missing, malformed, blank, absolute");
    });

    it("keeps frozen findings while assigning every closure surface to its roadmap-valid owner", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const expectedOwners: Record<string, string> = {
            "PC-05-CLI-01": "PC-06 diagnostic sweep",
            "PC-05-CLI-02": "PC-06 diagnostic sweep",
            "PC-05-CLI-03": "PC-15 public CLI/help/docs sweep",
            "PC-05-STUDIO-01": "PC-16 Studio recovery sweep",
            "PC-05-STUDIO-02": "PC-11 Studio validation/certification sweep",
            "PC-05-HANDOFF-01": "PC-09 Outcome Library sweep",
            "PC-05-DUP-01A": "PC-09 Outcome Library sweep",
            "PC-05-DUP-01B": "PC-10 Stake export sweep",
            "PC-05-DUP-01C": "PC-11 PAR conversion sweep",
            "PC-05-DUP-01D": "PC-15 public CLI/help/docs sweep",
            "PC-05-DUP-01E": "PC-16 Studio conversion sweep",
            "PC-05-DUP-02": "PC-06 provenance sweep",
            "PC-05-DUP-03A": "PC-06 CLI validation sweep",
            "PC-05-DUP-03B": "PC-11 Studio validation sweep",
            "PC-05-DOC-01A": "PC-15 public CLI/help/docs sweep",
            "PC-05-DOC-01B": "PC-13 WASM boundary sweep",
        };

        for (const [id, owner] of Object.entries(expectedOwners)) {
            expect(closureOwner(matrix, id)).toBe(owner);
        }
        expect(Object.keys(expectedOwners)).toHaveLength(16);
        expect(matrix).not.toContain("| PC-05-DUP-01 |");
        expect(closureRow(matrix, "PC-05-STUDIO-01")).not.toContain("PC-07");
        expect(closureRow(matrix, "PC-05-STUDIO-01")).not.toContain("PC-10");
        expect(closureRow(matrix, "PC-05-STUDIO-02")).not.toContain("PC-08");
        expect(closureRow(matrix, "PC-05-CLI-03")).not.toContain("PC-06");
        expect(closureRow(matrix, "PC-05-DOC-01A")).not.toContain("PC-09");
        expect(closureRow(matrix, "PC-05-DOC-01A")).not.toContain("PC-06");
        expect(closureRow(matrix, "PC-05-DUP-01D")).not.toContain("PC-16");
        expect(closureRow(matrix, "PC-05-DUP-01E")).not.toContain("PC-15");
        expect(acceptanceOwnershipRow(productModel, "PC-09")).toContain("DUP-01A");
        expect(acceptanceOwnershipRow(productModel, "PC-09")).toContain("HANDOFF-01");
        expect(acceptanceOwnershipRow(productModel, "PC-10")).toContain("DUP-01B");
        expect(acceptanceOwnershipRow(productModel, "PC-11")).toContain("DUP-01C");
        expect(acceptanceOwnershipRow(productModel, "PC-15")).toContain("CLI-03");
        expect(acceptanceOwnershipRow(productModel, "PC-15")).toContain("DOC-01A");
        expect(acceptanceOwnershipRow(productModel, "PC-16")).toContain("STUDIO-01");
        expect(acceptanceOwnershipRow(productModel, "PC-16")).toContain("DUP-01E");
        const remediatedImportGrammar = closureRow(matrix, "PC-05-CLI-04");
        expect(remediatedImportGrammar).toContain("Frozen observation (immutable)");
        expect(remediatedImportGrammar).toContain("previously remediated");
        expect(remediatedImportGrammar).toContain("afb072d4523b65d04166b4ac53e1ff34f3dfd3bf");
        expect(remediatedImportGrammar).toContain("no PC-06 closure work");
    });

    it("does not assign baseline operations to unrelated or nonexistent remediation sweeps", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        expect(operationOwner(matrix, "Create an editable game design")).toContain("No open mismatch");
        expect(operationOwner(matrix, "Scaffold a ready-to-run project")).toContain("No open mismatch");
        expect(operationOwner(matrix, "Edit a design")).toContain("No open mismatch");
        expect(operationOwner(matrix, "Build a runnable package")).toContain("PC-07 package build sweep");
        expect(operationOwner(matrix, "Simulate")).toBe("PC-08 runtime/source semantics sweep");
        expect(operationOwner(matrix, "Deploy an external format")).toContain("No open mismatch");
        expect(operationOwner(matrix, "Generate/inspect reel strips")).toContain("No open mismatch");
        for (const operation of [
            "Create an editable game design",
            "Scaffold a ready-to-run project",
            "Edit a design",
            "Build a runnable package",
            "Simulate",
            "Deploy an external format",
            "Generate/inspect reel strips",
        ]) {
            const owner = operationOwner(matrix, operation);
            expect(owner).not.toContain("PC-09 docs/surface sweep");
            expect(owner).not.toContain("PC-10 Studio recovery sweep");
            expect(owner).not.toContain("PC-08 Studio/public parity decision");
        }
    });
});
