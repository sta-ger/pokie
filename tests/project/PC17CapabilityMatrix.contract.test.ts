import fs from "fs";
import path from "path";

import {BUILD_PRODUCT_MATRIX, BUILD_PRODUCT_MATRIX_SOURCE_TYPES, BUILD_PRODUCT_MATRIX_TARGETS} from "pokie";

const AUDIT_ROOT = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-17-parity-semantic-audit");
const MATRIX_PATH = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/CAPABILITY-MATRIX.md");

function readAudit(name: string): string {
    return fs.readFileSync(path.join(AUDIT_ROOT, name), "utf-8");
}

describe("PC-17 capability-matrix parity contract", () => {
    it("records every PC-05 operation class and keeps intentional Studio differences on a shared user result", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const parity = readAudit("CAPABILITY-PARITY.md");

        for (const operation of [
            "Create an editable game design",
            "Build a runnable package",
            "Generate raw weighted outcomes",
            "Materialize a canonical Outcome Library bundle",
            "Run/play a game",
            "Simulate",
            "Replay a result",
            "Certify an Outcome Library",
            "Prove fairness",
            "Assess WASM compatibility",
        ]) {
            expect(matrix).toContain(`| ${operation} |`);
        }
        expect(parity).toContain("no unexplained CLI/Studio semantic mismatch");
        expect(parity).toContain("`BUILD_PRODUCT_MATRIX`, `ArtifactConversionPlanner`, `ArtifactBuilderRegistry` and `ProjectTargetResolver`");
        expect(parity).toContain("`createMaterializingRuntimePackageResolver`, `simulateOutcomeSourceProject` and `replayOutcomeSourceProject`");
        expect(parity).toContain("raw JSON is never labelled runnable");
        expect(parity).toContain("Stake export stays analyzable, not drawable");
        expect(parity).toContain("WASM remains inspection-only");
    });

    it("has one conversion contract for every supported matrix cell instead of a CLI- or Studio-only exception", () => {
        const parity = readAudit("CAPABILITY-PARITY.md");
        const supportedCells = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.flatMap((source) =>
            BUILD_PRODUCT_MATRIX_TARGETS.filter((target) => BUILD_PRODUCT_MATRIX[source][target].state === "supported"),
        );

        expect(supportedCells).toHaveLength(14);
        expect(parity).toContain("planner validation happens before writing");
        expect(parity).toContain("conflicts preserve caller-owned output");
        expect(parity).toContain("cancellation removes partial output");
    });
});
