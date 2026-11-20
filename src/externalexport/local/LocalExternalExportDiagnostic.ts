import fs from "fs";
import path from "path";
import type {ExternalExportDiagnostic} from "../ExternalExportDiagnostic.js";
import type {ExternalExportDiagnosticCheck} from "../ExternalExportDiagnosticCheck.js";
import type {ExternalExportDiagnosticReport} from "../ExternalExportDiagnosticReport.js";

// The example local target's own ExternalExportDiagnostic: reports whether outDir either already exists and
// is writable, or has a writable nearest-existing-ancestor directory (so it — and every missing directory level
// below that ancestor — could be created on demand via fs.mkdirSync(..., {recursive: true}), see
// writeExternalExportFilesToDirectory). Synchronous under the hood (plain fs.accessSync calls) but still
// returns a Promise, the same uniform-contract reasoning ExternalExportDiagnostic's own doc comment gives.
export class LocalExternalExportDiagnostic implements ExternalExportDiagnostic {
    private readonly outDir: string;

    constructor(outDir: string) {
        this.outDir = outDir;
    }

    public diagnose(): Promise<ExternalExportDiagnosticReport> {
        const checks: ExternalExportDiagnosticCheck[] = [this.checkOutputDirectoryWritable()];
        return Promise.resolve({ok: checks.every((check) => check.ok), checks});
    }

    private checkOutputDirectoryWritable(): ExternalExportDiagnosticCheck {
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
        // true}) (see writeExternalExportFilesToDirectory), which only actually needs write
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
