import fs from "fs";
import crypto from "crypto";
import path from "path";
import {inflateRawSync} from "zlib";

/**
 * Makes the real artifact writers deterministic during the dedicated PC-14
 * evidence refresh.  This is deliberately an opt-in test seam: production
 * writers continue to receive the host clock, while the refresh process
 * injects one fixed clock before it creates any public artifact.
 *
 * Replacing the Date constructor (rather than merely normalising the saved
 * hash) makes timestamps written by PAR, Stake, bundle, certification and
 * fairness writers themselves reproducible.  Timers are not faked, so Studio
 * HTTP jobs and cancellation continue to exercise their real event-loop
 * behaviour.
 */
export function installPc14FixedRunnerClock(): () => void {
    const configuredClock = process.env.PC14_FIXED_RUNNER_CLOCK;
    if (configuredClock === undefined) return () => undefined;
    const fixedTime = new Date(configuredClock).getTime();
    if (Number.isNaN(fixedTime)) throw new Error(`PC14_FIXED_RUNNER_CLOCK is not a valid ISO timestamp: ${configuredClock}`);
    const NativeDate = Date;
    class FixedRunnerDate extends NativeDate {
        public constructor(value?: string | number) {
            super(value ?? fixedTime);
        }

        public static now(): number {
            return fixedTime;
        }
    }
    // Date is a documented mutable global in Node's test environment.  Keep
    // the replacement scoped to the runner process/test and restore it in
    // afterEach so ordinary integration tests retain the host clock.
    globalThis.Date = FixedRunnerDate as DateConstructor;
    return () => {
        globalThis.Date = NativeDate;
    };
}

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

type Pc05ArtifactRegistry = {
    readonly artifact_kinds: readonly Pc05ArtifactKind[];
};

type Pc05ArtifactKind = {
    readonly id: string;
    readonly created_by?: readonly string[];
    readonly recognized_by?: readonly string[];
    readonly runs_by?: readonly string[];
    readonly validates_by?: readonly string[];
    readonly reports_by?: readonly string[];
    readonly replays_by?: readonly string[];
};

export type Pc05PublicOwnerOperation = {
    readonly artifactKind: string;
    readonly owner: string;
    readonly registryOperation: "created_by" | "recognized_by" | "runs_by" | "validates_by" | "reports_by" | "replays_by";
};

const INTERNAL_PC05_ARTIFACT_KINDS = new Set([
    "blueprintRuntimeMaterializationCache",
    "blueprintRuntimeMaterializationMarker",
]);

/**
 * The PC-05 registry is the authoritative owner/operation inventory.  Keep
 * the registry field that introduced an owner: a command can appear in more
 * than one field, and collapsing that distinction would incorrectly treat a
 * successful read as proof of a create or replay operation.
 */
export function pc05PublicOwnerOperations(registry: Pc05ArtifactRegistry): readonly Pc05PublicOwnerOperation[] {
    const fields: readonly Pc05PublicOwnerOperation["registryOperation"][] = [
        "created_by", "recognized_by", "runs_by", "validates_by", "reports_by", "replays_by",
    ];
    return registry.artifact_kinds
        .filter((artifact) => !INTERNAL_PC05_ARTIFACT_KINDS.has(artifact.id))
        .flatMap((artifact) => fields.flatMap((registryOperation) =>
            (artifact[registryOperation] ?? []).map((owner) => ({artifactKind: artifact.id, owner, registryOperation})),
        ))
        .filter((candidate, index, candidates) => candidates.findIndex((other) =>
            other.artifactKind === candidate.artifactKind &&
            other.owner === candidate.owner &&
            other.registryOperation === candidate.registryOperation,
        ) === index)
        .sort((left, right) => `${left.artifactKind}:${left.registryOperation}:${left.owner}`.localeCompare(`${right.artifactKind}:${right.registryOperation}:${right.owner}`));
}

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
            result: this.redactEmbeddedRunnerRoot(row.diagnostic.message),
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
                digest.update(`link:${relativePath}:${this.redactEmbeddedRunnerRoot(fs.readlinkSync(entryPath))}\n`);
                return;
            }
            if (stat.isDirectory()) {
                digest.update(`directory:${relativePath}\n`);
                for (const child of fs.readdirSync(entryPath).sort()) visit(path.join(entryPath, child), path.posix.join(relativePath, child));
                return;
            }
            digest.update(`file:${relativePath}:`);
            // Hash the real bytes as well as the artifact layout.  A runner
            // root is deliberately random, and some public writers retain it
            // in otherwise portable metadata; normalise only that path before
            // hashing so the evidence can be regenerated in a clean process
            // without reducing every same-shaped artifact to one identity.
            digest.update(this.normaliseArtifactIdentity(entryPath, fs.readFileSync(entryPath)));
            digest.update("\n");
        };
        visit(artifactPath, ".");
        return `sha256:${digest.digest("hex")}`;
    }

    private normaliseRunnerRoot(value: Buffer): Buffer {
        const root = Buffer.from(this.rootPath);
        if (root.length === 0) return value;
        const replacement = Buffer.from("<pc14-run-root>");
        const chunks: Buffer[] = [];
        let cursor = 0;
        let index = value.indexOf(root, cursor);
        while (index !== -1) {
            chunks.push(value.subarray(cursor, index), replacement);
            cursor = index + root.length;
            index = value.indexOf(root, cursor);
        }
        if (chunks.length === 0) return this.normaliseRunnerTemporaryDirectory(value);
        chunks.push(value.subarray(cursor));
        return this.normaliseRunnerTemporaryDirectory(Buffer.concat(chunks));
    }

    /**
     * A registry conversion can retain a PAR source path that was resolved by
     * a neighbouring real-artifact runner rather than by this ledger's own
     * root.  The only varying portion is the mkdtemp suffix; it is transport
     * location, just like this.rootPath above, and is never artifact content.
     */
    private normaliseRunnerTemporaryDirectory(value: Buffer): Buffer {
        const prefix = Buffer.from(`${path.dirname(this.rootPath)}${path.sep}pokie-artifact-torture-`);
        const replacement = Buffer.from("<pc14-run-root>");
        const chunks: Buffer[] = [];
        let cursor = 0;
        let index = value.indexOf(prefix, cursor);
        while (index !== -1) {
            chunks.push(value.subarray(cursor, index), replacement);
            cursor = index + prefix.length;
            while (cursor < value.length && (/[A-Za-z0-9]/).test(String.fromCharCode(value[cursor]!))) cursor += 1;
            index = value.indexOf(prefix, cursor);
        }
        if (chunks.length === 0) return this.normaliseRunnerTemporarySuffix(value);
        chunks.push(value.subarray(cursor));
        return this.normaliseRunnerTemporarySuffix(Buffer.concat(chunks));
    }

    /**
     * ExcelJS compresses a workbook before this identity helper observes it,
     * then this method sees the uncompressed XML part.  Some registry
     * conversions retain a sibling runner's source path there, so its parent
     * directory need not be the ledger's parent.  The mkdtemp suffix alone is
     * transport metadata; retain the rest of the path and normalise just that
     * volatile segment without decoding arbitrary artifact bytes as UTF-8.
     */
    private normaliseRunnerTemporarySuffix(value: Buffer): Buffer {
        const prefix = Buffer.from("pokie-artifact-torture-");
        const replacement = Buffer.from("pokie-artifact-torture-<pc14-run-root>");
        const chunks: Buffer[] = [];
        let cursor = 0;
        let index = value.indexOf(prefix, cursor);
        while (index !== -1) {
            chunks.push(value.subarray(cursor, index), replacement);
            cursor = index + prefix.length;
            while (cursor < value.length && (/[A-Za-z0-9]/).test(String.fromCharCode(value[cursor]!))) cursor += 1;
            index = value.indexOf(prefix, cursor);
        }
        if (chunks.length === 0) return value;
        chunks.push(value.subarray(cursor));
        return Buffer.concat(chunks);
    }

    /**
     * Evidence identities bind an artifact's semantic bytes, not volatile
     * transport metadata.  PAR workbooks are ZIP containers whose per-entry
     * DOS/extended timestamps are assigned by the ZIP writer outside the
     * injected JavaScript clock.  Package replay descriptors likewise create
     * a runtime-only session id.  Neither value changes the artifact contract
     * exercised by the runner, so normalise only those documented fields.
     */
    private normaliseArtifactIdentity(entryPath: string, value: Buffer): Buffer {
        const rooted = this.normaliseRunnerRoot(value);
        // Registry destinations are deliberately extension-agnostic: the
        // `parWorkbook` target can therefore be a valid XLSX file whose
        // destination has no `.xlsx` suffix.  Inspect the ZIP signature as
        // well as the filename, otherwise those real workbooks bypass the
        // PAR transport-metadata normalisation used by the runner identity.
        if (entryPath.endsWith(".xlsx") || this.isZipArtifact(rooted)) return this.normaliseZipArtifact(rooted);
        if (!entryPath.endsWith(".json")) return rooted;
        return Buffer.from(rooted.toString("utf-8").replace(/("sessionId"\s*:\s*)"[^"]*"/g, "$1\"<pc14-runtime-session>\""));
    }

    private isZipArtifact(value: Buffer): boolean {
        return value.length >= 4 && value.readUInt32LE(0) === 0x04034b50;
    }

    private normaliseZipArtifact(value: Buffer): Buffer {
        const entries: {readonly name: string; readonly content: Buffer}[] = [];
        for (let offset = 0; offset + 46 <= value.length; offset++) {
            if (value.readUInt32LE(offset) !== 0x02014b50) continue;
            const compression = value.readUInt16LE(offset + 10);
            const compressedSize = value.readUInt32LE(offset + 20);
            const nameLength = value.readUInt16LE(offset + 28);
            const extraLength = value.readUInt16LE(offset + 30);
            const commentLength = value.readUInt16LE(offset + 32);
            const localOffset = value.readUInt32LE(offset + 42);
            const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
            if (nextOffset > value.length || localOffset + 30 > value.length || value.readUInt32LE(localOffset) !== 0x04034b50) return value;
            const name = value.subarray(offset + 46, offset + 46 + nameLength).toString("utf-8");
            const localNameLength = value.readUInt16LE(localOffset + 26);
            const localExtraLength = value.readUInt16LE(localOffset + 28);
            const compressedStart = localOffset + 30 + localNameLength + localExtraLength;
            const compressedEnd = compressedStart + compressedSize;
            if (compressedEnd > value.length) return value;
            const compressed = value.subarray(compressedStart, compressedEnd);
            let content: Buffer;
            if (compression === 0) {
                content = Buffer.from(compressed);
            } else if (compression === 8) {
                content = inflateRawSync(compressed);
            } else {
                content = compressed;
            }
            entries.push({name, content: this.normaliseZipEntry(name, content)});
            offset = nextOffset - 1;
        }
        return entries.length === 0 ? value : Buffer.concat(entries
            .sort((left, right) => left.name.localeCompare(right.name))
            .flatMap((entry) => [Buffer.from(`entry:${entry.name}\n`), entry.content, Buffer.from("\n")]));
    }

    private normaliseZipEntry(name: string, value: Buffer): Buffer {
        // The runner root is compressed inside workbook parts, so normalising
        // only the ZIP container cannot redact source paths recorded in the
        // provenance sheet.
        const rooted = this.normaliseRunnerRoot(value);
        // Document properties are transport metadata, not a PAR artifact's
        // observable workbook contract.
        if (name === "docProps/core.xml") return Buffer.alloc(0);
        return rooted;
    }

    private redactEmbeddedRunnerRoot(value: string): string {
        return value.split(this.rootPath).join("<pc14-run-root>");
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
        const parsed = JSON.parse(raw) as {readonly rows: unknown[]; readonly scenario_results: unknown[]; readonly planner_cells?: unknown[]};
        return {inputPath, raw, parsed};
    });
    const classify = (systemicClass: ArtifactInteroperabilitySystemicClass) => ({
        // An audit is scoped to the records that exercised its class.  A
        // global inventory would turn an unrelated build or planner result
        // into evidence for every class-level owner.
        "executed_owner_inventory": ownerExecutions.filter((entry) => allRecords.some((record) =>
            recordId(record) === entry.record_id && hasSystemicClass(record, systemicClass),
        )).map((entry) => ({
            "artifact_kind": entry.artifact_kind,
            "public_owner": entry.public_owner,
            "record_id": entry.record_id,
        })),
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
    // PC-05 is the product inventory, rather than an execution log. Coverage
    // is emitted only from the public owner recorded by a runner after its
    // real operation completed; an inventory entry must not turn a sibling
    // command into a fabricated execution result.
    const registry = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json"), "utf-8")) as {
        readonly artifact_kinds: readonly Pc05ArtifactKind[];
    };
    const allRecords = runs.flatMap((run) => [...run.parsed.rows, ...run.parsed.scenario_results]);
    const ownerExecutions = runs.flatMap((run) => run.parsed.rows).flatMap((record) => {
        const artifactKind = recordArtifactKind(record);
        const owner = recordOwner(record);
        const sourcePath = (record as {readonly source_path?: unknown}).source_path;
        if (artifactKind === undefined || owner === undefined || typeof sourcePath !== "string") {
            throw new Error("PC-14 runner emitted an owner row without artifact kind, source path, or operation owner.");
        }
        return [{
            "artifact_kind": artifactKind,
            "public_owner": owner,
            status: "executed" as const,
            "record_id": recordId(record),
            "source_path": sourcePath,
            "operation_owner": owner,
            "owner_execution": "runner-emitted" as const,
            result: `Completed real-artifact operation ${recordId(record)} returned from ${owner}.`,
        }];
    }).filter((entry, index, entries) => entries.findIndex((candidate) =>
        candidate.artifact_kind === entry.artifact_kind && candidate.public_owner === entry.public_owner,
    ) === index);
    const registryCoverage = registry.artifact_kinds.map((artifact) => {
        const internalOnly = INTERNAL_PC05_ARTIFACT_KINDS.has(artifact.id);
        const completedOwners = ownerExecutions.filter((entry) => entry.artifact_kind === artifact.id);
        let disposition: "executed" | "not-executed" | "excluded-internal-cache-state" = "executed";
        if (internalOnly) disposition = "excluded-internal-cache-state";
        else if (completedOwners.length === 0) disposition = "not-executed";
        return {
            "artifact_kind": artifact.id,
            disposition,
            "public_owners": completedOwners.map((entry) => entry.public_owner).sort(),
            "executed_regressions": [...new Set(completedOwners.map((entry) => entry.record_id))].sort(),
            ...(internalOnly ? {exclusion: "Machine-local materialization cache/marker is not a user artifact or public-operation claim."} : {}),
        };
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
        // This is derived from the checked-in PC-05 registry at refresh time,
        // not maintained beside the result as a second hand-authored census.
        "registry_artifact_coverage": registryCoverage,
        "public_owner_coverage": ownerExecutions,
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

function recordArtifactKind(record: unknown): string | undefined {
    if (typeof record !== "object" || record === null || !("artifact_kind" in record)) return undefined;
    const artifactKind = (record as {readonly artifact_kind: unknown}).artifact_kind;
    return typeof artifactKind === "string" ? artifactKind : undefined;
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
