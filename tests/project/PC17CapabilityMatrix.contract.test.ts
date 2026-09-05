import fs from "fs";
import path from "path";

import {BUILD_PRODUCT_MATRIX, BUILD_PRODUCT_MATRIX_SOURCE_TYPES, BUILD_PRODUCT_MATRIX_TARGETS} from "pokie";

const AUDIT_ROOT = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-17-parity-semantic-audit");
const MATRIX_PATH = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/CAPABILITY-MATRIX.md");

function readAudit(name: string): string {
    return fs.readFileSync(path.join(AUDIT_ROOT, name), "utf-8");
}

describe("PC-17 capability-matrix parity contract", () => {
    it("records every PC-05 operation with its CLI, Studio, contract, diagnostic, and next-action disposition", () => {
        const matrix = fs.readFileSync(MATRIX_PATH, "utf-8");
        const parity = readAudit("CAPABILITY-PARITY.md");

        const operationTable = matrix.slice(0, matrix.indexOf("##"));
        const operations = Array.from(operationTable.matchAll(/^\| ([^|]+) \|/gm))
            .map((match) => match[1])
            .filter((operation) => operation !== "Domain operation / user goal" && operation !== "---");
        expect(operations).toHaveLength(28);
        expect(parity).toContain("| PC-05 operation | CLI result | Studio result or intentional absence | Shared contract / boundary | Prerequisite or diagnostic | Next user action |");
        for (const operation of operations) {
            expect(matrix).toContain(`| ${operation} |`);
            expect(parity).toContain(`| \`${operation}\` |`);
        }
        expect(parity).toContain("Intentional absence");
        expect(parity).toContain("`BUILD_PRODUCT_MATRIX`, `ArtifactConversionPlanner`, `ArtifactBuilderRegistry`, `ProjectTargetResolver`");
        expect(parity).toContain("`simulateOutcomeSourceProject`");
        expect(parity).toContain("`replayOutcomeSourceProject`");
        expect(parity).toContain("Raw JSON/checkpoint is not runnable");
        expect(parity).toContain("Stake analyzes but does not draw");
        expect(parity).toContain("No build/runtime/sampling/logic-validation promise");
    });

    it("gives every public command and nested verb an independently auditable parity disposition", () => {
        const parity = readAudit("CAPABILITY-PARITY.md");
        for (const route of [
            "build", "certification build", "certification verify", "client", "create", "dev", "diff", "edit", "export",
            "fairness commit", "fairness reveal", "fairness seed-commit", "fairness verify", "generate", "import", "init",
            "inspect", "par export", "par import", "reel generate", "replay", "report", "sample", "serve", "sim", "validate",
        ]) {
            expect(parity).toContain(`| \`${route}\` |`);
        }
    });

    it("has one conversion contract for every supported matrix cell instead of a CLI- or Studio-only exception", () => {
        const parity = readAudit("CAPABILITY-PARITY.md");
        const supportedCells = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.flatMap((source) =>
            BUILD_PRODUCT_MATRIX_TARGETS.filter((target) => BUILD_PRODUCT_MATRIX[source][target].state === "supported"),
        );

        expect(supportedCells).toHaveLength(14);
        expect(parity).toContain("409 conflict preservation");
        expect(parity).toContain("cancellation leaves neither output nor staging directory");
    });
});
