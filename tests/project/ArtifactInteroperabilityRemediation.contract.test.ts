import fs from "fs";
import crypto from "crypto";
import os from "os";
import path from "path";
import {spawnSync} from "child_process";
import {pathToFileURL} from "url";
import {
    ArtifactConversionPlanner,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    PROJECT_TYPE_CAPABILITIES,
    type PokieProject,
} from "../../src/index.js";
import {installPc14FixedRunnerClock, mergeArtifactInteroperabilityRuns, pc05PublicOwnerOperations} from "../support/ArtifactInteroperabilityRun.js";

type EmittedRecord = {
    readonly id: string;
    readonly artifact_kind: string;
    readonly operation_owner: string;
    readonly registry_operation?: "created_by" | "recognized_by" | "runs_by" | "validates_by" | "reports_by" | "replays_by";
    readonly source_path: string;
    readonly source_identity: string;
    readonly produced_path: string | null;
    readonly produced_identity: string | null;
    readonly observable_result: string;
    readonly observations?: readonly {readonly surface: string; readonly owner: string; readonly result: string}[];
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
    readonly owner_inventory_traceability: readonly {
        readonly artifact_kind: string;
        readonly registry_operation: "created_by" | "recognized_by" | "runs_by" | "validates_by" | "reports_by" | "replays_by";
        readonly public_owner: string;
        readonly capability_identity: string;
    }[];
    readonly capability_matrix: readonly {
        readonly capability_identity: string;
        readonly artifact_kind: string;
        readonly registry_operation: "created_by" | "recognized_by" | "runs_by" | "validates_by" | "reports_by" | "replays_by";
        readonly public_owner: string;
        readonly disposition: "canonical-proof" | "external-boundary";
        readonly canonical_proof?: {
            readonly record_id: string;
            readonly operation_owner: string;
            readonly source_path: string;
            readonly produced_path: string | null;
            readonly observable_result: string;
        };
        readonly boundary?: {readonly code: string; readonly message: string; readonly recovery: string};
    }[];
    readonly lifecycle_capability_matrix: readonly {
        readonly capability_identity: string;
        readonly scenario_result_id: string;
        readonly surface: string;
        readonly owner: string;
        readonly observations: readonly {readonly route: string; readonly result: string}[];
        readonly assertions: readonly string[];
        readonly systemic_classes: readonly string[];
    }[];
    readonly independent_review_contract: {
        readonly mode: string;
        readonly raw_owner_rows: string;
        readonly duplicate_wrapper_counter: string;
        readonly adapter_parity: string;
    };
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
            readonly executed_operation_tuples: readonly {
                readonly artifact_kind: string;
                readonly registry_operation: string;
                readonly public_owner: string;
                readonly surface: string;
                readonly record_id: string;
            }[];
            readonly regression_links: readonly string[];
        };
    }[];
};

const evidencePath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-14-artifact-torture/interoperability-result.json");
// The clean process runs the three real-artifact suites serially. Its budget
// covers their measured constrained-worker workload; leave a larger parent
// deadline so Jest can collect the child process's terminal comparison.
const cleanProcessRegenerationTimeout = 420000;
const cleanProcessContractTimeout = 450000;

function exactComparisonResult(scriptPath: string, resultFile: string, freshBytes: Buffer, committedBytes: Buffer) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc14-exact-comparison-"));
    const freshPath = path.join(directory, "fresh.json");
    const committedPath = path.join(directory, "committed.json");
    fs.writeFileSync(freshPath, freshBytes);
    fs.writeFileSync(committedPath, committedBytes);
    const program = [
        `import {assertExactPc14Evidence} from ${JSON.stringify(pathToFileURL(scriptPath).href)};`,
        'import fs from "node:fs";',
        "const [freshPath, committedPath] = process.argv.slice(1);",
        "const fresh = fs.readFileSync(freshPath);",
        "const committed = fs.readFileSync(committedPath);",
        `try { assertExactPc14Evidence(${JSON.stringify(resultFile)}, fresh, committed); }`,
        "catch (error) { process.stderr.write(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }",
    ].join("\n");
    try {
        return spawnSync(process.execPath, ["--input-type=module", "--eval", program, freshPath, committedPath], {encoding: "utf-8"});
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
}

function project(type: PokieProject["type"]): PokieProject {
    return {type, rootPath: `/artifacts/${type}`, provenance: "torture-contract", capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

describe("PC-14 artifact interoperability remediation contract", () => {
    const result = JSON.parse(fs.readFileSync(evidencePath, "utf-8")) as InteroperabilityResult;

    it("retains only records emitted by the real CLI and Studio runners", () => {
        expect(result).toMatchObject({"schema_version": 6, "step_id": "PC-14", "generated_by": "ArtifactInteroperabilityRun.mergeArtifactInteroperabilityRuns"});
        expect(result.runner_inputs).toEqual([
            expect.objectContaining({file: "cli-real-artifact-result.json", sha256: expect.stringMatching(/^sha256:/), rows: expect.any(Number), scenarios: expect.any(Number)}),
            expect.objectContaining({file: "studio-real-artifact-result.json", sha256: expect.stringMatching(/^sha256:/), rows: expect.any(Number), scenarios: expect.any(Number)}),
            expect.objectContaining({file: "studio-ui-real-artifact-result.json", sha256: expect.stringMatching(/^sha256:/), rows: expect.any(Number), scenarios: expect.any(Number)}),
        ]);
        expect(result.rows).toHaveLength(result.runner_inputs.reduce((count, input) => count + input.rows, 0));
        expect(result.scenario_results).toHaveLength(result.runner_inputs.reduce((count, input) => count + input.scenarios, 0));
        // A retained PC-05 inventory owner is never backfilled as a runner
        // row. Its capability must instead be represented by the matrix
        // below, which distinguishes a real canonical case from an adapter
        // and an unexecuted diagnostic.
        expect(result.rows.some((row) => row.id.startsWith("pc05-owner-boundary-"))).toBe(false);
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

    it("runs the published PC-14 driver in an isolated disposable worktree", () => {
        const script = fs.readFileSync(path.resolve(process.cwd(), "scripts/generate-pc14-interoperability-evidence.mjs"), "utf-8");
        const publishedRevisionReference = `${String.fromCharCode(36)}{publishedPc14Revision}`;
        expect(script).toContain('const publishedPc14Revision = "2288476da74448ddcd2e3bfb1d5a29f6bde4a75b"');
        expect(script).toContain(`git(["rev-parse", "--verify", \`${publishedRevisionReference}^{commit}\`])`);
        expect(script).toContain('git(["worktree", "add", "--detach", historicalSourceDirectory, resolvedPc14Revision])');
        expect(script).toContain('path.join(historicalSourceDirectory, "node_modules")');
        expect(script).toContain('run("cp", ["-al", path.join(repositoryRoot, "node_modules", entry)');
        expect(script).toContain('"^pokie$": "<rootDir>/src/index.ts"');
        expect(script).toContain('path.join(historicalSourceDirectory, "scripts", "generate-pc14-interoperability-evidence.mjs"), "--write"');
        expect(script).toContain('for (const file of committedFiles)');
        expect(script).toContain('assertExactPc14Evidence(file, fresh, committed)');
        expect(script).toContain('git(["worktree", "remove", "--force", historicalSourceDirectory])');
        expect(script).toContain("if (!freshBytes.equals(committedBytes))");
        expect(script).not.toContain("normaliseEvidenceIdentitySnapshot");
        expect(script).not.toContain("<artifact-identity>");
        expect(script).not.toContain("<runner-identity>");
        expect(script).not.toContain("PC14_FIXED_RUNNER_IDENTITY");
        expect(script).not.toContain("task_PC-14-");
        expect(script).not.toContain("/home/stager/");
    });

    it("byte-compares every versioned runner result to immutable PC-14 evidence", () => {
        if (process.env.PC14_INTEROPERABILITY_REGENERATION_CHILD === "1") return;
        const scriptPath = path.resolve(process.cwd(), "scripts/generate-pc14-interoperability-evidence.mjs");
        const result = spawnSync(process.execPath, [scriptPath], {
            cwd: process.cwd(),
            env: {...process.env, PC14_INTEROPERABILITY_REGENERATION_CHILD: "1"},
            encoding: "utf-8",
            timeout: cleanProcessRegenerationTimeout,
        });
        expect(result.error).toBeUndefined();
        const output = `${result.stdout}\n${result.stderr}`;
        if (result.status !== 0) throw new Error(output);
        expect(output).toContain("PASS tests/cli/ArtifactInteroperabilityTorture.integration.test.ts");
        expect(output).toContain("PASS tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts");
        expect(output).toContain("PASS tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx");
        expect(output).not.toContain("PC-14 evidence is not reproducible");
    }, cleanProcessContractTimeout);

    it("retains the committed generated-package source identity for every matrix tsPackage consumer", () => {
        const cliResultPath = path.join(path.dirname(evidencePath), "cli-real-artifact-result.json");
        const cliResult = JSON.parse(fs.readFileSync(cliResultPath, "utf-8")) as InteroperabilityResult;
        const matrixPackageIdentity = "sha256:b38ac173331260829e56ed9c4f7073b36aaa640652ff40a307116f71e520106b";
        const matrixPackageRows = cliResult.rows.filter((row) => row.source_path === "run-artifacts/matrix-package");

        expect(matrixPackageRows.map((row) => row.id)).toEqual(expect.arrayContaining([
            "matrix-tsPackage-blueprint-build",
            "matrix-tsPackage-outcomeLibrary-build",
            "matrix-tsPackage-stakeAdapter-build",
            "package-generate-raw-outcomes",
            "package-replay",
            "package-simulate",
        ]));
        expect(matrixPackageRows).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "matrix-tsPackage-blueprint-build", "source_identity": matrixPackageIdentity}),
        ]));
        expect(matrixPackageRows.every((row) => row.source_identity === matrixPackageIdentity)).toBe(true);
    });

    it("rejects identity and runner-input drift instead of treating provenance as cosmetic", () => {
        const scriptPath = path.resolve(process.cwd(), "scripts/generate-pc14-interoperability-evidence.mjs");
        const cliResultPath = path.join(path.dirname(evidencePath), "cli-real-artifact-result.json");
        const cliResultBytes = fs.readFileSync(cliResultPath);
        const cliResult = JSON.parse(cliResultBytes.toString("utf-8")) as InteroperabilityResult;
        const sourceIdentityDrift = structuredClone(cliResult);
        const producedIdentityDrift = structuredClone(cliResult);
        const mergedResultBytes = fs.readFileSync(evidencePath);
        const mergedResult = JSON.parse(mergedResultBytes.toString("utf-8")) as InteroperabilityResult;
        const runnerInputDrift = structuredClone(mergedResult);

        const sourceRow = sourceIdentityDrift.rows.find((row) => row.id === "matrix-tsPackage-blueprint-build");
        const producedRow = producedIdentityDrift.rows.find((row) => row.id === "blueprint-build-package");
        expect(sourceRow).toBeDefined();
        expect(producedRow).toBeDefined();
        (sourceRow as unknown as Record<string, string>)["source_identity"] = "sha256:changed-source-identity";
        (producedRow as unknown as Record<string, string | null>)["produced_identity"] = "sha256:changed-produced-identity";
        (runnerInputDrift.runner_inputs[0] as {sha256: string}).sha256 = "sha256:changed-runner-input";

        const sourceIdentityResult = exactComparisonResult(scriptPath, "cli-real-artifact-result.json", Buffer.from(`${JSON.stringify(sourceIdentityDrift, null, 2)}\n`), cliResultBytes);
        const producedIdentityResult = exactComparisonResult(scriptPath, "cli-real-artifact-result.json", Buffer.from(`${JSON.stringify(producedIdentityDrift, null, 2)}\n`), cliResultBytes);
        const runnerInputResult = exactComparisonResult(scriptPath, "interoperability-result.json", Buffer.from(`${JSON.stringify(runnerInputDrift, null, 2)}\n`), mergedResultBytes);

        expect(sourceIdentityResult.status).toBe(1);
        expect(sourceIdentityResult.stderr).toMatch(/json_path=\$\.rows\[.*\]\.source_identity/);
        expect(producedIdentityResult.status).toBe(1);
        expect(producedIdentityResult.stderr).toMatch(/json_path=\$\.rows\[.*\]\.produced_identity/);
        expect(runnerInputResult.status).toBe(1);
        expect(runnerInputResult.stderr).toMatch(/json_path=\$\.runner_inputs\[0\]\.sha256/);
    });

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
            expect(row).not.toHaveProperty("executed_public_owners");
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
                "executed_operation_tuples": expect.any(Array),
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

    it("merges the saved runner set into capability proofs without synthetic owner completion", () => {
        const outputPath = path.join(process.cwd(), "node_modules/.cache/pokie-tmp/pc14-rejected-interoperability-result.json");
        expect(() => mergeArtifactInteroperabilityRuns(
            result.runner_inputs.map((input) => path.join(path.dirname(evidencePath), input.file)),
            outputPath,
        )).not.toThrow();
        expect(JSON.parse(fs.readFileSync(outputPath, "utf-8"))).toMatchObject({"step_id": "PC-14", "schema_version": 6});
        fs.rmSync(outputPath, {force: true});
    });

    it("keeps PC-05 owner rows as traceability while reviewing only distinct retained capabilities", () => {
        const registryPath = path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json");
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8")) as Parameters<typeof pc05PublicOwnerOperations>[0];
        const required = pc05PublicOwnerOperations(registry);
        expect(result.owner_inventory_traceability).toHaveLength(required.length);
        expect(new Set(result.owner_inventory_traceability.map((entry) => entry.capability_identity)).size).toBe(required.length);
        for (const requiredRow of required) {
            const identity = JSON.stringify([requiredRow.artifactKind, requiredRow.registryOperation, requiredRow.owner]);
            expect(result.owner_inventory_traceability).toContainEqual({
                "artifact_kind": requiredRow.artifactKind,
                "registry_operation": requiredRow.registryOperation,
                "public_owner": requiredRow.owner,
                "capability_identity": identity,
            });
        }
        expect(result.capability_matrix.length).toBeGreaterThan(0);
        expect(new Set(result.capability_matrix.map((entry) => entry.capability_identity)).size).toBe(result.capability_matrix.length);
        expect(result.capability_matrix.map((entry) => entry.disposition)).not.toContain("adapter-proof");
        for (const capability of result.capability_matrix) {
            if (capability.disposition === "canonical-proof") {
                expect(capability.canonical_proof).toMatchObject({
                    "operation_owner": capability.public_owner,
                    "source_path": expect.stringMatching(/^run-artifacts\//),
                    "observable_result": expect.any(String),
                });
            } else {
                expect(capability.boundary).toMatchObject({
                    code: expect.stringMatching(/^external-(?:producer|consumer)$/),
                    message: expect.any(String), recovery: expect.any(String),
                });
            }
        }
        expect(result.independent_review_contract).toEqual({
            mode: "capability_based_user_authorised_v1",
            "raw_owner_rows": "traceability-only",
            "duplicate_wrapper_counter": "not-applicable",
            "adapter_parity": expect.stringMatching(/canonical proof/i),
        });
        expect(result.registry_artifact_coverage.filter((entry) => entry.disposition === "not-executed")).toEqual([]);
        expect(result.rows.some((row) => row.id.startsWith("owner-operation-"))).toBe(false);
    });

    it("binds real provenance, stale/reuse, cancellation, and recovery lifecycles to user-visible capabilities", () => {
        expect(result.lifecycle_capability_matrix).toHaveLength(result.scenario_results.length);
        expect(new Set(result.lifecycle_capability_matrix.map((entry) => entry.capability_identity)).size)
            .toBe(result.lifecycle_capability_matrix.length);
        for (const capability of result.lifecycle_capability_matrix) {
            expect(result.scenario_results.find((scenario) => scenario.id === capability.scenario_result_id)).toBeDefined();
            expect(capability.observations.length).toBeGreaterThan(0);
            expect(capability.assertions.length).toBeGreaterThan(0);
            expect(capability.systemic_classes.length).toBeGreaterThan(0);
        }
        expect(result.lifecycle_capability_matrix.map((entry) => entry.scenario_result_id)).toEqual(expect.arrayContaining([
            "exact-source-provenance",
            "managed-reuse-sampling-policy-incompatibility",
            "cli-generation-cancellation-recovery",
            "studio-generation-recovery",
            "partial-import-recovery",
        ]));
    });
});
