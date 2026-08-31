import fs from "fs";
import crypto from "crypto";
import path from "path";
import {spawnSync} from "child_process";
import {
    ArtifactConversionPlanner,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    PROJECT_TYPE_CAPABILITIES,
    type PokieProject,
} from "../../src/index.js";
import {installPc14FixedRunnerClock, pc05PublicOwnerOperations} from "../support/ArtifactInteroperabilityRun.js";

type EmittedRecord = {
    readonly id: string;
    readonly artifact_kind: string;
    readonly operation_owner: string;
    readonly source_path: string;
    readonly source_identity: string;
    readonly produced_path: string | null;
    readonly produced_identity: string | null;
    readonly observable_result: string;
    readonly observations?: readonly {readonly surface: string; readonly owner: string; readonly result: string}[];
    readonly executed_public_owners?: readonly string[];
    readonly execution?: {readonly assertions: readonly string[]; readonly observations: readonly {readonly route: string; readonly result: string}[]};
    readonly diagnostic?: {readonly code: string; readonly recovery: string};
    readonly systemic_classes?: readonly string[];
};

type InteroperabilityResult = {
    readonly "schema_version": number;
    readonly "step_id": string;
    readonly "generated_by": string;
    readonly runner_inputs: readonly {readonly file: string; readonly sha256: string; readonly rows: number; readonly scenarios: number}[];
    readonly rows: readonly EmittedRecord[];
    readonly scenario_results: readonly EmittedRecord[];
    readonly registry_artifact_coverage: readonly {
        readonly artifact_kind: string;
        readonly disposition: "executed" | "not-executed" | "excluded-internal-cache-state";
        readonly public_owners: readonly string[];
        readonly executed_regressions: readonly string[];
        readonly exclusion?: string;
    }[];
    readonly public_owner_coverage: readonly {
        readonly artifact_kind: string;
        readonly public_owner: string;
        readonly status: "executed";
        readonly record_id: string;
        readonly source_path: string;
        readonly operation_owner: string;
        readonly owner_execution: "runner-emitted";
        readonly result: string;
    }[];
    readonly planner_cells?: readonly {
        readonly source_path: string;
        readonly source_identity: string;
        readonly source_type: string;
        readonly target: string;
        readonly status: string;
        readonly diagnostic?: {readonly code: string; readonly recovery: string};
    }[];
    readonly systemic_class_audits: readonly {
        readonly class: string;
        readonly derived_from: {
            readonly operation_rows: readonly string[];
            readonly lifecycle_outcomes: readonly string[];
            readonly runner_outputs: readonly string[];
            readonly planner_cells: readonly unknown[];
            readonly aliases: readonly string[];
            readonly operation_owners: readonly string[];
            readonly studio_routes: readonly string[];
            readonly studio_ui_routes: readonly string[];
            readonly studio_service_callers: readonly string[];
            readonly direct_library_callers: readonly string[];
            readonly executed_owner_inventory: readonly {readonly artifact_kind: string; readonly public_owner: string; readonly record_id: string}[];
            readonly regression_links: readonly string[];
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
            expect.objectContaining({file: "studio-ui-real-artifact-result.json", sha256: expect.stringMatching(/^sha256:/), rows: expect.any(Number), scenarios: expect.any(Number)}),
        ]);
        expect(result.rows).toHaveLength(result.runner_inputs.reduce((count, input) => count + input.rows, 0));
        expect(result.scenario_results).toHaveLength(result.runner_inputs.reduce((count, input) => count + input.scenarios, 0));
        for (const input of result.runner_inputs) {
            const runnerPath = path.join(path.dirname(evidencePath), input.file);
            const runnerText = fs.readFileSync(runnerPath, "utf-8");
            expect(input.sha256).toBe(`sha256:${crypto.createHash("sha256").update(runnerText).digest("hex")}`);
            const emitted = JSON.parse(runnerText) as {readonly rows: readonly unknown[]; readonly scenario_results: readonly unknown[]};
            expect(emitted.rows).toHaveLength(input.rows);
            expect(emitted.scenario_results).toHaveLength(input.scenarios);
        }
    });

    it("has a reproducible runner-owned regeneration entry point", () => {
        const scriptPath = path.resolve(process.cwd(), "scripts/generate-pc14-interoperability-evidence.mjs");
        const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")) as {readonly scripts: Record<string, string>};
        expect(packageJson.scripts["evidence:pc14-interoperability"]).toBe("node scripts/generate-pc14-interoperability-evidence.mjs");
        expect(fs.existsSync(scriptPath)).toBe(true);
    }, 120000);

    it("executes the clean-process regeneration byte comparison", () => {
        // The child runs the same deterministic real-artifact runners and
        // compares their fresh files with the checked-in evidence.  Its flag
        // only prevents this contract from recursively starting itself.
        if (process.env.PC14_INTEROPERABILITY_REGENERATION_CHILD === "1") return;
        const scriptPath = path.resolve(process.cwd(), "scripts/generate-pc14-interoperability-evidence.mjs");
        const writeEvidence = process.env.PC14_INTEROPERABILITY_WRITE_EVIDENCE === "1";
        const result = spawnSync(process.execPath, [scriptPath, ...(writeEvidence ? ["--write"] : [])], {
            cwd: process.cwd(),
            env: {...process.env, PC14_INTEROPERABILITY_REGENERATION_CHILD: "1"},
            encoding: "utf-8",
            // The deterministic regeneration starts three foreground
            // real-artifact runners.  Studio's rendered Stake recovery adds
            // one publication/polling lifecycle, so leave enough headroom
            // for an otherwise healthy constrained CI worker instead of
            // treating its fixed 150-second process budget as a product
            // difference.
            timeout: 210000,
        });
        expect(result.error).toBeUndefined();
        if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
    }, 240000);

    it("injects the fixed evidence clock into real writers instead of only normalising saved hashes", () => {
        const originalClock = process.env.PC14_FIXED_RUNNER_CLOCK;
        process.env.PC14_FIXED_RUNNER_CLOCK = "2024-01-02T03:04:05.000Z";
        const restore = installPc14FixedRunnerClock();
        try {
            expect(new Date().toISOString()).toBe("2024-01-02T03:04:05.000Z");
            expect(Date.now()).toBe(Date.parse("2024-01-02T03:04:05.000Z"));
            // Explicit timestamps remain writer-owned inputs; freezing the
            // runner must not rewrite an artifact that deliberately supplies
            // one as part of its public contract.
            expect(new Date("2020-01-01T00:00:00.000Z").toISOString()).toBe("2020-01-01T00:00:00.000Z");
        } finally {
            restore();
            if (originalClock === undefined) Reflect.deleteProperty(process.env, "PC14_FIXED_RUNNER_CLOCK");
            else process.env.PC14_FIXED_RUNNER_CLOCK = originalClock;
        }
    });

    it("keeps actual artifact identities, owners, and only exercised observations", () => {
        const identities = new Set<string>();
        for (const row of result.rows) {
            expect(row.source_path).toMatch(/^run-artifacts\//);
            expect(row.source_identity).toMatch(/^sha256:/);
            identities.add(row.source_identity);
            expect(row.observable_result).not.toHaveLength(0);
            expect(row.observations).toBeDefined();
            expect(row.observations).not.toHaveLength(0);
            if (row.produced_path !== null) {
                expect(row.produced_path).toMatch(/^run-artifacts\//);
                expect(row.produced_identity).toMatch(/^sha256:/);
                if (row.produced_identity !== null) identities.add(row.produced_identity);
            }
            // Planner-owned conversion boundaries retain their native
            // conversion diagnostic, while command and Studio operation
            // owners retain the capability diagnostic layered on top.  The
            // emitted result must preserve the concrete owner code rather
            // than rewriting every unavailable edge as a CLI-style error.
            if (row.diagnostic !== undefined) expect(row.diagnostic).toMatchObject({
                code: expect.stringMatching(/^(?:missing-capability|missing-data|unsupported-boundary|unsupported-project-operation)$/),
                recovery: expect.any(String),
            });
        }
        for (const scenario of result.scenario_results) {
            identities.add(scenario.source_identity);
            if (scenario.produced_identity !== null) identities.add(scenario.produced_identity);
        }
        // The runner's identity must bind the emitted content, not merely a
        // directory shape. The real PC-14 chain contains many independently
        // generated files with the same layout but distinct bytes.
        expect(identities.size).toBeGreaterThan(60);
        expect(result.rows.map((row) => row.id)).toEqual(expect.arrayContaining([
            "blueprint-build-package",
            "package-generate-raw-outcomes",
            "raw-outcomes-build-bundle",
            "outcome-library-simulate",
            "outcome-library-certification",
            "outcome-library-fairness",
            "wasm-outcome-source-simulate",
            "wasm-outcome-source-replay",
            "studio-blueprint-build",
            "studio-outcome-library-stake-export",
            "studio-wasm-outcome-source-simulate",
            "studio-wasm-outcome-source-replay",
        ]));
    });

    it("binds lifecycle assertions and audits to emitted outcomes instead of static scenario claims", () => {
        const systemicClassKey: Readonly<Record<string, string>> = {
            "shared conversion diagnostic parity": "shared-conversion-diagnostic-parity",
            "provenance and freshness binding": "provenance-and-freshness-binding",
            "durable publication ownership": "durable-publication-ownership",
        };
        for (const scenario of result.scenario_results) {
            expect(scenario.source_path).toMatch(/^run-artifacts\//);
            expect(scenario.source_identity).toMatch(/^sha256:/);
            expect(scenario.observable_result).not.toHaveLength(0);
            expect(scenario.execution?.assertions.length).toBeGreaterThan(0);
            expect(scenario.execution?.observations.length).toBeGreaterThan(0);
            expect(scenario.systemic_classes).toBeDefined();
            expect(scenario.systemic_classes?.length).toBeGreaterThan(0);
        }
        expect(result.scenario_results.map((scenario) => scenario.id)).toEqual(expect.arrayContaining([
            "exact-source-provenance",
            "portable-exact-outcome-replay",
            "package-replay-best-effort-classification",
            "cli-generation-cancellation-recovery",
            "generated-reel-non-lossless",
            "configuration-drift",
            "descriptor-drift",
            "raw-source-drift",
            "manifest-drift",
            "index-drift",
            "par-source-drift",
            "borrowed-output-cleanup",
            "wasm-boundary",
            "studio-generation-cancellation",
            "studio-destination-drift",
            "studio-generation-recovery",
            "studio-managed-reuse-compatibility",
            "managed-reuse-sampling-policy-incompatibility",
            "partial-import-recovery",
            "studio-artifact-http-preflight",
            "studio-simulation-replay-cancellation",
            "studio-wasm-boundary",
            "studio-ui-blueprint-runtime-workflows",
            "studio-ui-blueprint-par-output-error-recovery",
        ]));
        for (const audit of result.systemic_class_audits) {
            expect(audit.derived_from.operation_rows.length + audit.derived_from.lifecycle_outcomes.length).toBeGreaterThan(0);
            expect(audit.derived_from.runner_outputs.length).toBeGreaterThan(0);
            for (const id of [...audit.derived_from.operation_rows, ...audit.derived_from.lifecycle_outcomes]) {
                const record = [...result.rows, ...result.scenario_results].find((candidate) => candidate.id === id);
                expect(record?.systemic_classes).toContain(systemicClassKey[audit.class]);
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

    it("derives the complete planner audit from real produced or imported sources", () => {
        const cells = result.runner_inputs.flatMap((input) => {
            const runnerPath = path.join(path.dirname(evidencePath), input.file);
            return (JSON.parse(fs.readFileSync(runnerPath, "utf-8")) as InteroperabilityResult)["planner_cells"] ?? [];
        });
        expect(cells).toHaveLength(BUILD_PRODUCT_MATRIX_SOURCE_TYPES.length * BUILD_PRODUCT_MATRIX_TARGETS.length);
        for (const source of BUILD_PRODUCT_MATRIX_SOURCE_TYPES) {
            for (const target of BUILD_PRODUCT_MATRIX_TARGETS) {
                const cell = cells.find((candidate) => candidate["source_type"] === source && candidate.target === target);
                expect(cell).toMatchObject({"source_path": expect.stringMatching(/^run-artifacts\//), "source_identity": expect.stringMatching(/^sha256:/)});
                const plan = new ArtifactConversionPlanner().plan(project(source), target);
                expect(cell?.status).toBe(plan.status);
                if (plan.status !== "planned") expect(cell?.diagnostic).toMatchObject({code: plan.diagnostic?.code, recovery: plan.diagnostic?.recovery});
            }
        }
        for (const audit of result.systemic_class_audits) {
            expect(audit.derived_from).toMatchObject({
                "planner_cells": audit.class === "shared conversion diagnostic parity"
                    ? expect.arrayContaining(cells)
                    : [],
                aliases: expect.any(Array),
                "operation_owners": expect.any(Array),
                "studio_routes": expect.any(Array),
                "studio_ui_routes": expect.any(Array),
                "studio_service_callers": expect.any(Array),
                "direct_library_callers": expect.any(Array),
                "executed_owner_inventory": expect.any(Array),
                "regression_links": expect.any(Array),
            });
        }
        const conversionAudit = result.systemic_class_audits.find((audit) => audit.class === "shared conversion diagnostic parity");
        expect(conversionAudit?.derived_from.studio_routes).toEqual(expect.arrayContaining([
            "POST /api/project/artifacts/preview",
        ]));
        expect(conversionAudit?.derived_from.studio_ui_routes).toEqual(expect.arrayContaining([
            "UI /project/:projectRoot/exportDeploy (Build/Export)",
            "UI /project/:projectRoot/play (Play)",
            "UI /project/:projectRoot/simulation (Simulation)",
            "UI /project/:projectRoot/replay (Replay)",
        ]));
    });

    it("retains the complete PC-05 registry census and explicitly excludes only internal cache state", () => {
        const registryPath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json");
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as {readonly artifact_kinds: readonly {readonly id: string}[]};
        expect(result.registry_artifact_coverage.map((entry) => entry.artifact_kind).sort())
            .toEqual(registry.artifact_kinds.map((artifact) => artifact.id).sort());
        for (const entry of result.registry_artifact_coverage) {
            if (entry.disposition === "excluded-internal-cache-state") {
                expect(entry.artifact_kind).toMatch(/^blueprintRuntimeMaterialization(?:Cache|Marker)$/);
                expect(entry.exclusion).toMatch(/Machine-local materialization cache/);
                continue;
            }
            expect(entry.public_owners.length).toBeGreaterThan(0);
            // PC-14 closes only when every public PC-05 artifact has an
            // emitted owner result.  A live/non-portable companion may retain
            // an unavailable diagnostic, but it cannot remain an unexecuted
            // inventory assertion.
            expect(entry.disposition).toBe("executed");
            expect(entry.executed_regressions.length).toBeGreaterThan(0);
        }
    });

    it("derives the required owner/operation matrix from every non-internal PC-05 registry field", () => {
        const registryPath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json");
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Parameters<typeof pc05PublicOwnerOperations>[0];
        const required = pc05PublicOwnerOperations(registry);
        expect(required).toEqual(expect.arrayContaining([
            expect.objectContaining({artifactKind: "blueprint", registryOperation: "created_by", owner: "cli:create"}),
            expect.objectContaining({artifactKind: "blueprint", registryOperation: "recognized_by", owner: "ProjectTargetResolver"}),
            expect.objectContaining({artifactKind: "outcomeLibrary", registryOperation: "runs_by", owner: "studio:simulation"}),
            expect.objectContaining({artifactKind: "fairnessProof", registryOperation: "validates_by", owner: "FairnessRoundProofVerifier"}),
        ]));
        expect(required.some((entry) => entry.artifactKind === "blueprintRuntimeMaterializationCache")).toBe(false);
        expect(required.some((entry) => entry.artifactKind === "blueprintRuntimeMaterializationMarker")).toBe(false);
        // Regression guard: this must remain the registry-sized matrix, not
        // the smaller set that happened to have been emitted by one runner.
        expect(required.length).toBeGreaterThan(200);
    });

    it("derives a path-aware disposition from every runner-emitted public operation", () => {
        const expected = [...new Set(result.rows.map((row) => `${row.artifact_kind}:${row.operation_owner}`))].sort();
        const actual = result.public_owner_coverage
            .map((entry) => `${entry.artifact_kind}:${entry.public_owner}`)
            .sort();
        // The registry is an inventory, not proof that an uncalled sibling
        // command completed.  Coverage is instead the exact set of owners
        // that a real runner recorded after its operation completed.
        expect(actual).toEqual(expected);
        expect(new Set(actual).size).toBe(actual.length);
        for (const entry of result.public_owner_coverage) {
            expect(entry.status).toBe("executed");
            expect(entry.record_id).toEqual(expect.any(String));
            expect(entry.source_path).toMatch(/^run-artifacts\//);
            expect(entry.operation_owner).toEqual(expect.any(String));
            expect(entry.result).toContain(entry.public_owner);
            const record = result.rows.find((candidate) => candidate.id === entry.record_id);
            expect(record?.source_path).toBe(entry.source_path);
            expect(record?.operation_owner).toBe(entry.public_owner);
        }
        for (const audit of result.systemic_class_audits) {
            const auditedOwners = audit.derived_from.executed_owner_inventory
                .map((entry) => `${entry.artifact_kind}:${entry.public_owner}`).sort();
            let systemicClass: string;
            switch (audit.class) {
                case "shared conversion diagnostic parity":
                    systemicClass = "shared-conversion-diagnostic-parity";
                    break;
                case "provenance and freshness binding":
                    systemicClass = "provenance-and-freshness-binding";
                    break;
                default:
                    systemicClass = "durable-publication-ownership";
            }
            const expectedAuditedOwners = result.public_owner_coverage
                .filter((entry) => result.rows.some((record) =>
                    record.id === entry.record_id && record.systemic_classes?.includes(systemicClass),
                ))
                .map((entry) => `${entry.artifact_kind}:${entry.public_owner}`).sort();
            expect(auditedOwners).toEqual(expectedAuditedOwners);
            expect(new Set(auditedOwners).size).toBe(auditedOwners.length);
            for (const entry of audit.derived_from.executed_owner_inventory) {
                const record = result.rows.find((candidate) => candidate.id === entry.record_id);
                expect(record?.operation_owner).toBe(entry.public_owner);
            }
        }
    });

    it("binds the runtime, replay, simulation, report, validation, Outcome Library, and Stake re-export wave to exact emitted operations", () => {
        const exactOwners = [
            ["validationReport", "ValidateCommand"],
            ["canonicalOutcomeJsonl", "OutcomeLibraryCommand"],
            ["outcomeLibrary", "ValidateCommand"],
            ["outcomeLibrary", "SimCommand"],
            ["outcomeLibrary", "ReplayCommand"],
            ["outcomeLibrary", "ReportCommand"],
            ["simulationReport", "ReportCommand"],
            ["simulationReportSet", "SimCommand"],
            ["stakeImportReExportConfig", "StakeEngineCommand"],
            ["stakeEngineAnalysisReport", "StakeEngineCommand"],
            ["stakeEngineComparisonReport", "StakeEngineCommand"],
            ["runtimeReplayDescriptor", "ReplayCommand"],
            ["roundArtifact", "ReplayCommand"],
        ];
        for (const [artifactKind, owner] of exactOwners) {
            const coverage = result.public_owner_coverage.filter((entry) => entry.artifact_kind === artifactKind && entry.public_owner === owner);
            expect(coverage.length).toBeGreaterThan(0);
            for (const entry of coverage) {
                expect(entry.owner_execution).toBe("runner-emitted");
                const record = result.rows.find((candidate) => candidate.id === entry.record_id);
                expect(record?.operation_owner).toBe(owner);
            }
        }
    });
});
