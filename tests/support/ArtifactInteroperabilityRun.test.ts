import fs from "fs";
import os from "os";
import path from "path";
import {ArtifactInteroperabilityRun, mergeArtifactInteroperabilityRuns} from "./ArtifactInteroperabilityRun.js";

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

    it("retains separate CLI, Studio, and library exact tuples with their observed artifacts", () => {
        const cliPath = recordOperation("cli", {
            id: "cli-create-blueprint",
            artifactKind: "blueprint",
            operation: "create",
            registryOperation: "created_by",
            owner: "cli:create",
            surface: "cli",
        });
        const studioPath = recordOperation("studio", {
            id: "studio-run-outcome-library",
            artifactKind: "outcomeLibrary",
            operation: "run",
            registryOperation: "runs_by",
            owner: "studio:simulation",
            surface: "studio-api",
        });
        const libraryPath = recordOperation("library", {
            id: "library-recognize-blueprint",
            artifactKind: "blueprint",
            operation: "recognize",
            registryOperation: "recognized_by",
            owner: "ProjectTargetResolver",
            surface: "library",
        });
        // This owner is deliberately present in PC-05, but has no registry
        // operation in this runner row. The merger must not infer one from
        // the owner name or artifact kind.
        const ownerOnlyPath = recordOperation("owner-only", {
            id: "owner-only-validation",
            artifactKind: "blueprint",
            operation: "validate",
            owner: "GameBlueprintValidator",
            surface: "library",
        });
        const outputPath = path.join(rootPath, "merged.json");

        mergeArtifactInteroperabilityRuns([cliPath, studioPath, libraryPath, ownerOnlyPath], outputPath);

        const output = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
            readonly exact_owner_operation_coverage: readonly ExactTuple[];
        };
        expect(output.exact_owner_operation_coverage).toHaveLength(3);
        expect(output.exact_owner_operation_coverage).toEqual(expect.arrayContaining([
            expect.objectContaining({
                "exact_tuple_identity": JSON.stringify(["blueprint", "created_by", "cli:create", "cli"]),
                "artifact_kind": "blueprint",
                "registry_operation": "created_by",
                "public_owner": "cli:create",
                surface: "cli",
                "record_id": "cli-create-blueprint",
                "source_path": "run-artifacts/cli-source.json",
                "produced_path": "run-artifacts/cli-output.json",
                "observable_result": "cli completed create",
            }),
            expect.objectContaining({
                "exact_tuple_identity": JSON.stringify(["outcomeLibrary", "runs_by", "studio:simulation", "studio-api"]),
                "artifact_kind": "outcomeLibrary",
                "registry_operation": "runs_by",
                "public_owner": "studio:simulation",
                surface: "studio-api",
                "record_id": "studio-run-outcome-library",
                "source_path": "run-artifacts/studio-source.json",
                "produced_path": "run-artifacts/studio-output.json",
                "observable_result": "studio completed run",
            }),
            expect.objectContaining({
                "exact_tuple_identity": JSON.stringify(["blueprint", "recognized_by", "ProjectTargetResolver", "library"]),
                "artifact_kind": "blueprint",
                "registry_operation": "recognized_by",
                "public_owner": "ProjectTargetResolver",
                surface: "library",
                "record_id": "library-recognize-blueprint",
                "source_path": "run-artifacts/library-source.json",
                "produced_path": "run-artifacts/library-output.json",
                "observable_result": "library completed recognize",
            }),
        ]));
        expect(output.exact_owner_operation_coverage.some((entry) => entry.public_owner === "GameBlueprintValidator")).toBe(false);
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

    it("rejects missing PC-05 owner-operation evidence before writing merged evidence", () => {
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
        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json"), {requireComplete: true}))
            .toThrow("PC-14 is missing exact owner-operation evidence");
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

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json"), {requireComplete: false}))
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

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json"), {requireComplete: false}))
            .toThrow("exact owner-operation tuple absent from PC-05: blueprint:recognized_by:GameBlueprintValidator");
    });

    it("rejects duplicate PC-05 tuple records even when their sources differ", () => {
        const first = recordOperation("first", {
            id: "first-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "cli",
        });
        const second = recordOperation("second", {
            id: "second-create", artifactKind: "blueprint", operation: "create", registryOperation: "created_by", owner: "cli:create", surface: "library",
        });

        expect(() => mergeArtifactInteroperabilityRuns([first, second], path.join(rootPath, "merged.json"), {requireComplete: false}))
            .toThrow("duplicate exact owner-operation evidence: blueprint:created_by:cli:create");
    });

    it("rejects proxy owner declarations instead of promoting sibling operations", () => {
        const sourcePath = path.join(rootPath, "source.json");
        fs.writeFileSync(sourcePath, "source");
        const runner = new ArtifactInteroperabilityRun(rootPath);

        const proxyOwnerRow = {
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

        expect(() => mergeArtifactInteroperabilityRuns([runnerPath], path.join(rootPath, "merged.json"), {requireComplete: false}))
            .toThrow("emitted proxy owner coverage for direct-create");
    });

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
