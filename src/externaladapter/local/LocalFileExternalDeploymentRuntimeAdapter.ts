import {
    atomicallyWriteExternalDeploymentArtifactsToDirectory,
    type AtomicExternalDeploymentWriteDependencies,
} from "../atomicallyWriteExternalDeploymentArtifactsToDirectory.js";
import type {ExternalArtifactGenerationResult} from "../ExternalArtifactGenerationResult.js";
import type {ExternalDeploymentDeliveryResult} from "../ExternalDeploymentDeliveryResult.js";
import type {ExternalDeploymentRuntimeAdapter} from "../ExternalDeploymentRuntimeAdapter.js";

// The example local target's own ExternalDeploymentRuntimeAdapter: "delivery" means atomically writing every
// generated artifact to a local directory via atomicallyWriteExternalDeploymentArtifactsToDirectory — a write
// failure at any point leaves outDir exactly as it was before, with no temp/stale directories left behind, and
// never a partially-written result visible at outDir (see that function's own doc comment for the full
// guarantee). This is the SDK's one worked example of the optional runtime/transport contract — a real target
// talking to a live RGS/aggregator would implement ExternalDeploymentRuntimeAdapter directly instead (see that
// interface's own doc comment).
export class LocalFileExternalDeploymentRuntimeAdapter implements ExternalDeploymentRuntimeAdapter {
    private readonly outDir: string;
    private readonly dependencies: AtomicExternalDeploymentWriteDependencies;

    constructor(outDir: string, dependencies: AtomicExternalDeploymentWriteDependencies = {}) {
        this.outDir = outDir;
        this.dependencies = dependencies;
    }

    public deliver(result: ExternalArtifactGenerationResult): Promise<ExternalDeploymentDeliveryResult> {
        try {
            const {written, issues} = atomicallyWriteExternalDeploymentArtifactsToDirectory(result.artifacts, this.outDir, this.dependencies);
            return Promise.resolve({delivered: true, details: {outDir: this.outDir, fileCount: written.length}, issues});
        } catch (error) {
            return Promise.reject(error);
        }
    }
}
