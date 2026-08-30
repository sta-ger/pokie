import fs from "fs";
import path from "path";
import {
    ArtifactConversionPlanner,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    PROJECT_TYPE_CAPABILITIES,
    type PokieProject,
} from "../../src/index.js";

type InteroperabilityRow = {
    readonly artifact_kind: string;
    readonly operation: string;
    readonly source_path: string;
    readonly produced_path: string | null;
    readonly operation_owner: string;
    readonly status: "supported" | "intentionally-unsupported" | "defect";
    readonly observable_result: string;
    readonly reason?: string;
    readonly next_action?: string;
};

type InteroperabilityResult = {
    readonly excluded_internal_state: readonly {readonly artifact_kind: string}[];
    readonly rows: readonly InteroperabilityRow[];
    readonly systemic_class_audits: readonly {readonly class: string; readonly owner: string; readonly scope: readonly string[]}[];
};

const evidencePath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-14-artifact-torture/interoperability-result.json");
const registryPath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json");

function project(type: PokieProject["type"]): PokieProject {
    return {type, rootPath: `/artifacts/${type}`, provenance: "torture-contract", capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

describe("PC-14 artifact interoperability remediation contract", () => {
    const result = JSON.parse(fs.readFileSync(evidencePath, "utf-8")) as InteroperabilityResult;
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as {artifact_kinds: readonly {id: string}[]};

    it("records one deterministic, actionable disposition for every user artifact and operation", () => {
        const excluded = new Set(result.excluded_internal_state.map((entry) => entry.artifact_kind));
        const expectedKinds = registry.artifact_kinds.map((artifact) => artifact.id).filter((id) => !excluded.has(id));
        const operations = [...new Set(result.rows.map((row) => row.operation))];

        expect(operations).toEqual([
            "build", "import", "export", "validate", "inspect", "sample", "servePlay", "simulate", "report", "replay", "certification", "fairness", "deployment", "reuse",
        ]);
        expect(result.rows).toHaveLength(expectedKinds.length * operations.length);
        expect(new Set(result.rows.map((row) => `${row.artifact_kind}:${row.operation}`)).size).toBe(result.rows.length);

        for (const row of result.rows) {
            expect(expectedKinds).toContain(row.artifact_kind);
            expect(row.source_path).toMatch(/^run-artifacts\//);
            expect(row.operation_owner).not.toHaveLength(0);
            expect(row.observable_result).not.toHaveLength(0);
            if (row.status === "supported") {
                expect(row.produced_path).toMatch(/^run-artifacts\//);
            } else {
                expect(row.status).toBe("intentionally-unsupported");
                expect(row.reason).toContain(row.source_path);
                expect(row.next_action).toBeDefined();
            }
        }
    });

    it("keeps every unavailable conversion on the shared planner diagnostic, including WASM", () => {
        const planner = new ArtifactConversionPlanner();
        for (const source of BUILD_PRODUCT_MATRIX_SOURCE_TYPES) {
            for (const target of BUILD_PRODUCT_MATRIX_TARGETS) {
                const plan = planner.plan(project(source), target);
                if (plan.status === "planned") continue;
                expect(plan.diagnostic).toMatchObject({failedEdge: {from: source, to: target}});
                expect(plan.diagnostic?.recovery).toMatch(/use|choose|open|resolve|import/i);
            }
        }
        const wasm = planner.plan(project("wasm"), "outcomeLibrary");
        expect(wasm).toMatchObject({status: "unavailable", diagnostic: {code: "unsupported-boundary"}});
        expect(wasm.diagnostic?.recovery).toMatch(/Blueprint|package/i);
    });

    it("documents class-level ownership rather than command-local exceptions", () => {
        expect(result.systemic_class_audits).toEqual(expect.arrayContaining([
            expect.objectContaining({class: "shared conversion diagnostic parity", owner: "ArtifactConversionPlanner"}),
            expect.objectContaining({class: "provenance and freshness binding"}),
            expect.objectContaining({class: "durable publication ownership"}),
        ]));
        for (const audit of result.systemic_class_audits) expect(audit.scope.length).toBeGreaterThan(1);
    });
});
