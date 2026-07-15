import fs from "fs";
import path from "path";
import type {ExternalDeploymentDiagnostic} from "../ExternalDeploymentDiagnostic.js";
import type {ExternalDeploymentDiagnosticCheck} from "../ExternalDeploymentDiagnosticCheck.js";
import type {ExternalDeploymentDiagnosticReport} from "../ExternalDeploymentDiagnosticReport.js";

// The example local target's own ExternalDeploymentDiagnostic: reports whether outDir either already exists and
// is writable, or has a writable parent (so it could be created on demand — see
// writeExternalDeploymentArtifactsToDirectory's own mkdirSync). Synchronous under the hood (plain fs.accessSync
// calls) but still returns a Promise, the same uniform-contract reasoning ExternalDeploymentDiagnostic's own
// doc comment gives.
export class LocalExternalDeploymentDiagnostic implements ExternalDeploymentDiagnostic {
    private readonly outDir: string;

    constructor(outDir: string) {
        this.outDir = outDir;
    }

    public diagnose(): Promise<ExternalDeploymentDiagnosticReport> {
        const checks: ExternalDeploymentDiagnosticCheck[] = [this.checkOutputDirectoryWritable()];
        return Promise.resolve({ok: checks.every((check) => check.ok), checks});
    }

    private checkOutputDirectoryWritable(): ExternalDeploymentDiagnosticCheck {
        const resolved = path.resolve(this.outDir);

        if (fs.existsSync(resolved)) {
            try {
                fs.accessSync(resolved, fs.constants.W_OK);
                return {name: "outputDirectoryWritable", ok: true};
            } catch (error) {
                return {
                    name: "outputDirectoryWritable",
                    ok: false,
                    message: `"${resolved}" exists but is not writable: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        }

        try {
            fs.accessSync(path.dirname(resolved), fs.constants.W_OK);
            return {name: "outputDirectoryWritable", ok: true};
        } catch (error) {
            return {
                name: "outputDirectoryWritable",
                ok: false,
                message: `"${resolved}" does not exist and its parent directory is not writable: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
