import {
    ADVERTISED_ARTIFACT_BUILD_TARGETS,
    BUILD_PRODUCT_MATRIX,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    describeBuildProductMatrixDiagnostic,
    getBuildProductMatrixCell,
} from "../../src/project/BuildProductMatrix.js";
import {ArtifactBuilderRegistry} from "../../src/project/ArtifactBuilderRegistry.js";

describe("BuildProductMatrix", () => {
    it("covers all six resolved sources and four build targets with the ten supported cells", () => {
        const cells = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.flatMap((source) =>
            BUILD_PRODUCT_MATRIX_TARGETS.map((target) => BUILD_PRODUCT_MATRIX[source][target]),
        );

        expect(cells).toHaveLength(24);
        expect(cells.filter((cell) => cell.state === "supported").map((cell) => `${cell.source}:${cell.target}`)).toEqual([
            "blueprint:tsPackage",
            "blueprint:outcomeLibrary",
            "blueprint:stakeAdapter",
            "blueprint:parWorkbook",
            "tsPackage:outcomeLibrary",
            "tsPackage:stakeAdapter",
            "outcomeLibrary:outcomeLibrary",
            "outcomeLibrary:stakeAdapter",
            "stakeAdapter:stakeAdapter",
            "parWorkbook:parWorkbook",
        ]);
        expect(cells.filter((cell) => cell.state === "hidden/unadvertised")).toHaveLength(0);
        expect(cells.filter((cell) => cell.state === "diagnostic-required")).toHaveLength(14);
    });

    it("makes WASM inspection-only and derives public registry selection from the same matrix", () => {
        const registry = new ArtifactBuilderRegistry();

        expect(ADVERTISED_ARTIFACT_BUILD_TARGETS).toEqual(["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook"]);
        expect(registry.listTargets()).toEqual(ADVERTISED_ARTIFACT_BUILD_TARGETS);
        expect(BUILD_PRODUCT_MATRIX_TARGETS).not.toContain("wasm");
        expect(() => registry.describe("wasm" as never)).toThrow(/Build target "wasm" is unavailable.*Next: choose a target shown by `pokie build --help`/);
    });

    it("gives every advertised diagnostic cell the same exact prerequisite and next action", () => {
        for (const source of BUILD_PRODUCT_MATRIX_SOURCE_TYPES) {
            for (const target of ADVERTISED_ARTIFACT_BUILD_TARGETS) {
                const cell = getBuildProductMatrixCell(source, target);
                if (cell.state === "supported") continue;

                const message = describeBuildProductMatrixDiagnostic(source, target, "/projects/current");
                expect(cell.missingPrerequisite).toBeDefined();
                expect(cell.nextAction).toBeDefined();
                expect(message).toContain(`Missing prerequisite: ${cell.missingPrerequisite}.`);
                expect(message).toContain(`Next: ${cell.nextAction}`);
            }
        }
    });
});
