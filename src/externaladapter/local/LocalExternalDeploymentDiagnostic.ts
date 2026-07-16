import fs from "fs";
import path from "path";
import type {ExternalDeploymentDiagnostic} from "../ExternalDeploymentDiagnostic.js";
import type {ExternalDeploymentDiagnosticCheck} from "../ExternalDeploymentDiagnosticCheck.js";
import type {ExternalDeploymentDiagnosticReport} from "../ExternalDeploymentDiagnosticReport.js";

// The example local target's own ExternalDeploymentDiagnostic: reports whether outDir either already exists and
// is writable, or has a writable nearest-existing-ancestor directory (so it — and every missing directory level
// below that ancestor — could be created on demand via fs.mkdirSync(..., {recursive: true}), see
// writeExternalDeploymentArtifactsToDirectory). Synchronous under the hood (plain fs.accessSync calls) but still
// returns a Promise, the same uniform-contract reasoning ExternalDeploymentDiagnostic's own doc comment gives.
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

        // outDir itself doesn't exist yet — writing to it goes through fs.mkdirSync(..., {recursive:
        // true}) (see writeExternalDeploymentArtifactsToDirectory), which only actually needs write
        // access on the nearest ancestor that *does* exist; every missing level below that gets
        // created along the way. So this walks up from outDir's own parent until it finds that
        // existing ancestor, rather than only ever checking the immediate parent — checking just the
        // immediate parent would report a false "not writable" whenever more than one level is
        // missing, e.g. a brand-new project whose own "deployment/<targetId>" output directory has
        // never been created yet.
        let ancestor = path.dirname(resolved);
        while (!fs.existsSync(ancestor)) {
            const parent = path.dirname(ancestor);
            if (parent === ancestor) {
                // Reached the filesystem root without finding an existing ancestor — practically
                // unreachable (the root always exists), but guards against an infinite loop regardless.
                break;
            }
            ancestor = parent;
        }

        try {
            fs.accessSync(ancestor, fs.constants.W_OK);
            return {name: "outputDirectoryWritable", ok: true};
        } catch (error) {
            return {
                name: "outputDirectoryWritable",
                ok: false,
                message: `"${resolved}" does not exist, and its nearest existing ancestor "${ancestor}" is not writable: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
