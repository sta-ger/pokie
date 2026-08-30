import fs from "fs";
import path from "path";
import {
    ArtifactConversionPlanner,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    PROJECT_TYPE_CAPABILITIES,
    type PokieProject,
} from "../../src/index.js";

type EmittedRecord = {
    readonly id: string;
    readonly source_path: string;
    readonly source_identity: string;
    readonly produced_path: string | null;
    readonly produced_identity: string | null;
    readonly observable_result: string;
    readonly observations?: readonly {readonly surface: string; readonly owner: string; readonly result: string}[];
    readonly execution?: {readonly assertions: readonly string[]; readonly observations: readonly {readonly route: string; readonly result: string}[]};
    readonly diagnostic?: {readonly code: string; readonly recovery: string};
};

type InteroperabilityResult = {
    readonly "schema_version": number;
    readonly "step_id": string;
    readonly "generated_by": string;
    readonly runner_inputs: readonly {readonly file: string; readonly sha256: string; readonly rows: number; readonly scenarios: number}[];
    readonly rows: readonly EmittedRecord[];
    readonly scenario_results: readonly EmittedRecord[];
    readonly systemic_class_audits: readonly {
        readonly class: string;
        readonly derived_from: {
            readonly operation_rows: readonly string[];
            readonly lifecycle_outcomes: readonly string[];
            readonly runner_outputs: readonly string[];
        };
    }[];
};

const evidencePath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-14-artifact-torture/interoperability-result.json");

function project(type: PokieProject["type"]): PokieProject {
    return {type, rootPath: `/artifacts/${type}`, provenance: "torture-contract", capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

describe("PC-14 artifact interoperability remediation contract", () => {
    const result = JSON.parse(fs.readFileSync(evidencePath, "utf-8")) as InteroperabilityResult;

    it("retains only records emitted by the real CLI and Studio runners", () => {
        expect(result).toMatchObject({"schema_version": 3, "step_id": "PC-14", "generated_by": "ArtifactInteroperabilityRun.mergeArtifactInteroperabilityRuns"});
        expect(result.runner_inputs).toEqual([
            expect.objectContaining({file: "cli-real-artifact-result.json", sha256: expect.stringMatching(/^sha256:/), rows: expect.any(Number), scenarios: expect.any(Number)}),
            expect.objectContaining({file: "studio-real-artifact-result.json", sha256: expect.stringMatching(/^sha256:/), rows: expect.any(Number), scenarios: expect.any(Number)}),
        ]);
        expect(result.rows).toHaveLength(result.runner_inputs.reduce((count, input) => count + input.rows, 0));
        expect(result.scenario_results).toHaveLength(result.runner_inputs.reduce((count, input) => count + input.scenarios, 0));
    });

    it("keeps actual artifact identities, owners, and only exercised observations", () => {
        for (const row of result.rows) {
            expect(row.source_path).toMatch(/^run-artifacts\//);
            expect(row.source_identity).toMatch(/^sha256:/);
            expect(row.observable_result).not.toHaveLength(0);
            expect(row.observations).toBeDefined();
            expect(row.observations).not.toHaveLength(0);
            if (row.produced_path !== null) {
                expect(row.produced_path).toMatch(/^run-artifacts\//);
                expect(row.produced_identity).toMatch(/^sha256:/);
            }
            if (row.diagnostic !== undefined) expect(row.diagnostic).toMatchObject({code: "unsupported-project-operation", recovery: expect.any(String)});
        }
        expect(result.rows.map((row) => row.id)).toEqual(expect.arrayContaining([
            "blueprint-build-package",
            "package-generate-raw-outcomes",
            "raw-outcomes-build-bundle",
            "outcome-library-simulate",
            "outcome-library-certification",
            "outcome-library-fairness",
            "wasm-outcome-source-simulate",
            "studio-blueprint-build",
            "studio-outcome-library-stake-export",
        ]));
    });

    it("binds lifecycle assertions and audits to emitted outcomes instead of static scenario claims", () => {
        for (const scenario of result.scenario_results) {
            expect(scenario.source_path).toMatch(/^run-artifacts\//);
            expect(scenario.source_identity).toMatch(/^sha256:/);
            expect(scenario.observable_result).not.toHaveLength(0);
            expect(scenario.execution?.assertions.length).toBeGreaterThan(0);
            expect(scenario.execution?.observations.length).toBeGreaterThan(0);
        }
        expect(result.scenario_results.map((scenario) => scenario.id)).toEqual(expect.arrayContaining([
            "exact-source-provenance",
            "portable-exact-outcome-replay",
            "generated-reel-non-lossless",
            "configuration-drift",
            "borrowed-output-cleanup",
            "wasm-boundary",
            "studio-generation-cancellation",
            "studio-destination-drift",
            "studio-generation-recovery",
        ]));
        for (const audit of result.systemic_class_audits) {
            expect(audit.derived_from.operation_rows.length + audit.derived_from.lifecycle_outcomes.length).toBeGreaterThan(0);
            expect(audit.derived_from.runner_outputs.length).toBeGreaterThan(0);
            for (const id of [...audit.derived_from.operation_rows, ...audit.derived_from.lifecycle_outcomes]) {
                expect([...result.rows, ...result.scenario_results].map((record) => record.id)).toContain(id);
            }
        }
    });

    it("keeps unavailable conversion policy on the shared planner diagnostic, including WASM", () => {
        const planner = new ArtifactConversionPlanner();
        for (const source of BUILD_PRODUCT_MATRIX_SOURCE_TYPES) {
            for (const target of BUILD_PRODUCT_MATRIX_TARGETS) {
                const plan = planner.plan(project(source), target);
                if (plan.status === "planned") continue;
                expect(plan.diagnostic).toMatchObject({failedEdge: {from: source, to: target}});
                expect(plan.diagnostic?.recovery).toMatch(/use|choose|open|resolve|import/i);
            }
        }
        expect(planner.plan(project("wasm"), "outcomeLibrary")).toMatchObject({status: "unavailable", diagnostic: {code: "unsupported-boundary"}});
    });
});
