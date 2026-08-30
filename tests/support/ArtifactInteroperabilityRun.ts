import fs from "fs";
import crypto from "crypto";
import path from "path";

export type ArtifactInteroperabilityObservation = {
    readonly surface: "cli" | "studio-api" | "studio-ui" | "library";
    readonly owner: string;
    readonly result: string;
};

export type ArtifactInteroperabilityRunRow = {
    readonly id: string;
    readonly artifactKind: string;
    readonly operation: string;
    readonly sourcePath: string;
    readonly producedPath?: string;
    readonly owner: string;
    readonly result: string;
    readonly observations: readonly ArtifactInteroperabilityObservation[];
    readonly status?: "supported" | "intentionally-unsupported";
    readonly diagnostic?: {
        readonly code: string;
        readonly recovery: string;
    };
};

export type ArtifactInteroperabilityUnavailableRow = {
    readonly id: string;
    readonly artifactKind: string;
    readonly operation: string;
    readonly sourcePath: string;
    readonly owner: string;
    readonly diagnostic: {
        readonly code: string;
        readonly message: string;
        readonly recovery?: string;
    };
    readonly observations: readonly ArtifactInteroperabilityObservation[];
};

/** A lifecycle outcome is recorded by the runner at the point its assertion
 * completes.  It deliberately carries real source/output paths just like an
 * operation row, so a scenario cannot be represented by prose alone. */
export type ArtifactInteroperabilityScenario = {
    readonly id: string;
    readonly sourcePath: string;
    readonly producedPath?: string;
    readonly result: string;
    readonly surface: "cli" | "studio-api" | "studio-ui" | "library";
    readonly owner: string;
    /** Assertions that completed before this lifecycle result was retained. */
    readonly assertions: readonly string[];
    /** Public observations actually made by this scenario. */
    readonly observations: readonly {readonly route: string; readonly result: string}[];
};

/**
 * The PC-14 runners use this ledger rather than a hand-written matrix row.
 * Recording is deliberately post-condition based: an operation cannot appear
 * in the saved result until its real source (and, when applicable, output)
 * exists. Paths are redacted relative to the runner's temporary root, so the
 * emitted JSON is deterministic while the test still exercises real files.
 */
export class ArtifactInteroperabilityRun {
    private readonly rows: ArtifactInteroperabilityRunRow[] = [];
    private readonly scenarios: ArtifactInteroperabilityScenario[] = [];
    private readonly rootPath: string;

    public constructor(rootPath: string) {
        this.rootPath = rootPath;
    }

    public record(row: ArtifactInteroperabilityRunRow): void {
        this.assertExists(row.sourcePath, "source");
        if (row.producedPath !== undefined) this.assertExists(row.producedPath, "output");
        if (row.observations.length === 0) throw new Error(`${row.id} has no exercised public observation.`);
        this.rows.push(row);
    }

    /**
     * Retain an unavailable boundary only after its real source has been
     * resolved and the public owner has returned its diagnostic.  In
     * particular, this intentionally does not accept an artifact-kind string
     * and manufacture a diagnostic: doing so would turn the evidence ledger
     * into an assertion about a route that was never exercised.
     */
    public recordUnavailable(row: ArtifactInteroperabilityUnavailableRow): void {
        this.assertExists(row.sourcePath, "source");
        if (row.diagnostic.code.length === 0 || row.diagnostic.message.length === 0 || row.diagnostic.recovery === undefined || row.diagnostic.recovery.length === 0) {
            throw new Error(`${row.id} has no concrete public diagnostic and recovery.`);
        }
        if (row.observations.length === 0) throw new Error(`${row.id} has no exercised public observation.`);
        this.rows.push({
            id: row.id,
            artifactKind: row.artifactKind,
            operation: row.operation,
            sourcePath: row.sourcePath,
            owner: row.owner,
            result: row.diagnostic.message,
            observations: row.observations,
            status: "intentionally-unsupported",
            diagnostic: {code: row.diagnostic.code, recovery: row.diagnostic.recovery},
        });
    }

    public recordScenario(scenario: ArtifactInteroperabilityScenario): void {
        this.assertExists(scenario.sourcePath, "source");
        if (scenario.producedPath !== undefined) this.assertExists(scenario.producedPath, "output");
        if (scenario.result.length === 0) throw new Error(`${scenario.id} has no observed lifecycle result.`);
        if (scenario.assertions.length === 0) throw new Error(`${scenario.id} has no completed lifecycle assertion.`);
        if (scenario.observations.length === 0) throw new Error(`${scenario.id} has no exercised lifecycle observation.`);
        this.scenarios.push(scenario);
    }

    public write(outputPath: string): void {
        const rows = [...this.rows]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((row) => ({
                id: row.id,
                "artifact_kind": row.artifactKind,
                operation: row.operation,
                "source_path": this.redact(row.sourcePath),
                "source_identity": this.identity(row.sourcePath),
                "produced_path": row.producedPath === undefined ? null : this.redact(row.producedPath),
                "produced_identity": row.producedPath === undefined ? null : this.identity(row.producedPath),
                "operation_owner": row.owner,
                status: row.status ?? "supported",
                "observable_result": row.result,
                ...(row.diagnostic === undefined ? {} : {diagnostic: {...row.diagnostic}}),
                observations: row.observations.map((observation) => ({...observation})),
            }));
        const scenarios = [...this.scenarios]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((scenario) => ({
                id: scenario.id,
                "source_path": this.redact(scenario.sourcePath),
                "source_identity": this.identity(scenario.sourcePath),
                "produced_path": scenario.producedPath === undefined ? null : this.redact(scenario.producedPath),
                "produced_identity": scenario.producedPath === undefined ? null : this.identity(scenario.producedPath),
                "observable_result": scenario.result,
                execution: {
                    surface: scenario.surface,
                    owner: scenario.owner,
                    assertions: [...scenario.assertions],
                    observations: scenario.observations.map((observation) => ({...observation})),
                },
            }));
        fs.writeFileSync(outputPath, `${JSON.stringify({"schema_version": 2, rows, "scenario_results": scenarios}, null, 2)}\n`);
    }

    private assertExists(artifactPath: string, role: "source" | "output"): void {
        if (!fs.existsSync(artifactPath)) throw new Error(`Cannot record ${role}: ${artifactPath} was not produced or imported by this runner.`);
    }

    private redact(artifactPath: string): string {
        const relative = path.relative(this.rootPath, artifactPath);
        if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error(`Cannot redact artifact outside the runner root: ${artifactPath}`);
        }
        return `run-artifacts/${relative.split(path.sep).join("/")}`;
    }

    /**
     * Preserve a deterministic identity of the real artifact without leaking
     * the runner's temporary path. Directory identity includes every entry
     * (including symlinks as links) in lexical order, so a result cannot be
     * replayed from a same-named hand-authored placeholder.
     */
    private identity(artifactPath: string): string {
        const digest = crypto.createHash("sha256");
        const visit = (entryPath: string, relativePath: string): void => {
            const stat = fs.lstatSync(entryPath);
            if (stat.isSymbolicLink()) {
                digest.update(`link:${relativePath}:${fs.readlinkSync(entryPath)}\n`);
                return;
            }
            if (stat.isDirectory()) {
                digest.update(`directory:${relativePath}\n`);
                for (const child of fs.readdirSync(entryPath).sort()) visit(path.join(entryPath, child), path.posix.join(relativePath, child));
                return;
            }
            digest.update(`file:${relativePath}:`);
            digest.update(fs.readFileSync(entryPath));
            digest.update("\n");
        };
        visit(artifactPath, ".");
        return `sha256:${digest.digest("hex")}`;
    }
}

/**
 * Combines the independently executed CLI and Studio ledgers without adding
 * a synthetic matrix row.  The merger only copies records the runners have
 * already persisted, which keeps the checked-in PC-14 result tied to actual
 * operations rather than a second manually maintained assertion list.
 */
export function mergeArtifactInteroperabilityRuns(inputPaths: readonly string[], outputPath: string): void {
    const runs = inputPaths.map((inputPath) => {
        const raw = fs.readFileSync(inputPath, "utf-8");
        const parsed = JSON.parse(raw) as {readonly rows: unknown[]; readonly scenario_results: unknown[]};
        return {inputPath, raw, parsed};
    });
    const classify = (fragments: readonly string[]) => ({
        "operation_rows": runs.flatMap((run) => run.parsed.rows)
            .filter((row) => isMatchingRecord(row, fragments))
            .map((row) => recordId(row))
            .sort(),
        "lifecycle_outcomes": runs.flatMap((run) => run.parsed.scenario_results)
            .filter((scenario) => isMatchingRecord(scenario, fragments))
            .map((scenario) => recordId(scenario))
            .sort(),
        "runner_outputs": runs.filter((run) => {
            const records = [...run.parsed.rows, ...run.parsed.scenario_results];
            return records.some((record) => isMatchingRecord(record, fragments));
        }).map((run) => path.basename(run.inputPath)).sort(),
    });
    fs.writeFileSync(outputPath, `${JSON.stringify({
        "schema_version": 3,
        "step_id": "PC-14",
        "generated_by": "ArtifactInteroperabilityRun.mergeArtifactInteroperabilityRuns",
        "result_contract": {
            emission: "This result contains only records emitted after real CLI and Studio artifact operations complete; it has no inferred matrix rows.",
            "path_redaction": "run-artifacts paths are deterministic redactions of fresh runner roots and retain SHA-256 identities.",
            "unsupported_boundaries": "An unavailable boundary is retained only after its resolved public owner returns a diagnostic and recovery.",
        },
        "runner_inputs": runs.map((run) => ({
            file: path.basename(run.inputPath),
            sha256: `sha256:${crypto.createHash("sha256").update(run.raw).digest("hex")}`,
            rows: run.parsed.rows.length,
            scenarios: run.parsed.scenario_results.length,
        })),
        rows: runs.flatMap((run) => run.parsed.rows),
        "scenario_results": runs.flatMap((run) => run.parsed.scenario_results),
        "systemic_class_audits": [
            {class: "shared conversion diagnostic parity", "derived_from": classify(["blueprint-build", "wasm-boundary", "wasm-outcome"])},
            {class: "provenance and freshness binding", "derived_from": classify(["provenance", "replay", "drift", "configuration"])},
            {class: "durable publication ownership", "derived_from": classify(["cancellation", "recovery", "borrowed", "destination"])},
        ],
    }, null, 2)}\n`);
}

function isMatchingRecord(record: unknown, fragments: readonly string[]): record is {readonly id: string} {
    if (typeof record !== "object" || record === null || !("id" in record)) return false;
    const candidate = record as {readonly id: unknown};
    const id = candidate.id;
    return typeof id === "string" && fragments.some((fragment) => id.includes(fragment));
}

function recordId(record: unknown): string {
    if (typeof record !== "object" || record === null || !("id" in record) || typeof record.id !== "string") throw new Error("PC-14 runner emitted a record without an id.");
    return record.id;
}
