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

// This is deliberately the complete public write inventory, rather than a
// hand-picked artifact subset.  A new public --out/--resume writer must add a
// contract row and an artifact lifecycle, or this test fails.
const PERSISTED_PUBLIC_OUTPUT_IDS = [
    "create-blueprint", "edit-blueprint", "reel-blueprint", "par-import-blueprint", "par-export-workbook",
    "build-package", "build-outcome-bundle", "build-stake", "build-par",
    "export-outcome-bundle", "export-stake", "export-par", "stake-import-library",
    "generate-raw-library", "generate-resume-checkpoint", "validate-report",
    "simulate-report", "simulate-report-set", "report-simulation-json", "report-simulation-report-set-json", "report-simulation-rendering", "report-outcome-source-analysis",
    "diff-simulation", "diff-outcome-source", "outcome-source-diff", "stake-analysis", "stake-diff",
    "replay-descriptor", "certification-bundle", "fairness-seed-commitment", "fairness-commitment", "fairness-proof",
];

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

describe("PC-05 product-model contract", () => {
    it("closes the artifact graph and inventories raw generation, portable rounds, Stake-import companions and the three fairness artifacts", () => {
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
                "tsPackage",
                "parWorkbook",
                "weightedOutcomeLibraryJson",
                "outcomeLibraryGenerationCheckpoint",
                "outcomeLibrary",
                "stakeAdapter",
                "wasmComponent",
                "roundArtifact",
                "runtimeSession",
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
                "fairnessServerSeedCommitment",
                "fairnessCommitment",
                "fairnessProof",
                "externalDeploymentArtifact",
                "stakeImportReExportConfig",
                "stakeImportSourceProvenance",
            ]),
        );
        const roundArtifact = registry.artifact_kinds.find((item) => item.id === "roundArtifact");
        expect(roundArtifact?.imports_from).toEqual(expect.arrayContaining(["tsPackage", "outcomeLibrary", "runtimeSession"]));
        expect(roundArtifact?.exports_to).toEqual(expect.arrayContaining(["runtimeReplayDescriptor", "certificationEvidenceBundle"]));
        const stakeImportConfig = registry.artifact_kinds.find((item) => item.id === "stakeImportReExportConfig");
        expect(stakeImportConfig?.imports_from).toEqual(expect.arrayContaining(["stakeAdapter", "outcomeLibrary"]));
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
        expect(matrix).toContain("| Materialize a canonical Outcome Library bundle | `build --target outcomeLibrary` from a recognized compatible project, `export <config.json> --to outcomes` from a descriptor");
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
        expect(contracts.map((contract) => contract.id)).toEqual(expect.arrayContaining(PERSISTED_PUBLIC_OUTPUT_IDS));
        expect(contracts).toHaveLength(PERSISTED_PUBLIC_OUTPUT_IDS.length);
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
            expect(source).toContain("--out");
            if (contract.producer.includes("--resume")) {
                expect(source).toContain("--resume");
            }
        }
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
});
