import fs from "fs";
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

    public write(outputPath: string): void {
        const rows = [...this.rows]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((row) => ({
                id: row.id,
                "artifact_kind": row.artifactKind,
                operation: row.operation,
                "source_path": this.redact(row.sourcePath),
                "produced_path": row.producedPath === undefined ? null : this.redact(row.producedPath),
                "operation_owner": row.owner,
                "observable_result": row.result,
                observations: row.observations.map((observation) => ({...observation})),
            }));
        fs.writeFileSync(outputPath, `${JSON.stringify({"schema_version": 1, rows}, null, 2)}\n`);
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
}
