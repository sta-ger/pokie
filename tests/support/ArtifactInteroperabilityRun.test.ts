import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactInteroperabilityRun,
    classifyPc14CapabilityReviewFeedback,
    mergeArtifactInteroperabilityRuns,
    pc05PublicOwnerOperations,
} from "./ArtifactInteroperabilityRun.js";

type ExactTuple = {
    readonly "exact_tuple_identity": string;
    readonly "artifact_kind": string;
    readonly "registry_operation": string;
    readonly "public_owner": string;
    readonly surface: string;
    readonly "record_id": string;
    readonly "source_path": string;
    readonly "produced_path": string | null;
    readonly "observable_result": string;
    readonly diagnostic?: {readonly code: string; readonly recovery: string};
};

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

    it("accepts only a complete PC-05 inventory of runner-emitted exact tuples", () => {
        const runnerPath = recordCompletePc05Inventory();
        const outputPath = path.join(rootPath, "merged.json");

        mergeArtifactInteroperabilityRuns([runnerPath], outputPath);

        const output = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
            readonly exact_owner_operation_coverage: readonly ExactTuple[];
            readonly capability_matrix: readonly {
                readonly capability_identity: string;
                readonly disposition: string;
                readonly adapter_proof?: {
                    readonly canonical_capability_identity: string;
                    readonly record_id: string;
                };
            }[];
        };
        const required = pc05PublicOwnerOperations(readPc05Registry());
        expect(output.exact_owner_operation_coverage).toHaveLength(required.length);
        expect(output.exact_owner_operation_coverage).toEqual(expect.arrayContaining([
            expect.objectContaining({"exact_tuple_identity": JSON.stringify(["blueprint", "created_by", "cli:create", "library"])}),
            expect.objectContaining({"exact_tuple_identity": JSON.stringify(["outcomeLibrary", "runs_by", "studio:simulation", "library"])}),
            expect.objectContaining({"exact_tuple_identity": JSON.stringify(["blueprint", "recognized_by", "ProjectTargetResolver", "library"])}),
        ]));
        expect(output.capability_matrix.every((entry) => entry.disposition === "canonical-proof")).toBe(true);
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

    it("rejects an adapter-only tuple instead of borrowing a sibling operation", () => {
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

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json")))
            .toThrow("missing required exact owner-operation evidence");
    });

    it("rejects missing PC-05 owner-operation evidence before writing a result", () => {
        const sourcePath = path.join(rootPath, "source.json");
        fs.writeFileSync(sourcePath, "source");
        const runner = new ArtifactInteroperabilityRun(rootPath);
        runner.record({
            id: "one-owner", artifactKind: "blueprint", operation: "recognize", registryOperation: "recognized_by",
            sourcePath, owner: "ProjectTargetResolver", result: "recognized",
            observations: [{surface: "library", owner: "ProjectTargetResolver", result: "recognized"}],
        });
        const runnerPath = path.join(rootPath, "partial.json");
        runner.write(runnerPath);
        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json")))
            .toThrow("missing required exact owner-operation evidence: blueprint:created_by:cli:create");
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

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json")))
            .toThrow("exact owner-operation tuple absent from PC-05");
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

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json")))
            .toThrow("exact owner-operation tuple absent from PC-05: blueprint:recognized_by:GameBlueprintValidator");
    });

    it("rejects duplicate PC-05 tuple records even when their sources differ", () => {
        const first = recordOperation("first", {
            id: "first-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "cli",
        });
        const second = recordOperation("second", {
            id: "second-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "library",
        });

        expect(() => mergeArtifactInteroperabilityRuns([first, second], path.join(rootPath, "merged.json")))
            .toThrow("duplicate exact owner-operation evidence: blueprint:created_by:cli:create");
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

    function recordCompletePc05Inventory(): string {
        const runnerRoot = path.join(rootPath, "complete-inventory");
        fs.mkdirSync(runnerRoot);
        const sourcePath = path.join(runnerRoot, "source.json");
        const producedPath = path.join(runnerRoot, "output.json");
        fs.writeFileSync(sourcePath, "source");
        fs.writeFileSync(producedPath, "output");
        const runner = new ArtifactInteroperabilityRun(runnerRoot);
        for (const [index, required] of pc05PublicOwnerOperations(readPc05Registry()).entries()) {
            const result = `completed ${required.registryOperation} for ${required.owner}`;
            runner.record({
                id: `complete-${index}`,
                artifactKind: required.artifactKind,
                operation: required.registryOperation,
                registryOperation: required.registryOperation,
                sourcePath,
                producedPath,
                owner: required.owner,
                result,
                observations: [{surface: "library", owner: required.owner, result}],
            });
        }
        const evidencePath = path.join(rootPath, "complete-runner.json");
        runner.write(evidencePath);
        return evidencePath;
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
