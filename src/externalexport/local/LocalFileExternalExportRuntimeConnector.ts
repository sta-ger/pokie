import {
    atomicallyWriteExternalExportFilesToDirectory,
    type AtomicExternalExportWriteDependencies,
} from "../atomicallyWriteExternalExportFilesToDirectory.js";
import type {ExternalFileGenerationResult} from "../ExternalFileGenerationResult.js";
import type {ExternalExportDeliveryResult} from "../ExternalExportDeliveryResult.js";
import type {ExternalExportRuntimeConnector} from "../ExternalExportRuntimeConnector.js";

// The example local target's own ExternalExportRuntimeConnector: "delivery" means atomically writing every
// generated file to a local directory via atomicallyWriteExternalExportFilesToDirectory — a write
// failure at any point leaves outDir exactly as it was before, with no temp/stale directories left behind, and
// never a partially-written result visible at outDir (see that function's own doc comment for the full
// guarantee). This is the SDK's one worked example of the optional runtime/transport contract — a real target
// talking to a live RGS/aggregator would implement ExternalExportRuntimeConnector directly instead (see that
// interface's own doc comment).
export class LocalFileExternalExportRuntimeConnector implements ExternalExportRuntimeConnector {
    private readonly outDir: string;
    private readonly dependencies: AtomicExternalExportWriteDependencies;

    constructor(outDir: string, dependencies: AtomicExternalExportWriteDependencies = {}) {
        this.outDir = outDir;
        this.dependencies = dependencies;
    }

    public deliver(result: ExternalFileGenerationResult): Promise<ExternalExportDeliveryResult> {
        try {
            const {written, issues} = atomicallyWriteExternalExportFilesToDirectory(result.files, this.outDir, this.dependencies);
            return Promise.resolve({delivered: true, details: {outDir: this.outDir, fileCount: written.length}, issues});
        } catch (error) {
            return Promise.reject(error);
        }
    }
}
