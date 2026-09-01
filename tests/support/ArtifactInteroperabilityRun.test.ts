import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactInteroperabilityRun,
    classifyPc14CapabilityReviewFeedback,
    mergeArtifactInteroperabilityRuns,
    pc05CliOwnerOperations,
    pc05PublicOwnerOperations,
} from "./ArtifactInteroperabilityRun.js";

describe("ArtifactInteroperabilityRun exact tuple ledger", () => {
    let rootPath: string;

    beforeEach(() => {
        rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-ledger-"));
    });

    afterEach(() => {
        fs.rmSync(rootPath, {recursive: true, force: true});
    });

    it("rejects retired PC-05 counter feedback without suppressing capability blockers", () => {
        const counterOnly = classifyPc14CapabilityReviewFeedback([{
            kind: "retired-pc05-owner-operation-counter",
            detail: "Only 12 of the former owner-operation target ran.",
        }]);
        expect(counterOnly.disposition).toBe("retired-counter-feedback-rejected");
        expect(counterOnly.retiredCounterFeedback).toHaveLength(1);
        expect(counterOnly.blockers).toEqual([]);

        const mixedFeedback = classifyPc14CapabilityReviewFeedback([
            {kind: "retired-pc05-owner-operation-counter", detail: "The prior row counter is incomplete."},
            {kind: "user-visible-capability", detail: "The public outcome import has no usable recovery."},
            {kind: "journey", detail: "The create-to-build journey cannot reach its published artifact."},
            {kind: "parity", detail: "Studio and CLI return different conversion diagnostics."},
            {kind: "lifecycle", detail: "A cancelled publication leaves an owned destination behind."},
        ]);
        expect(mixedFeedback.disposition).toBe("blocked-by-distinct-capability-defect");
        expect(mixedFeedback.retiredCounterFeedback).toEqual([
            {kind: "retired-pc05-owner-operation-counter", detail: "The prior row counter is incomplete."},
        ]);
        expect(mixedFeedback.blockers.map((finding) => finding.kind)).toEqual([
            "user-visible-capability", "journey", "parity", "lifecycle",
        ]);
    });

    it("derives CLI ledger identities from the non-internal PC-05 registry", () => {
        const all = pc05PublicOwnerOperations(readPc05Registry());
        const cli = pc05CliOwnerOperations(readPc05Registry());
        expect(cli).toHaveLength(all.filter((entry) => entry.owner.startsWith("cli:")).length);
        expect(cli).toEqual(expect.arrayContaining([
            expect.objectContaining({artifactKind: "blueprint", registryOperation: "created_by", owner: "cli:create"}),
            expect.objectContaining({artifactKind: "outcomeLibrary", registryOperation: "runs_by", owner: "cli:sim"}),
            expect.objectContaining({artifactKind: "fairnessProof", registryOperation: "created_by", owner: "cli:fairness reveal --out"}),
        ]));
    });

    it("requires a registry operation row to retain its owner's actual surface observation", () => {
        const runner = new ArtifactInteroperabilityRun(rootPath);
        const sourcePath = path.join(rootPath, "source.json");
        fs.writeFileSync(sourcePath, "source");

        expect(() => runner.record({
            id: "mismatched-owner",
            artifactKind: "blueprint",
            operation: "recognize",
            registryOperation: "recognized_by",
            sourcePath,
            owner: "ProjectTargetResolver",
            result: "completed",
            observations: [{surface: "library", owner: "OtherReader", result: "other reader completed"}],
        })).toThrow("must bind exactly one actual surface observation from that owner");
    });

    it("keeps an out-of-run external boundary explicit instead of a legacy diagnostic", () => {
        const runner = new ArtifactInteroperabilityRun(rootPath);
        const sourcePath = path.join(rootPath, "blueprint.json");
        fs.writeFileSync(sourcePath, "{\"blueprint\":\"canonical\"}\n");
        runner.record({
            id: "canonical-create",
            artifactKind: "blueprint",
            operation: "create",
            registryOperation: "created_by",
            sourcePath,
            owner: "cli:create",
            result: "CLI created the blueprint",
            observations: [{
                surface: "library",
                owner: "cli:create",
                result: "CLI created the blueprint",
            }],
        });
        const runnerPath = path.join(rootPath, "canonical-create.json");
        runner.write(runnerPath);

        const outputPath = path.join(rootPath, "merged.json");
        mergeArtifactInteroperabilityRuns([runnerPath], outputPath);
        const result = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
            readonly capability_matrix: readonly {readonly public_owner: string; readonly disposition: string; readonly boundary?: {readonly code: string; readonly recovery: string}}[];
        };
        expect(result.capability_matrix.find((entry) => entry.public_owner === "user/external canonical outcome-stream producer"))
            .toMatchObject({disposition: "external-boundary", boundary: {code: "external-producer", recovery: expect.any(String)}});
    });

    it("retains a produced companion in owner traceability while reviewing its canonical capability", () => {
        const runner = new ArtifactInteroperabilityRun(rootPath);
        const sourcePath = path.join(rootPath, "blueprint.json");
        fs.writeFileSync(sourcePath, "{\"blueprint\":\"canonical\"}\n");
        runner.record({
            id: "cli-created-blueprint",
            artifactKind: "blueprint",
            operation: "create",
            registryOperation: "created_by",
            sourcePath,
            owner: "cli:create",
            result: "CLI created the blueprint",
            observations: [{surface: "cli", owner: "cli:create", result: "CLI created the blueprint"}],
        });
        const runnerPath = path.join(rootPath, "cli-created-blueprint.json");
        runner.write(runnerPath);

        const outputPath = path.join(rootPath, "merged.json");
        mergeArtifactInteroperabilityRuns([runnerPath], outputPath);
        const result = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
            readonly capability_matrix: readonly {
                readonly public_owner: string;
                readonly disposition: string;
                readonly "canonical_proof"?: {readonly "record_id": string; readonly "operation_owner": string; readonly "source_path": string};
            }[];
            readonly owner_inventory_traceability: readonly {readonly public_owner: string; readonly capability_identity: string}[];
        };
        expect(result.owner_inventory_traceability).toContainEqual({
            "artifact_kind": "blueprint",
            "registry_operation": "created_by",
            "public_owner": "studio:blueprint-save",
            "capability_identity": "[\"blueprint\",\"created_by\",\"studio:blueprint-save\"]",
        });
        expect(result.capability_matrix.find((entry) => entry.public_owner === "cli:create"))
            .toMatchObject({
                disposition: "canonical-proof",
                "canonical_proof": {
                    "record_id": "cli-created-blueprint",
                    "operation_owner": "cli:create",
                    "source_path": expect.stringMatching(/^run-artifacts\//),
                },
            });
        expect(result.capability_matrix.find((entry) => entry.public_owner === "studio:blueprint-save")).toBeUndefined();
    });

    it("keeps named thin wrappers as traceability while the canonical proof completes the capability", () => {
        const canonical = recordOperation("canonical", {
            id: "canonical-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "cli",
        });
        const wrapper = recordOperation("wrapper", {
            id: "wrapper-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create --out", surface: "cli",
        });
        const outputPath = path.join(rootPath, "merged.json");
        mergeArtifactInteroperabilityRuns([canonical, wrapper], outputPath);
        const result = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
            readonly capability_matrix: readonly {
                readonly public_owner: string;
                readonly disposition: string;
                readonly "canonical_proof"?: {readonly "record_id": string; readonly "operation_owner": string; readonly "observable_result": string};
            }[];
            readonly owner_inventory_traceability: readonly {readonly public_owner: string; readonly capability_identity: string}[];
        };
        expect(result.owner_inventory_traceability).toContainEqual({
            "artifact_kind": "blueprint",
            "registry_operation": "created_by",
            "public_owner": "cli:create --out",
            "capability_identity": "[\"blueprint\",\"created_by\",\"cli:create --out\"]",
        });
        expect(result.capability_matrix.find((entry) => entry.public_owner === "cli:create")).toMatchObject({
            disposition: "canonical-proof",
            "canonical_proof": {"record_id": "canonical-create", "operation_owner": "cli:create", "observable_result": expect.any(String)},
        });
        expect(result.capability_matrix.find((entry) => entry.public_owner === "cli:create --out")).toBeUndefined();
    });

    it("rejects an extra PC-05 tuple before writing merged evidence", () => {
        const sourcePath = path.join(rootPath, "source.json");
        fs.writeFileSync(sourcePath, "source");
        const runner = new ArtifactInteroperabilityRun(rootPath);
        runner.record({
            id: "synthetic-owner", artifactKind: "blueprint", operation: "recognize", registryOperation: "recognized_by",
            sourcePath, owner: "SyntheticOwner", result: "synthetic result",
            observations: [{surface: "library", owner: "SyntheticOwner", result: "synthetic result"}],
        });
        const runnerPath = path.join(rootPath, "extra.json");
        runner.write(runnerPath);

        const outputPath = path.join(rootPath, "merged.json");
        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], outputPath))
            .toThrow("exact owner-operation tuple absent from PC-05");
        expect(fs.existsSync(outputPath)).toBe(false);
    });

    it("rejects a known owner promoted to a sibling registry operation", () => {
        const sourcePath = path.join(rootPath, "source.json");
        fs.writeFileSync(sourcePath, "source");
        const runner = new ArtifactInteroperabilityRun(rootPath);
        runner.record({
            id: "sibling-operation", artifactKind: "blueprint", operation: "recognize", registryOperation: "recognized_by",
            sourcePath, owner: "GameBlueprintValidator", result: "synthetic recognition",
            observations: [{surface: "library", owner: "GameBlueprintValidator", result: "synthetic recognition"}],
        });
        const runnerPath = path.join(rootPath, "sibling.json");
        runner.write(runnerPath);

        const outputPath = path.join(rootPath, "merged.json");
        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], outputPath))
            .toThrow("exact owner-operation tuple absent from PC-05: blueprint:recognized_by:GameBlueprintValidator");
        expect(fs.existsSync(outputPath)).toBe(false);
    });

    it("rejects duplicate direct proof records even when their sources differ", () => {
        const first = recordOperation("first", {
            id: "first-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "cli",
        });
        const second = recordOperation("second", {
            id: "second-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "library",
        });

        const outputPath = path.join(rootPath, "merged.json");
        expect(() => mergeArtifactInteroperabilityRuns([first, second], outputPath))
            .toThrow("duplicate exact owner-operation evidence: blueprint:created_by:cli:create");
        expect(fs.existsSync(outputPath)).toBe(false);
    });

    it("rejects persisted synthetic owner-operation fallback records", () => {
        const runnerPath = recordOperation("direct", {
            id: "owner-operation-synthetic", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "cli",
        });
        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json")))
            .toThrow("synthetic owner-operation evidence for owner-operation-synthetic");
    });

    it("rejects proxy owner declarations instead of promoting sibling operations", () => {
        const sourcePath = path.join(rootPath, "source.json");
        fs.writeFileSync(sourcePath, "source");
        const runner = new ArtifactInteroperabilityRun(rootPath);

        const proxyOwnerRow: Parameters<ArtifactInteroperabilityRun["record"]>[0] = {
            id: "proxy-owner", artifactKind: "blueprint", operation: "create", registryOperation: "created_by",
            sourcePath, owner: "cli:create", result: "created",
            observations: [{surface: "cli", owner: "cli:create", result: "created"}],
        };
        // The public API intentionally has no proxy field. Exercise the
        // runtime guard too, because runner rows are persisted JSON.
        Reflect.set(proxyOwnerRow, "executed_public_owners", ["GameBlueprintValidator"]);
        expect(() => runner.record(proxyOwnerRow)).toThrow(
            "proxy-owner cannot declare executed_public_owners",
        );
        expect(fs.existsSync(path.join(rootPath, "proxy.json"))).toBe(false);
    });

    it("rejects persisted proxy owner declarations before merging evidence", () => {
        const runnerPath = recordOperation("direct", {
            id: "direct-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "cli",
        });
        const proxy = JSON.parse(fs.readFileSync(runnerPath, "utf-8")) as {readonly rows: Array<Record<string, unknown>>};
        proxy.rows[0]!["executed_public_owners"] = ["GameBlueprintValidator"];
        fs.writeFileSync(runnerPath, `${JSON.stringify(proxy)}\n`);

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json")))
            .toThrow("emitted proxy owner coverage for direct-create");
    });

    function readPc05Registry(): Parameters<typeof pc05PublicOwnerOperations>[0] {
        return JSON.parse(fs.readFileSync(path.resolve(
            process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json",
        ), "utf-8")) as Parameters<typeof pc05PublicOwnerOperations>[0];
    }


    function recordOperation(
        name: string,
        operation: {
            readonly id: string;
            readonly artifactKind: string;
            readonly operation: string;
            readonly registryOperation?: "created_by" | "recognized_by" | "runs_by";
            readonly owner: string;
            readonly surface: "cli" | "studio-api" | "library";
        },
    ): string {
        const runnerPath = path.join(rootPath, name);
        fs.mkdirSync(runnerPath);
        const sourcePath = path.join(runnerPath, `${name}-source.json`);
        const producedPath = path.join(runnerPath, `${name}-output.json`);
        fs.writeFileSync(sourcePath, `${name} source`);
        fs.writeFileSync(producedPath, `${name} output`);
        const runner = new ArtifactInteroperabilityRun(runnerPath);
        runner.record({
            id: operation.id,
            artifactKind: operation.artifactKind,
            operation: operation.operation,
            ...(operation.registryOperation === undefined ? {} : {registryOperation: operation.registryOperation}),
            sourcePath,
            producedPath,
            owner: operation.owner,
            result: `${name} completed ${operation.operation}`,
            observations: [{surface: operation.surface, owner: operation.owner, result: `${name} completed ${operation.operation}`}],
        });
        const evidencePath = path.join(rootPath, `${name}-runner.json`);
        runner.write(evidencePath);
        return evidencePath;
    }
});
