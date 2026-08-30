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
