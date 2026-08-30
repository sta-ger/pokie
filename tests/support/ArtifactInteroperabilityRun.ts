import fs from "fs";
import crypto from "crypto";
import path from "path";

export type ArtifactInteroperabilityObservation = {
    readonly surface: "cli" | "studio-api" | "studio-ui" | "library";
    readonly owner: string;
    readonly result: string;
};

/**
 * A systemic class is attached by the runner at the assertion which observed
 * it.  The merger must never rediscover a class from an id substring: that
 * would allow a hand-named record to expand an audit without exercising the
 * associated owner.
 */
export type ArtifactInteroperabilitySystemicClass =
    | "shared-conversion-diagnostic-parity"
    | "provenance-and-freshness-binding"
    | "durable-publication-ownership";

export type ArtifactInteroperabilityRunRow = {
    readonly id: string;
    readonly artifactKind: string;
    readonly operation: string;
    readonly sourcePath: string;
    readonly producedPath?: string;
    readonly owner: string;
    readonly result: string;
    readonly observations: readonly ArtifactInteroperabilityObservation[];
    /** Systemic classes actually covered by this completed operation. */
    readonly systemicClasses?: readonly ArtifactInteroperabilitySystemicClass[];
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
        /** The code returned by the exercised public owner.  Planner cells
         * retain their conversion diagnostic while command/service callers
         * retain the operation diagnostic layered on top of it. */
        readonly code: string;
        readonly message: string;
        readonly recovery?: string;
    };
    readonly observations: readonly ArtifactInteroperabilityObservation[];
    readonly systemicClasses?: readonly ArtifactInteroperabilitySystemicClass[];
};

/** A planner cell is retained only after the runner has resolved the source
 * artifact it names.  This makes the complete product matrix an observed
 * direct-library result, rather than an evidence-only list of type strings. */
export type ArtifactInteroperabilityPlannerCell = {
    readonly sourcePath: string;
    readonly sourceType: string;
    readonly target: string;
    readonly status: "planned" | "unavailable" | "conflict";
    readonly diagnostic?: {readonly code: string; readonly recovery: string};
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
    /** Classes asserted by this completed lifecycle observation. */
    readonly systemicClasses: readonly ArtifactInteroperabilitySystemicClass[];
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
    private readonly plannerCells: ArtifactInteroperabilityPlannerCell[] = [];
    private readonly rootPath: string;

    public constructor(rootPath: string) {
        this.rootPath = rootPath;
    }

    public record(row: ArtifactInteroperabilityRunRow): void {
        this.assertExists(row.sourcePath, "source");
        if (row.producedPath !== undefined) this.assertExists(row.producedPath, "output");
        if (row.observations.length === 0) throw new Error(`${row.id} has no exercised public observation.`);
        if (row.systemicClasses !== undefined && row.systemicClasses.length === 0) throw new Error(`${row.id} has an empty systemic class assignment.`);
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
        if (row.systemicClasses !== undefined && row.systemicClasses.length === 0) throw new Error(`${row.id} has an empty systemic class assignment.`);
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
            ...(row.systemicClasses === undefined ? {} : {systemicClasses: row.systemicClasses}),
        });
    }

    public recordPlannerCells(cells: readonly ArtifactInteroperabilityPlannerCell[]): void {
        for (const cell of cells) {
            this.assertExists(cell.sourcePath, "source");
            if (cell.status !== "planned" && (cell.diagnostic === undefined || cell.diagnostic.recovery.length === 0)) {
                throw new Error(`${cell.sourceType}:${cell.target} has no concrete planner diagnostic.`);
            }
            this.plannerCells.push(cell);
        }
    }

    public recordScenario(scenario: ArtifactInteroperabilityScenario): void {
        this.assertExists(scenario.sourcePath, "source");
        if (scenario.producedPath !== undefined) this.assertExists(scenario.producedPath, "output");
        if (scenario.result.length === 0) throw new Error(`${scenario.id} has no observed lifecycle result.`);
        if (scenario.assertions.length === 0) throw new Error(`${scenario.id} has no completed lifecycle assertion.`);
        if (scenario.observations.length === 0) throw new Error(`${scenario.id} has no exercised lifecycle observation.`);
        if (scenario.systemicClasses.length === 0) throw new Error(`${scenario.id} has no systemic audit class.`);
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
                "systemic_classes": row.systemicClasses ?? [],
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
                "systemic_classes": scenario.systemicClasses,
            }));
        const plannerCells = [...this.plannerCells]
            .sort((left, right) => `${left.sourceType}:${left.target}`.localeCompare(`${right.sourceType}:${right.target}`))
            .map((cell) => ({
                "source_path": this.redact(cell.sourcePath),
                "source_identity": this.identity(cell.sourcePath),
                "source_type": cell.sourceType,
                target: cell.target,
                status: cell.status,
                ...(cell.diagnostic === undefined ? {} : {diagnostic: {...cell.diagnostic}}),
            }));
        fs.writeFileSync(outputPath, `${JSON.stringify({"schema_version": 2, rows, "scenario_results": scenarios, "planner_cells": plannerCells}, null, 2)}\n`);
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
            // A number of public writers correctly stamp their durable
            // payload with their creation time.  That timestamp is not an
            // artifact identity: it must not make an otherwise identical
            // PC-14 run appear to have produced a different artifact.  Keep
            // all other bytes (including source/configuration hashes) in the
            // identity and normalise only JSON timestamp fields.
            digest.update(normalizedArtifactBytes(entryPath));
            digest.update("\n");
        };
        visit(artifactPath, ".");
        return `sha256:${digest.digest("hex")}`;
    }
}

function normalizedArtifactBytes(entryPath: string): Buffer {
    const bytes = fs.readFileSync(entryPath);
    if (!entryPath.endsWith(".json")) return bytes;
    try {
        return Buffer.from(`${JSON.stringify(normalizeJsonTimestampFields(JSON.parse(bytes.toString("utf-8"))))}\n`);
    } catch {
        // A .json suffix is not a promise that a foreign artifact is valid
        // JSON. Preserve such producer output verbatim.
        return bytes;
    }
}

function normalizeJsonTimestampFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalizeJsonTimestampFields);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        (/(?:^|_)(?:created|generated|updated|started|finished|timestamp)(?:at|_at)?$/i).test(key)
            ? "<fixed-runner-time>"
            : normalizeJsonTimestampFields(child),
    ]));
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
        const parsed = JSON.parse(raw) as {readonly rows: unknown[]; readonly scenario_results: unknown[]; readonly planner_cells?: unknown[]};
        return {inputPath, raw, parsed};
    });
    const classify = (systemicClass: ArtifactInteroperabilitySystemicClass) => ({
        "operation_rows": runs.flatMap((run) => run.parsed.rows)
            .filter((row) => hasSystemicClass(row, systemicClass))
            .map((row) => recordId(row))
            .sort(),
        "lifecycle_outcomes": runs.flatMap((run) => run.parsed.scenario_results)
            .filter((scenario) => hasSystemicClass(scenario, systemicClass))
            .map((scenario) => recordId(scenario))
            .sort(),
        "runner_outputs": runs.filter((run) => {
            const records = [...run.parsed.rows, ...run.parsed.scenario_results];
            return records.some((record) => hasSystemicClass(record, systemicClass));
        }).map((run) => path.basename(run.inputPath)).sort(),
        // Planner cells describe the conversion class only.  Attaching the
        // full cell set to provenance or publication findings would falsely
        // claim those owners planned every conversion.
        "planner_cells": systemicClass === "shared-conversion-diagnostic-parity"
            ? runs.flatMap((run) => run.parsed.planner_cells ?? [])
            : [],
        // These are aliases actually observed by the runner, not the broader
        // CLI vocabulary.  Keeping this on the derived audit lets a reviewer
        // see precisely which public identity reached an owner in this run.
        aliases: runs.flatMap((run) => run.parsed.rows)
            .filter((row) => hasSystemicClass(row, systemicClass))
            .flatMap(recordAlias)
            .filter((alias, index, aliases) => aliases.indexOf(alias) === index).sort(),
        "operation_owners": runs.flatMap((run) => run.parsed.rows)
            .filter((row) => hasSystemicClass(row, systemicClass))
            .map(recordOwner).filter((owner): owner is string => owner !== undefined)
            .filter((owner, index, owners) => owners.indexOf(owner) === index).sort(),
        "studio_routes": runs.flatMap((run) => run.parsed.scenario_results)
            .filter((scenario) => hasSystemicClass(scenario, systemicClass))
            .flatMap(recordRoutes).filter((route) => route.startsWith("POST /api/"))
            .filter((route, index, routes) => routes.indexOf(route) === index).sort(),
        "studio_ui_routes": runs.flatMap((run) => run.parsed.scenario_results)
            .filter((scenario) => hasSystemicClass(scenario, systemicClass))
            .flatMap(recordRoutes).filter((route) => route.startsWith("UI "))
            .filter((route, index, routes) => routes.indexOf(route) === index).sort(),
        // Some retained Studio owners are service APIs, not HTTP routes. Keep
        // them separate so service execution is never represented as a UI or
        // browser-route observation.
        "studio_service_callers": runs.flatMap((run) => run.parsed.scenario_results)
            .filter((scenario) => hasSystemicClass(scenario, systemicClass))
            .flatMap(recordStudioScenarioOwner)
            .filter((owner, index, owners) => owners.indexOf(owner) === index).sort(),
        "direct_library_callers": runs.flatMap((run) => [
            ...run.parsed.rows
                .filter((row) => hasSystemicClass(row, systemicClass))
                .flatMap(recordObservations)
                .filter((observation) => observation.surface === "library")
                .map((observation) => observation.owner),
            ...run.parsed.scenario_results
                .filter((scenario) => hasSystemicClass(scenario, systemicClass))
                .flatMap(recordLibraryScenarioOwner),
        ])
            .filter((owner, index, owners) => owners.indexOf(owner) === index).sort(),
        "regression_links": runs.flatMap((run) => [...run.parsed.rows, ...run.parsed.scenario_results])
            .filter((record) => hasSystemicClass(record, systemicClass))
            .map(recordId).sort(),
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
            {class: "shared conversion diagnostic parity", "derived_from": classify("shared-conversion-diagnostic-parity")},
            {class: "provenance and freshness binding", "derived_from": classify("provenance-and-freshness-binding")},
            {class: "durable publication ownership", "derived_from": classify("durable-publication-ownership")},
        ],
    }, null, 2)}\n`);
}

function recordOwner(record: unknown): string | undefined {
    if (typeof record !== "object" || record === null || !("operation_owner" in record)) return undefined;
    const owner = (record as {readonly operation_owner: unknown}).operation_owner;
    return typeof owner === "string" ? owner : undefined;
}

function recordAlias(record: unknown): readonly string[] {
    if (typeof record !== "object" || record === null || !("artifact_kind" in record) || !("operation" in record)) return [];
    const candidate = record as {readonly artifact_kind: unknown; readonly operation: unknown};
    return typeof candidate.artifact_kind === "string" && typeof candidate.operation === "string"
        ? [`${candidate.artifact_kind}:${candidate.operation}`]
        : [];
}

function recordObservations(record: unknown): readonly {readonly surface: string; readonly owner: string}[] {
    if (typeof record !== "object" || record === null || !("observations" in record)) return [];
    const observations = (record as {readonly observations: unknown}).observations;
    if (!Array.isArray(observations)) return [];
    return observations.filter((observation): observation is {readonly surface: string; readonly owner: string} =>
        typeof observation === "object" && observation !== null &&
        "surface" in observation && typeof observation.surface === "string" &&
        "owner" in observation && typeof observation.owner === "string",
    );
}

function recordRoutes(record: unknown): readonly string[] {
    if (typeof record !== "object" || record === null || !("execution" in record)) return [];
    const execution = (record as {readonly execution: unknown}).execution;
    if (typeof execution !== "object" || execution === null || !("observations" in execution)) return [];
    const observations = (execution as {readonly observations: unknown}).observations;
    if (!Array.isArray(observations)) return [];
    return observations.flatMap((observation) =>
        typeof observation === "object" && observation !== null && "route" in observation && typeof observation.route === "string"
            ? [observation.route]
            : [],
    );
}

function recordLibraryScenarioOwner(record: unknown): readonly string[] {
    if (typeof record !== "object" || record === null || !("execution" in record)) return [];
    const execution = (record as {readonly execution: unknown}).execution;
    if (typeof execution !== "object" || execution === null) return [];
    const candidate = execution as {readonly surface?: unknown; readonly owner?: unknown};
    return candidate.surface === "library" && typeof candidate.owner === "string" ? [candidate.owner] : [];
}

function recordStudioScenarioOwner(record: unknown): readonly string[] {
    if (typeof record !== "object" || record === null || !("execution" in record)) return [];
    const execution = (record as {readonly execution: unknown}).execution;
    if (typeof execution !== "object" || execution === null) return [];
    const candidate = execution as {readonly surface?: unknown; readonly owner?: unknown};
    return candidate.surface === "studio-api" && typeof candidate.owner === "string" ? [candidate.owner] : [];
}

function hasSystemicClass(record: unknown, systemicClass: ArtifactInteroperabilitySystemicClass): boolean {
    if (typeof record !== "object" || record === null || !("systemic_classes" in record)) return false;
    const classes = (record as {readonly systemic_classes: unknown}).systemic_classes;
    return Array.isArray(classes) && classes.includes(systemicClass);
}

function recordId(record: unknown): string {
    if (typeof record !== "object" || record === null || !("id" in record) || typeof record.id !== "string") throw new Error("PC-14 runner emitted a record without an id.");
    return record.id;
}
