import {parentPort, workerData} from "worker_threads";
import {StudioArtifactBuildService} from "./StudioArtifactBuildService.js";
import {PackageBlueprintExtraction, type ArtifactTargetType} from "@fromstan/pokie";

// An asynchronous descriptor may have no active I/O handle. Keep ownership until the
// parent receives its terminal message or explicitly terminates this worker.
parentPort!.ref();
const request = workerData as {pokieVersion: string; runtimePackageRoot: string; projectRoot: string; target?: ArtifactTargetType | "packageModel"; outDir?: string};
const service = new StudioArtifactBuildService(request.pokieVersion, undefined, undefined, undefined, undefined, request.runtimePackageRoot);
let operation: Promise<unknown>;
if (request.target === "packageModel") operation = new PackageBlueprintExtraction().extract(request.projectRoot);
else if (request.target === undefined) operation = service.listTargets(request.projectRoot);
else operation = service.preparePreview(request.projectRoot, request.target, request.outDir);
operation.then(
    result => parentPort!.postMessage({result}),
    (error: unknown) => parentPort!.postMessage({error: error instanceof Error ? error.message : String(error)}),
);
