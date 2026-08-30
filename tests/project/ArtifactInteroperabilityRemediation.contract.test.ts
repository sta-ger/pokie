import fs from "fs";
import path from "path";
import {
    ArtifactConversionPlanner,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    describeUnavailableArtifactOperation,
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
    readonly diagnostic?: {readonly shared_owner: string; readonly code: string; readonly recovery: string; readonly message?: string};
    readonly execution?: {
        readonly runner: string;
        readonly operation: string;
        readonly artifact_origin: string;
        readonly observations: Readonly<Record<string, {readonly surface: string; readonly result: string}>>;
    };
};

type InteroperabilityResult = {
    readonly excluded_internal_state: readonly {readonly artifact_kind: string}[];
    readonly rows: readonly InteroperabilityRow[];
    readonly systemic_class_audits: readonly {
        readonly class: string;
        readonly owner: string;
        readonly planner_cells: readonly string[];
        readonly aliases: readonly string[];
        readonly studio_routes: readonly string[];
        readonly direct_callers: readonly string[];
        readonly regressions: readonly string[];
    }[];
    readonly scenario_results: readonly {
        readonly id: string;
        readonly status: "supported" | "intentionally-unsupported";
        readonly source_path: string;
        readonly produced_path: string | null;
        readonly observable_result: string;
        readonly next_action: string | null;
        readonly execution: {
            readonly runner: string;
            readonly surface: string;
            readonly assertions: readonly string[];
            readonly observations?: readonly {readonly route: string; readonly result: string}[];
        };
    }[];
    readonly targeted_test_runs: readonly {readonly file: string; readonly purpose: string}[];
    readonly real_artifact_runs: readonly {
        readonly id: string;
        readonly source: string;
        readonly chain: readonly string[];
        readonly surfaces: readonly string[];
        readonly regression: string;
        readonly result?: string;
    }[];
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
                expect(row.execution).toMatchObject({operation: row.operation});
                expect(row.execution?.runner).toMatch(/^tests\//);
                expect(row.execution?.artifact_origin).toMatch(/produced|imported/i);
                expect(row.execution?.observations.library.result).not.toMatch(/covered/i);
                expect(row.execution?.observations.cli.result).not.toMatch(/covered/i);
            } else {
                expect(row.status).toBe("intentionally-unsupported");
                expect(row.reason).toContain(row.source_path);
                expect(row.next_action).toBeDefined();
                expect(row.diagnostic).toMatchObject({code: "unsupported-artifact-operation", recovery: row.next_action});
                expect(row.diagnostic?.shared_owner).toMatch(/ArtifactConversionPlanner|describeUnsupportedProjectOperation|ArtifactOperationDiagnostic/);
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

    it("executes the concrete shared diagnostic retained for every unavailable artifact-operation row", () => {
        for (const row of result.rows.filter((entry) => entry.status === "intentionally-unsupported")) {
            const diagnostic = describeUnavailableArtifactOperation(row.artifact_kind, row.operation, row.source_path);
            expect(diagnostic).toBeDefined();
            expect(row.diagnostic?.shared_owner).toBe(diagnostic?.sharedOwner);
            expect(row.diagnostic).toMatchObject({
                code: diagnostic?.code,
                recovery: diagnostic?.recovery,
                message: diagnostic?.message,
            });
            expect(row.reason).toContain(diagnostic?.message ?? "");
        }
    });

    it("documents class-level ownership rather than command-local exceptions", () => {
        expect(result.systemic_class_audits).toEqual(expect.arrayContaining([
            expect.objectContaining({class: "shared conversion diagnostic parity", owner: "ArtifactConversionPlanner"}),
            expect.objectContaining({class: "provenance and freshness binding"}),
            expect.objectContaining({class: "durable publication ownership"}),
        ]));
        for (const audit of result.systemic_class_audits) {
            expect(audit.planner_cells.length).toBeGreaterThan(0);
            expect(audit.aliases.length).toBeGreaterThan(0);
            expect(audit.studio_routes.length).toBeGreaterThan(0);
            expect(audit.direct_callers.length).toBeGreaterThan(0);
            expect(audit.regressions).toEqual(expect.arrayContaining([
                expect.stringMatching(/^tests\/project\//),
                expect.stringMatching(/^tests\/cli\//),
            ]));
        }
    });

    it("enumerates the complete public scope for every systemic class instead of a coverage label", () => {
        const conversion = result.systemic_class_audits.find((audit) => audit.class === "shared conversion diagnostic parity");
        expect(conversion?.planner_cells).toEqual(expect.arrayContaining([
            "blueprint→blueprint", "blueprint→tsPackage", "blueprint→outcomeLibrary", "blueprint→stakeAdapter", "blueprint→parWorkbook",
            "tsPackage→blueprint", "tsPackage→tsPackage", "tsPackage→outcomeLibrary", "tsPackage→stakeAdapter", "tsPackage→parWorkbook",
            "outcomeLibrary→blueprint", "outcomeLibrary→tsPackage", "outcomeLibrary→outcomeLibrary", "outcomeLibrary→stakeAdapter", "outcomeLibrary→parWorkbook",
            "stakeAdapter→blueprint", "stakeAdapter→tsPackage", "stakeAdapter→outcomeLibrary", "stakeAdapter→stakeAdapter", "stakeAdapter→parWorkbook",
            "parWorkbook→blueprint", "parWorkbook→tsPackage", "parWorkbook→outcomeLibrary", "parWorkbook→stakeAdapter", "parWorkbook→parWorkbook",
            "wasm→blueprint", "wasm→tsPackage", "wasm→outcomeLibrary", "wasm→stakeAdapter", "wasm→parWorkbook",
        ]));
        expect(conversion?.aliases).toEqual(expect.arrayContaining([
            "build", "export", "import", "par", "outcomelibrary", "stakeengine", "validate", "inspect", "sim", "report", "replay", "sample", "serve", "certification", "fairness",
        ]));
        expect(conversion?.studio_routes).toEqual(expect.arrayContaining([
            "/api/project/context", "/api/inspect", "/api/validate", "/api/artifacts/targets", "/api/artifacts/preview", "/api/artifacts/build", "/api/artifact-jobs/:id",
        ]));
        expect(conversion?.direct_callers).toEqual(expect.arrayContaining([
            "ArtifactConversionPlanner", "ArtifactBuilderRegistry", "ProjectTargetResolver", "describeUnsupportedProjectOperation",
        ]));

        const lifecycle = result.systemic_class_audits.find((audit) => audit.class === "provenance and freshness binding");
        expect(lifecycle?.studio_routes).toEqual(expect.arrayContaining([
            "/api/project/outcome-libraries/generate", "/api/simulations", "/api/replays", "/api/play", "/api/certification", "/api/fairness",
        ]));
        expect(lifecycle?.direct_callers).toEqual(expect.arrayContaining([
            "ParSheetImporter", "OutcomeLibraryBundleWriter", "StakeEngineImporter", "replayOutcomeSourceProject", "CertificationEvidenceBundleVerifier", "FairnessRoundProofVerifier",
        ]));
    });

    it("binds every claimed lifecycle disposition to its executable real-artifact runner", () => {
        const requiredScenarios = [
            "par-lossless-roundtrip",
            "stake-library-roundtrip",
            "exact-source-provenance",
            "prepared-descriptor-drift",
            "prepared-source-drift",
            "prepared-destination-drift",
            "managed-library-compatibility",
            "durable-publication-recovery",
            "wasm-boundary",
        ];
        expect(result.scenario_results.map((scenario) => scenario.id)).toEqual(expect.arrayContaining(requiredScenarios));
        for (const scenario of result.scenario_results) {
            expect(scenario.source_path).toMatch(/^run-artifacts\//);
            expect(scenario.observable_result).not.toHaveLength(0);
            expect(scenario.execution.runner).toMatch(/^tests\//);
            expect(scenario.execution.surface).not.toHaveLength(0);
            expect(scenario.execution.assertions.length).toBeGreaterThan(0);
            expect(scenario.execution.observations?.length).toBeGreaterThan(0);
            for (const observation of scenario.execution.observations ?? []) {
                expect(observation.route).not.toHaveLength(0);
                expect(observation.result).not.toMatch(/coverage|generic|representative/i);
            }
            if (scenario.status === "intentionally-unsupported") {
                expect(scenario.produced_path).toBeNull();
                expect(scenario.next_action).toMatch(/Blueprint|package|inspect|choose|use/i);
            }
        }
    });

    it("records command observations only from the durable paths emitted after public operations complete", () => {
        const ledger = result.real_artifact_runs.find((run) => run.id === "cli-operation-observation-ledger");
        expect(ledger).toMatchObject({
            source: "generated Blueprint, Outcome Library bundle, and simulation report",
            regression: "tests/cli/ArtifactInteroperabilityTorture.integration.test.ts",
        });
        expect(ledger?.chain).toEqual([
            "blueprint:validate",
            "outcomeLibrary:validate",
            "outcomeLibrary:inspect",
            "outcomeLibrary:simulate",
            "outcomeLibrary:replay",
            "outcomeLibrary:report",
        ]);
        expect(ledger?.surfaces).toEqual([
            "ValidateCommand",
            "InspectCommand",
            "SimCommand",
            "ReplayCommand",
            "ReportCommand",
        ]);
        expect(ledger?.result).toMatch(/writes pc-14-operation-observations\.json only after every command exits successfully/i);
    });

    it("keeps the complete PC-14 lifecycle closure attached to the exact owner regressions", () => {
        const expectedTargetedFiles = [
            "tests/cli/ArtifactInteroperabilityTorture.integration.test.ts",
            "tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts",
            "tests/project/ArtifactInteroperabilityRemediation.contract.test.ts",
            "tests/project/BuildProductMatrix.contract.test.ts",
            "tests/cli/BuildProductMatrix.crossSurface.contract.test.ts",
            "tests/project/ArtifactBuilderRegistry.test.ts",
            "tests/project/ArtifactConversionPlanner.test.ts",
            "tests/cli/commands/OutcomeLibraryCommand.test.ts",
            "tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts",
            "tests/cli/ParSheetRoundTrip.integration.test.ts",
            "tests/parsheet/ParSheetImporter.test.ts",
            "tests/parsheet/mapping/ProvenanceSheetMapper.test.ts",
            "tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts",
            "tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts",
            "tests/weightedoutcome/bundle/OutcomeLibraryBundleWriter.test.ts",
            "tests/cli/CertificationFairnessLifecycle.integration.test.ts",
            "tests/fairness/FairnessRoundProofVerifier.test.ts",
            "tests/project/replayOutcomeSourceProject.test.ts",
            "tests/cli/studio/StudioCapabilityConvergence.integration.test.ts",
            "tests/cli/studio/StudioServer.test.ts",
            "tests/cli/studio/runtime/StudioPlayService.test.ts",
        ];
        expect(result.targeted_test_runs.map((run) => run.file)).toEqual(expectedTargetedFiles);
        for (const run of result.targeted_test_runs) expect(run.purpose).not.toMatch(/coverage|generic|representative/i);

        const scenarios = new Map(result.scenario_results.map((scenario) => [scenario.id, scenario]));
        for (const id of [
            "descriptor-byte-drift",
            "referenced-source-byte-drift",
            "manifest-index-drift",
            "configuration-drift",
            "cross-game-reuse-rejection",
            "cross-version-hash-reuse-rejection",
            "sampling-policy-reuse-rejection",
            "partial-import-recovery",
            "bundle-publication-cancellation",
            "studio-artifact-job-cancellation",
            "simulation-cancellation-recovery",
            "replay-cancellation-recovery",
            "borrowed-output-cleanup",
            "portable-exact-outcome-replay",
            "best-effort-package-replay",
        ]) expect(scenarios.get(id)).toBeDefined();
        expect(scenarios.get("portable-exact-outcome-replay")?.observable_result).toMatch(/portable.*exact/i);
        expect(scenarios.get("best-effort-package-replay")?.observable_result).toMatch(/best-effort/i);
    });
});
