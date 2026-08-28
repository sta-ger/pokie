import fs from "fs";
import path from "path";
import {registerCliCommands} from "../../cli/registerCliCommands.js";

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
                "simulationReportSet",
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
        expect(Object.keys(expectedOwners)).toHaveLength(11);
        expect(closureRow(matrix, "PC-05-STUDIO-01")).not.toContain("PC-07");
        expect(closureRow(matrix, "PC-05-STUDIO-02")).not.toContain("PC-08");
        expect(closureRow(matrix, "PC-05-DUP-01")).not.toContain("PC-08");
        const remediatedImportGrammar = closureRow(matrix, "PC-05-CLI-04");
        expect(remediatedImportGrammar).toContain("Frozen observation (immutable)");
        expect(remediatedImportGrammar).toContain("previously remediated");
        expect(remediatedImportGrammar).toContain("afb072d4523b65d04166b4ac53e1ff34f3dfd3bf");
        expect(remediatedImportGrammar).toContain("no PC-06 closure work");
    });
});
