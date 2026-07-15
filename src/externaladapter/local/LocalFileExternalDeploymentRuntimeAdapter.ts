import type {ExternalArtifactGenerationResult} from "../ExternalArtifactGenerationResult.js";
import type {ExternalDeploymentDeliveryResult} from "../ExternalDeploymentDeliveryResult.js";
import type {ExternalDeploymentRuntimeAdapter} from "../ExternalDeploymentRuntimeAdapter.js";
import {writeExternalDeploymentArtifactsToDirectory} from "../writeExternalDeploymentArtifactsToDirectory.js";

// The example local target's own ExternalDeploymentRuntimeAdapter: "delivery" means writing every generated
// artifact to a local directory via writeExternalDeploymentArtifactsToDirectory. This is the SDK's one worked
// example of the optional runtime/transport contract — a real target talking to a live RGS/aggregator would
// implement ExternalDeploymentRuntimeAdapter directly instead (see that interface's own doc comment).
export class LocalFileExternalDeploymentRuntimeAdapter implements ExternalDeploymentRuntimeAdapter {
    private readonly outDir: string;

    constructor(outDir: string) {
        this.outDir = outDir;
    }

    public deliver(result: ExternalArtifactGenerationResult): Promise<ExternalDeploymentDeliveryResult> {
        try {
            const written = writeExternalDeploymentArtifactsToDirectory(result.artifacts, this.outDir);
            return Promise.resolve({delivered: true, details: {outDir: this.outDir, fileCount: written.length}});
        } catch (error) {
            return Promise.reject(error);
        }
    }
}
