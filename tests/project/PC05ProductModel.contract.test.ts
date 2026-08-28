import fs from "fs";
import path from "path";

type InventoryItem = {
    id: string;
    type?: string;
    imports_from?: string[];
    exports_to?: string[];
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

function readRegistry(): ProductModelRegistry {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")) as ProductModelRegistry;
}

function closureRow(matrix: string, id: string): string {
    const row = matrix.split("\n").find((line) => line.startsWith(`| ${id} |`));
    if (row === undefined) throw new Error(`Missing PC-05 closure row ${id}.`);
    return row;
}

describe("PC-05 product-model contract", () => {
    it("closes the artifact graph and inventories portable rounds plus Stake-import companions", () => {
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
                "renderedReport",
                "runtimeReplayDescriptor",
                "certificationEvidenceBundle",
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
    });

    it("covers every registered public route and records its legacy aliases without advertising them", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const routeInventory = matrix.slice(matrix.indexOf("## Public route inventory and aliases"), matrix.indexOf("## Closure ledger"));

        expect(routeInventory).toContain("The public CLI inventory is the command tree registered by `registerCliCommands()`.");
        for (const route of [
            "build",
            "certification build",
            "certification verify",
            "client",
            "create",
            "dev",
            "diff",
            "edit",
            "export",
            "fairness seed-commit",
            "fairness commit",
            "fairness reveal",
            "fairness verify",
            "generate",
            "import",
            "init",
            "inspect",
            "par export",
            "par import",
            "reel generate",
            "replay",
            "report",
            "sample",
            "serve",
            "sim",
            "validate",
        ]) {
            expect(routeInventory).toContain(`\`${route}\``);
        }
        for (const legacyAlias of ["outcomelibrary generate|build", "outcomesource inspect|sample", "outcomesource diff", "stakeengine import", "stakeengine analyze|diff"]) {
            expect(routeInventory).toContain(legacyAlias);
        }
        expect(routeInventory).toContain("Studio domain route");
    });

    it("keeps frozen findings while assigning only roadmap-valid current owners", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const expectedOwners: Record<string, string> = {
            "PC-05-CLI-01": "PC-06",
            "PC-05-CLI-02": "PC-06",
            "PC-05-CLI-03": "PC-06",
            "PC-05-STUDIO-01": "PC-10",
            "PC-05-STUDIO-02": "PC-11",
            "PC-05-DUP-01": "PC-16",
            "PC-05-DUP-02": "PC-06",
            "PC-05-DUP-03A": "PC-06",
            "PC-05-DUP-03B": "PC-11",
            "PC-05-DOC-01A": "PC-09",
            "PC-05-DOC-01B": "PC-13",
        };

        for (const [id, owner] of Object.entries(expectedOwners)) {
            expect(closureRow(matrix, id)).toContain(owner);
        }
        const remediatedImportGrammar = closureRow(matrix, "PC-05-CLI-04");
        expect(remediatedImportGrammar).toContain("Frozen observation (immutable)");
        expect(remediatedImportGrammar).toContain("previously remediated");
        expect(remediatedImportGrammar).toContain("afb072d4523b65d04166b4ac53e1ff34f3dfd3bf");
        expect(remediatedImportGrammar).toContain("no PC-06 closure work");
    });
});
