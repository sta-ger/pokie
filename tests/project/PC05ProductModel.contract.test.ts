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
};

type ProductModelRegistry = {
    schema_version: number;
    reference_fields: Array<keyof InventoryItem>;
    artifact_kinds: InventoryItem[];
    non_artifact_prerequisites: InventoryItem[];
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

describe("PC-05 product-model contract", () => {
    it("closes the artifact graph and inventories portable rounds, Stake-import companions and the three fairness artifacts", () => {
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
                "outcomeLibrary",
                "stakeAdapter",
                "wasmComponent",
                "roundArtifact",
                "runtimeSession",
                "simulationReport",
                "simulationReportSet",
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

    it("keeps frozen findings while assigning every closure surface to its roadmap-valid owner", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const productModel = fs.readFileSync(PRODUCT_MODEL_PATH, "utf-8");
        const expectedOwners: Record<string, string> = {
            "PC-05-CLI-01": "PC-06 diagnostic sweep",
            "PC-05-CLI-02": "PC-06 diagnostic sweep",
            "PC-05-CLI-03": "PC-15 public CLI/help/docs sweep",
            "PC-05-STUDIO-01": "PC-16 Studio recovery sweep",
            "PC-05-STUDIO-02": "PC-11 Studio validation/certification sweep",
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
        expect(Object.keys(expectedOwners)).toHaveLength(15);
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
